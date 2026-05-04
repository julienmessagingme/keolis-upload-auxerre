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

module.exports = { listDashboards, SCHOOL_SLUG };
