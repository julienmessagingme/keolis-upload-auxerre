const { createClient } = require('@supabase/supabase-js');

// Polyfill WebSocket : Node 20 (image alpine) n'a pas WebSocket natif, et
// @supabase/supabase-js v2.105+ le requiert meme quand on n'utilise pas
// realtime. On l'attache au global avant la creation du client.
if (typeof globalThis.WebSocket === 'undefined') {
  try {
    globalThis.WebSocket = require('ws');
  } catch (e) {
    // ws absent : le client Supabase plantera au premier appel reseau,
    // mais on laisse passer pour ne pas bloquer le boot du process.
  }
}

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
