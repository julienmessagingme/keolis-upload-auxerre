const { getSupabase } = require('../../services/supabase.service');
const { syncAuxerre, SCHOOL_SLUG } = require('./sync.service');

/**
 * GET /api/stats/custom-events?from=YYYY-MM-DD&to=YYYY-MM-DD
 * Renvoie la liste des events MessagingMe pour Auxerre, avec count
 * d'occurrences sur la periode demandee + etat de sync par event.
 */
async function listCustomEvents(req, res, next) {
  try {
    const { from, to } = parseDateRange(req.query);
    const sb = getSupabase();

    const { data: events, error } = await sb
      .from('mm_events')
      .select('event_ns, name, description')
      .eq('school_slug', SCHOOL_SLUG)
      .order('name');
    if (error) throw error;

    const { fromUtc, toUtc } = isoBoundsParis(from, to);

    const counts = await Promise.all(
      (events || []).map(async (ev) => {
        const { count } = await sb
          .from('mm_occurrences')
          .select('*', { count: 'exact', head: true })
          .eq('school_slug', SCHOOL_SLUG)
          .eq('event_ns', ev.event_ns)
          .gte('occurred_at', fromUtc)
          .lte('occurred_at', toUtc);
        return { ...ev, count: count ?? 0 };
      })
    );

    const { data: syncs } = await sb
      .from('mm_sync_state')
      .select('event_ns, last_run_at, last_run_status, last_run_error')
      .eq('school_slug', SCHOOL_SLUG);

    res.json({ events: counts, syncs: syncs ?? [] });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/stats/custom-events/:event_ns/daily?from=YYYY-MM-DD&to=YYYY-MM-DD
 * Renvoie une serie [{ day: 'YYYY-MM-DD', count: int }] pour le chart.
 */
async function dailyCustomEvent(req, res, next) {
  try {
    const { from, to } = parseDateRange(req.query);
    const eventNs = req.params.event_ns;
    if (!eventNs) return res.status(400).json({ error: 'event_ns manquant' });

    const sb = getSupabase();
    const { fromUtc, toUtc } = isoBoundsParis(from, to);

    const { data, error } = await sb
      .from('mm_occurrences')
      .select('occurred_at')
      .eq('school_slug', SCHOOL_SLUG)
      .eq('event_ns', eventNs)
      .gte('occurred_at', fromUtc)
      .lte('occurred_at', toUtc);
    if (error) throw error;

    // Group by day Europe/Paris
    const byDay = new Map();
    for (const row of data || []) {
      const day = parisDay(row.occurred_at);
      byDay.set(day, (byDay.get(day) || 0) + 1);
    }

    // Fill missing days with 0
    const series = fillRange(from, to, byDay);
    res.json({ event_ns: eventNs, series });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/stats/admin/sync — session-auth (requireAuth+requireAdmin)
 * Resync manuel via UI.
 */
async function adminSync(req, res, next) {
  try {
    const result = await syncAuxerre();
    res.json({ ok: true, ...result });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/stats/cron/sync — bearer-auth (INTERNAL_API_KEY)
 * Endpoint fallback pour cron externe si node-cron interne plante.
 */
async function cronSync(req, res, next) {
  try {
    const auth = req.headers.authorization || '';
    const expected = `Bearer ${process.env.INTERNAL_API_KEY || ''}`;
    if (!process.env.INTERNAL_API_KEY || auth !== expected) {
      return res.status(401).json({ error: 'unauth' });
    }
    const result = await syncAuxerre();
    res.json({ ok: true, ...result });
  } catch (err) {
    next(err);
  }
}

// --- Helpers ---
function parseDateRange(q) {
  const re = /^\d{4}-\d{2}-\d{2}$/;
  const from = q.from;
  const to = q.to;
  if (!re.test(from || '') || !re.test(to || '')) {
    const e = new Error('from/to format YYYY-MM-DD requis');
    e.status = 400;
    throw e;
  }
  return { from, to };
}

/**
 * Convertit un range YYYY-MM-DD (Europe/Paris) en bornes ISO UTC.
 * Approximation : on prend 00:00:00 UTC pour from et 23:59:59.999 UTC pour to.
 * Cela inclut potentiellement 1-2h supplementaires aux extremites selon la DST,
 * mais c'est plus tolerant (on n'exclut jamais d'evenements legitimes).
 */
function isoBoundsParis(from, to) {
  const fromUtc = `${from}T00:00:00.000Z`;
  const toUtc = `${to}T23:59:59.999Z`;
  return { fromUtc, toUtc };
}

/**
 * Convertit un timestamp UTC en jour Europe/Paris (YYYY-MM-DD).
 * Utilise Intl.DateTimeFormat pour un calcul DST-correct.
 */
function parisDay(isoTimestamp) {
  const d = new Date(isoTimestamp);
  // fr-CA donne le format YYYY-MM-DD nativement
  return new Intl.DateTimeFormat('fr-CA', {
    timeZone: 'Europe/Paris',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);
}

function fillRange(from, to, byDay) {
  const out = [];
  const start = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const day = d.toISOString().slice(0, 10);
    out.push({ day, count: byDay.get(day) || 0 });
  }
  return out;
}

module.exports = { listCustomEvents, dailyCustomEvent, adminSync, cronSync };
