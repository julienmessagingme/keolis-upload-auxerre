const { getSupabase } = require('../../services/supabase.service');
const { MessagingMeClient } = require('./messagingme.client');

const SCHOOL_SLUG = 'auxerre';

/**
 * Sync incremental des custom events MessagingMe vers Supabase.
 * Pour chaque event :
 *   1. Upsert le catalogue dans mm_events.
 *   2. Recupere le watermark (last_occurrence_id) depuis mm_sync_state.
 *   3. Itere les occurrences (most-recent-first), insere celles dont
 *      id > watermark, s'arrete des qu'on rencontre id <= watermark.
 *   4. Met a jour mm_sync_state (nouveau watermark + last_run_at + status).
 *
 * Idempotent : run plusieurs fois ne duplique pas les rows
 * (PRIMARY KEY (school_slug, id) + ignoreDuplicates).
 *
 * @returns {Promise<{ events: number, occurrences: number, errors: number }>}
 */
async function syncAuxerre() {
  const token = process.env.MM_TOKEN_AUXERRE;
  const base = process.env.MESSAGINGME_BASE;
  if (!token || !base) {
    throw new Error('MM_TOKEN_AUXERRE ou MESSAGINGME_BASE manquant');
  }

  const sb = getSupabase();
  const client = new MessagingMeClient(token, base);

  const result = { events: 0, occurrences: 0, errors: 0 };

  const events = await client.listEvents();
  result.events = events.length;

  if (events.length > 0) {
    const { error } = await sb.from('mm_events').upsert(
      events.map((e) => ({
        school_slug: SCHOOL_SLUG,
        event_ns: e.event_ns,
        name: e.name,
        description: e.description ?? null,
        text_label: e.text_label ?? null,
        price_label: e.price_label ?? null,
        number_label: e.number_label ?? null,
        last_synced_at: new Date().toISOString(),
      })),
      { onConflict: 'school_slug,event_ns' }
    );
    if (error) throw new Error(`upsert mm_events failed: ${error.message}`);
  }

  for (const ev of events) {
    try {
      const inserted = await syncEventOccurrences(sb, client, ev.event_ns);
      result.occurrences += inserted;
      await sb.from('mm_sync_state').upsert(
        {
          school_slug: SCHOOL_SLUG,
          event_ns: ev.event_ns,
          last_run_at: new Date().toISOString(),
          last_run_status: 'ok',
          last_run_error: null,
        },
        { onConflict: 'school_slug,event_ns' }
      );
    } catch (err) {
      result.errors++;
      console.error(JSON.stringify({
        level: 'error', msg: 'sync event failed',
        event_ns: ev.event_ns, err: err.message,
      }));
      await sb.from('mm_sync_state').upsert(
        {
          school_slug: SCHOOL_SLUG,
          event_ns: ev.event_ns,
          last_run_at: new Date().toISOString(),
          last_run_status: 'error',
          last_run_error: err.message,
        },
        { onConflict: 'school_slug,event_ns' }
      );
    }
  }

  return result;
}

async function syncEventOccurrences(sb, client, eventNs) {
  const { data: state } = await sb
    .from('mm_sync_state')
    .select('last_occurrence_id')
    .eq('school_slug', SCHOOL_SLUG)
    .eq('event_ns', eventNs)
    .maybeSingle();
  const watermark = state?.last_occurrence_id ?? 0;

  let inserted = 0;
  let newWatermark = watermark;

  for await (const batch of client.iterOccurrences(eventNs)) {
    const fresh = batch.filter((o) => Number(o.id) > watermark);
    if (fresh.length === 0) {
      // les rows >watermark sont epuisees pour cet event
      break;
    }

    const rows = fresh.map((o) => ({
      id: Number(o.id),
      school_slug: SCHOOL_SLUG,
      event_ns: eventNs,
      user_ns: o.user_ns ?? null,
      text_value: o.text_value ?? null,
      price_value: o.price_value != null ? Number(o.price_value) : null,
      number_value: o.number_value != null ? Number(o.number_value) : null,
      occurred_at: o.occurred_at,
    }));

    const { error } = await sb.from('mm_occurrences').upsert(rows, {
      onConflict: 'school_slug,id',
      ignoreDuplicates: true,
    });
    if (error) throw new Error(`upsert mm_occurrences: ${error.message}`);

    inserted += rows.length;
    const maxIdInBatch = Math.max(...rows.map((r) => r.id));
    if (maxIdInBatch > newWatermark) newWatermark = maxIdInBatch;

    // Si la batch contenait des rows <= watermark melees, on arrete
    // (la suite des pages contient des rows encore plus anciennes)
    if (fresh.length < batch.length) break;
  }

  if (newWatermark > watermark) {
    await sb.from('mm_sync_state').upsert(
      {
        school_slug: SCHOOL_SLUG,
        event_ns: eventNs,
        last_occurrence_id: newWatermark,
      },
      { onConflict: 'school_slug,event_ns' }
    );
  }

  return inserted;
}

module.exports = { syncAuxerre, SCHOOL_SLUG };
