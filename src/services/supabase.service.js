const { createClient } = require('@supabase/supabase-js');

let cachedClient = null;

/**
 * Retourne un client Supabase service-role (bypass RLS) singleton.
 * Lazy-init pour ne pas casser le boot si SUPABASE_URL n'est pas (encore) defini
 * pendant un dev local sans .env stats.
 */
function getSupabase() {
  if (cachedClient) return cachedClient;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY manquant dans .env');
  }
  cachedClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cachedClient;
}

module.exports = { getSupabase };
