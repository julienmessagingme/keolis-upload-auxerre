const { getSupabase } = require('../../services/supabase.service');

const SCHOOL_SLUG = 'auxerre';

/**
 * Liste les dashboards d'un user (du plus recent modifie au plus ancien).
 * Scope : school_slug='auxerre' AND created_by=userUuid (defense en profondeur).
 */
async function listDashboards(userUuid) {
  const sb = getSupabase();
  const { data, error } = await sb
    .from('dashboards')
    .select('id, name, type, date_preset, date_from, date_to, created_at, updated_at')
    .eq('school_slug', SCHOOL_SLUG)
    .eq('created_by', userUuid)
    .order('updated_at', { ascending: false });
  if (error) throw new Error(`listDashboards: ${error.message}`);
  return data ?? [];
}

/**
 * Cree un nouveau tableau vide (pas de steps initiaux, juste un nom).
 * Renvoie l'id du tableau cree.
 */
async function createDashboard(userUuid, name) {
  const sb = getSupabase();
  const trimmed = String(name || '').trim();
  if (!trimmed) throw Object.assign(new Error('Nom requis'), { status: 400 });
  if (trimmed.length > 200) throw Object.assign(new Error('Nom trop long (max 200)'), { status: 400 });

  const { data, error } = await sb
    .from('dashboards')
    .insert({ school_slug: SCHOOL_SLUG, created_by: userUuid, name: trimmed })
    .select('id')
    .single();
  if (error) throw new Error(`createDashboard: ${error.message}`);
  return data.id;
}

/**
 * Retourne un tableau complet avec ses steps et leurs refs.
 * Verifie l'ownership avant de retourner les donnees (404 si pas owner).
 */
async function getDashboardWithSteps(userUuid, dashboardId) {
  const sb = getSupabase();
  const { data: dash, error: dashErr } = await sb
    .from('dashboards')
    .select('id, school_slug, created_by, name, type, date_preset, date_from, date_to, created_at, updated_at')
    .eq('id', dashboardId)
    .maybeSingle();
  if (dashErr) throw new Error(`getDashboardWithSteps: ${dashErr.message}`);
  if (!dash || dash.created_by !== userUuid || dash.school_slug !== SCHOOL_SLUG) {
    throw Object.assign(new Error('not found'), { status: 404 });
  }

  const { data: steps, error: stepsErr } = await sb
    .from('dashboard_steps')
    .select('id, position, label')
    .eq('dashboard_id', dashboardId)
    .order('position', { ascending: true });
  if (stepsErr) throw new Error(`getDashboardWithSteps steps: ${stepsErr.message}`);

  const stepIds = (steps || []).map((s) => s.id);
  let refs = [];
  if (stepIds.length > 0) {
    const { data: refsData, error: refsErr } = await sb
      .from('dashboard_step_refs')
      .select('id, step_id, ref_position, step_type, event_ns')
      .in('step_id', stepIds)
      .order('ref_position', { ascending: true });
    if (refsErr) throw new Error(`getDashboardWithSteps refs: ${refsErr.message}`);
    refs = refsData || [];
  }

  const refsByStep = new Map();
  for (const r of refs) {
    const arr = refsByStep.get(r.step_id) || [];
    arr.push({ id: r.id, ref_position: r.ref_position, step_type: r.step_type, event_ns: r.event_ns });
    refsByStep.set(r.step_id, arr);
  }

  return {
    ...dash,
    steps: (steps || []).map((s) => ({
      id: s.id, position: s.position, label: s.label,
      refs: refsByStep.get(s.id) || [],
    })),
  };
}

/**
 * Update partiel : name + steps. Si steps fourni, remplace TOUS les steps
 * existants par les nouveaux (delete cascade + insert ordonne). Validation
 * stricte. Verifie l'ownership avant chaque mutation.
 */
async function updateDashboard(userUuid, dashboardId, patch) {
  const sb = getSupabase();

  const { data: dash, error: ownErr } = await sb
    .from('dashboards')
    .select('id, created_by, school_slug')
    .eq('id', dashboardId)
    .maybeSingle();
  if (ownErr) throw new Error(`updateDashboard ownership check: ${ownErr.message}`);
  if (!dash || dash.created_by !== userUuid || dash.school_slug !== SCHOOL_SLUG) {
    throw Object.assign(new Error('not found'), { status: 404 });
  }

  const fields = { updated_at: new Date().toISOString() };
  if (patch.name !== undefined) {
    const trimmed = String(patch.name || '').trim();
    if (!trimmed) throw Object.assign(new Error('Nom requis'), { status: 400 });
    if (trimmed.length > 200) throw Object.assign(new Error('Nom trop long'), { status: 400 });
    fields.name = trimmed;
  }
  if (Object.keys(fields).length > 1) {
    const { error } = await sb.from('dashboards').update(fields).eq('id', dashboardId);
    if (error) throw new Error(`updateDashboard fields: ${error.message}`);
  }

  if (patch.steps !== undefined) {
    if (!Array.isArray(patch.steps)) throw Object.assign(new Error('steps doit etre un array'), { status: 400 });
    if (patch.steps.length > 50) throw Object.assign(new Error('Max 50 steps'), { status: 400 });

    for (let i = 0; i < patch.steps.length; i++) {
      const step = patch.steps[i];
      if (!step || !Array.isArray(step.refs) || step.refs.length === 0) {
        throw Object.assign(new Error(`Step ${i + 1} : au moins 1 ref requis`), { status: 400 });
      }
      if (step.refs.length > 20) {
        throw Object.assign(new Error(`Step ${i + 1} : max 20 refs`), { status: 400 });
      }
      for (const r of step.refs) {
        if (!r || !r.event_ns || typeof r.event_ns !== 'string') {
          throw Object.assign(new Error(`Step ${i + 1} : event_ns requis pour chaque ref`), { status: 400 });
        }
      }
    }

    // Validation cross-tenant : tous les event_ns doivent appartenir a Auxerre.
    // Empeche de poller un event_ns d'EDH meme si l'API ne renverra pas de data
    // (compute renvoie '(indisponible)' pour les event_ns inconnus, mais ca
    // pollue quand meme dashboard_step_refs).
    const allEventNs = Array.from(new Set(patch.steps.flatMap((s) => s.refs.map((r) => r.event_ns))));
    const { data: validEvents, error: valErr } = await sb
      .from('mm_events')
      .select('event_ns')
      .eq('school_slug', SCHOOL_SLUG)
      .in('event_ns', allEventNs);
    if (valErr) throw new Error(`updateDashboard validate event_ns: ${valErr.message}`);
    const validSet = new Set((validEvents || []).map((e) => e.event_ns));
    const invalid = allEventNs.filter((ns) => !validSet.has(ns));
    if (invalid.length > 0) {
      throw Object.assign(
        new Error(`event_ns invalide(s) : ${invalid.slice(0, 3).join(', ')}${invalid.length > 3 ? '…' : ''}`),
        { status: 400 }
      );
    }

    const { error: delErr } = await sb.from('dashboard_steps').delete().eq('dashboard_id', dashboardId);
    if (delErr) throw new Error(`delete steps: ${delErr.message}`);

    for (let i = 0; i < patch.steps.length; i++) {
      const step = patch.steps[i];
      const { data: stepRow, error: stepErr } = await sb
        .from('dashboard_steps')
        .insert({ dashboard_id: dashboardId, position: i, label: step.label || null })
        .select('id')
        .single();
      if (stepErr) throw new Error(`insert step ${i}: ${stepErr.message}`);

      const refRows = step.refs.map((r, ri) => ({
        step_id: stepRow.id,
        ref_position: ri,
        step_type: 'mm_event',
        event_ns: r.event_ns,
        redirect_event_id: null,
      }));
      const { error: refsErr } = await sb.from('dashboard_step_refs').insert(refRows);
      if (refsErr) throw new Error(`insert refs step ${i}: ${refsErr.message}`);
    }
  }
}

async function deleteDashboard(userUuid, dashboardId) {
  const sb = getSupabase();
  const { data: dash, error: ownErr } = await sb
    .from('dashboards')
    .select('id, created_by, school_slug')
    .eq('id', dashboardId)
    .maybeSingle();
  if (ownErr) throw new Error(`deleteDashboard ownership check: ${ownErr.message}`);
  if (!dash || dash.created_by !== userUuid || dash.school_slug !== SCHOOL_SLUG) {
    throw Object.assign(new Error('not found'), { status: 404 });
  }
  const { error } = await sb.from('dashboards').delete().eq('id', dashboardId);
  if (error) throw new Error(`deleteDashboard: ${error.message}`);
}

/**
 * Calcule les counts agreges par step pour la viz funnel.
 * Pour chaque step : count = somme des occurrences de tous ses refs sur [from, to].
 * Bornes Paris DST-correctes via Intl.DateTimeFormat.
 */
async function computeDashboardData(userUuid, dashboardId, fromDate, toDate) {
  const sb = getSupabase();

  const { data: dash, error: ownErr } = await sb
    .from('dashboards')
    .select('id, created_by, school_slug')
    .eq('id', dashboardId)
    .maybeSingle();
  if (ownErr) throw new Error(`computeDashboardData ownership check: ${ownErr.message}`);
  if (!dash || dash.created_by !== userUuid || dash.school_slug !== SCHOOL_SLUG) {
    throw Object.assign(new Error('not found'), { status: 404 });
  }

  const { fromUtc, toUtc } = isoBoundsParis(fromDate, toDate);

  const { data: steps } = await sb
    .from('dashboard_steps')
    .select('id, position, label')
    .eq('dashboard_id', dashboardId)
    .order('position', { ascending: true });

  if (!steps || steps.length === 0) {
    return { from: fromDate, to: toDate, steps: [] };
  }

  const stepIds = steps.map((s) => s.id);
  const { data: refs } = await sb
    .from('dashboard_step_refs')
    .select('id, step_id, ref_position, event_ns')
    .in('step_id', stepIds)
    .order('ref_position', { ascending: true });

  const eventNsList = Array.from(new Set((refs || []).map((r) => r.event_ns).filter(Boolean)));
  const labelByEventNs = new Map();
  if (eventNsList.length > 0) {
    const { data: events } = await sb
      .from('mm_events')
      .select('event_ns, name')
      .eq('school_slug', SCHOOL_SLUG)
      .in('event_ns', eventNsList);
    for (const e of events || []) labelByEventNs.set(e.event_ns, e.name);
  }

  const refsByStep = new Map();
  for (const r of refs || []) {
    const arr = refsByStep.get(r.step_id) || [];
    arr.push(r); refsByStep.set(r.step_id, arr);
  }

  const stepResults = await Promise.all(steps.map(async (s) => {
    const stepRefs = refsByStep.get(s.id) || [];
    const refResults = await Promise.all(stepRefs.map(async (r) => {
      if (!r.event_ns) return { ref_id: r.id, label: '(invalide)', count: 0 };
      const label = labelByEventNs.get(r.event_ns);
      if (!label) return { ref_id: r.id, label: '(indisponible)', count: 0 };
      const { count } = await sb
        .from('mm_occurrences')
        .select('*', { count: 'exact', head: true })
        .eq('school_slug', SCHOOL_SLUG)
        .eq('event_ns', r.event_ns)
        .gte('occurred_at', fromUtc)
        .lte('occurred_at', toUtc);
      return { ref_id: r.id, label, count: count ?? 0, event_ns: r.event_ns };
    }));
    const total = refResults.reduce((acc, x) => acc + x.count, 0);
    return { id: s.id, position: s.position, label: s.label, refs: refResults, total };
  }));

  return { from: fromDate, to: toDate, steps: stepResults };
}

// Helper duplique de stats.controller pour bornes UTC DST-correctes Europe/Paris.
// 12 lignes, accepte la duplication plutot que coupler stats <-> dashboards.
function parisOffsetHours(yyyymmdd) {
  const d = new Date(`${yyyymmdd}T12:00:00Z`);
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Paris', hour: '2-digit', hour12: false }).formatToParts(d);
  return parseInt(parts.find((p) => p.type === 'hour').value, 10) - 12;
}
function isoBoundsParis(from, to) {
  const fromOffset = parisOffsetHours(from);
  const toOffset = parisOffsetHours(to);
  const fromUtc = new Date(`${from}T00:00:00.000Z`); fromUtc.setUTCHours(fromUtc.getUTCHours() - fromOffset);
  const toUtc = new Date(`${to}T23:59:59.999Z`); toUtc.setUTCHours(toUtc.getUTCHours() - toOffset);
  return { fromUtc: fromUtc.toISOString(), toUtc: toUtc.toISOString() };
}

module.exports = {
  listDashboards,
  createDashboard,
  getDashboardWithSteps,
  updateDashboard,
  deleteDashboard,
  computeDashboardData,
  SCHOOL_SLUG,
};
