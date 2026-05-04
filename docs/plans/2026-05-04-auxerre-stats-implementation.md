# Auxerre Stats Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter un module Stats à Auxerre, qui sync les custom events MessagingMe (workspace Auxerre) vers Supabase et affiche leur volumétrie journalière dans une nouvelle page (filtre période, accordéons, charts), avec un onglet « Stats » dans toutes les navbars existantes.

**Architecture:** Le code Express d'Auxerre devient client de **deux** bases : SQLite locale (existant — knowledge, schedules, news, surveys) + Supabase partagé EDH (nouveau — stats uniquement, scopé `school_slug = "auxerre"`). Sync MessagingMe via `node-cron` au boot du process (daily à 22h Europe/Paris) + endpoint admin manuel + endpoint cron-bearer fallback. Frontend HTML/Tailwind/vanilla JS conservant la charte Keolis bleu existante. Charts via Chart.js CDN (déjà utilisé sur surveys.html).

**Tech Stack:** Node.js 20, Express 4, `@supabase/supabase-js` v2 (à ajouter), `node-cron` v3 (à ajouter), Chart.js 4 (CDN, déjà chargé sur surveys.html), Tailwind CSS (CDN). Pas de framework de tests dans ce projet — validation par scripts standalone + curl + browser.

**Hors scope (Plan 2 séparé) :** Module « Mes tableaux » (dashboards funnels drag-and-drop). Ce plan livre uniquement le module Stats. Une fois ce plan terminé et déployé, on enchaîne sur `2026-05-XX-auxerre-dashboards-implementation.md`.

**Préalable côté DB (déjà fait par Julien) :**
```sql
CREATE TABLE IF NOT EXISTS auxerre_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  name text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE dashboards DROP CONSTRAINT IF EXISTS dashboards_created_by_fkey;
```

Les tables `mm_events`, `mm_occurrences`, `mm_sync_state` existent déjà dans le projet Supabase EDH (cf. migration EDH `001_init.sql`).

---

## Task 1: Récupérer/générer les env vars stats et les ajouter au VPS

**Files:**
- Modify: `/home/ubuntu/keolis-auxerre/.env` (sur le VPS, via SSH — JAMAIS dans le repo)

- [ ] **Step 1: Récupérer les valeurs Supabase depuis le conteneur EDH**

```bash
ssh -i ~/.ssh/id_ed25519 ubuntu@146.59.233.252 \
  "sudo docker exec edh-app sh -c 'env | grep -E \"^(NEXT_PUBLIC_SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY)=\"'"
```

Noter en mémoire les deux valeurs (NEXT_PUBLIC_SUPABASE_URL → SUPABASE_URL côté Auxerre, SUPABASE_SERVICE_ROLE_KEY identique).

- [ ] **Step 2: Générer un `INTERNAL_API_KEY` random hex 64**

```bash
INTERNAL_KEY=$(openssl rand -hex 32) && echo "$INTERNAL_KEY"
```

Noter la valeur. Elle sera utilisée pour authentifier les appels POST `/api/stats/cron/sync` (fallback si node-cron interne plante).

- [ ] **Step 3: Ajouter les 5 nouvelles variables au `.env` du VPS**

```bash
ssh -i ~/.ssh/id_ed25519 ubuntu@146.59.233.252 "cat >> /home/ubuntu/keolis-auxerre/.env <<'EOF'

# --- Stats (Supabase EDH partagé, school_slug=auxerre) ---
SUPABASE_URL=<valeur récupérée step 1>
SUPABASE_SERVICE_ROLE_KEY=<valeur récupérée step 1>

# --- MessagingMe (sync custom-events) ---
MM_TOKEN_AUXERRE=E9ELJnoFdOT6mGxFGMlSG0hkCwBYcX8hPcwtec4siK4lRnlF7OnsnMnH80tL
MESSAGINGME_BASE=https://ai.messagingme.app/api

# --- Internal API (cron fallback bearer) ---
INTERNAL_API_KEY=<valeur générée step 2>
EOF"
```

- [ ] **Step 4: Vérifier que les 5 vars sont bien dans le `.env` final**

```bash
ssh -i ~/.ssh/id_ed25519 ubuntu@146.59.233.252 \
  "grep -E '^(SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY|MM_TOKEN_AUXERRE|MESSAGINGME_BASE|INTERNAL_API_KEY)=' /home/ubuntu/keolis-auxerre/.env | wc -l"
```
Expected output : `5`

- [ ] **Step 5: Mettre à jour la mémoire projet `env_vars_vps.md`** avec les nouvelles valeurs effectives (remplacer les `<récup...>` par les vraies valeurs).

- [ ] **Step 6: Pas de commit (rien dans le repo n'a changé). Le rebuild Docker se fera au Task 12 quand on aura besoin des vars dans le runtime.**

---

## Task 2: Installer @supabase/supabase-js + créer le client singleton

**Files:**
- Modify: `package.json` (add dep)
- Create: `src/services/supabase.service.js`

- [ ] **Step 1: Installer le package**

```bash
cd /c/Users/julie/keolis-upload-auxerre && npm install @supabase/supabase-js@^2
```

- [ ] **Step 2: Créer `src/services/supabase.service.js`**

```js
const { createClient } = require('@supabase/supabase-js');

let cachedClient = null;

/**
 * Retourne un client Supabase service-role (bypass RLS) singleton.
 * Lazy-init pour ne pas casser le boot si SUPABASE_URL n'est pas (encore) défini
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
```

- [ ] **Step 3: Vérifier que ça parse sans crash**

```bash
node -e "require('./src/services/supabase.service.js'); console.log('OK')"
```
Expected output : `OK`

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json src/services/supabase.service.js
git -c user.name="julienmessagingme" -c user.email="203261261+julienmessagingme@users.noreply.github.com" commit -m "$(cat <<'EOF'
feat(stats): ajoute client Supabase singleton (service-role)

Lazy-init pour ne pas casser le boot si vars manquantes en dev. Utilise par
le module stats a venir (sync MessagingMe + queries custom events).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

NE PAS push tout de suite — on regroupera plusieurs tasks dans le même push pour ne pas spammer les déploiements.

---

## Task 3: Créer le client MessagingMe (listEvents + iterOccurrences)

**Files:**
- Create: `src/features/stats/messagingme.client.js`

- [ ] **Step 1: Créer le dossier feature et le client**

```bash
mkdir -p src/features/stats
```

```js
// src/features/stats/messagingme.client.js
/**
 * Client API MessagingMe pour récupérer les custom events Auxerre.
 * Port simplifié de EDH/src/lib/messagingme/client.ts (vanilla JS, sans types).
 *
 * Usage :
 *   const c = new MessagingMeClient(token, base);
 *   const events = await c.listEvents();
 *   for await (const batch of c.iterOccurrences(eventNs)) { ... }
 */
class MessagingMeClient {
  constructor(token, base) {
    if (!token) throw new Error('MessagingMeClient: token manquant');
    if (!base) throw new Error('MessagingMeClient: base URL manquante');
    this.token = token;
    this.base = base.replace(/\/+$/, '');
  }

  async _fetch(url, attempt = 1) {
    const r = await fetch(url, {
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: 'application/json',
      },
    });
    if (r.ok) return r;
    // Retry 5xx + 429 jusqu'à 3 fois avec backoff exponentiel
    if ((r.status >= 500 || r.status === 429) && attempt < 3) {
      const wait = 500 * Math.pow(2, attempt - 1);
      await new Promise((res) => setTimeout(res, wait));
      return this._fetch(url, attempt + 1);
    }
    throw new Error(`MessagingMe HTTP ${r.status} on ${url}`);
  }

  async listEvents() {
    const all = [];
    let page = 1;
    while (true) {
      const r = await this._fetch(`${this.base}/flow/custom-events?page=${page}`);
      const j = await r.json();
      all.push(...(j.data || []));
      if (!j.meta || j.meta.current_page >= j.meta.last_page) break;
      page++;
      if (page > 200) throw new Error('listEvents: pagination > 200, abort');
    }
    return all;
  }

  /**
   * Itère les occurrences d'un event, page par page (most-recent-first).
   * yield un array d'occurrences par page.
   */
  async *iterOccurrences(eventNs) {
    let page = 1;
    while (true) {
      const url = `${this.base}/flow/custom-events/data?event_ns=${encodeURIComponent(eventNs)}&page=${page}`;
      const r = await this._fetch(url);
      const j = await r.json();
      const data = j.data || [];
      if (data.length === 0) break;
      yield data;
      if (!j.meta || j.meta.current_page >= j.meta.last_page) break;
      page++;
      if (page > 1000) throw new Error('iterOccurrences: pagination > 1000, abort');
    }
  }
}

module.exports = { MessagingMeClient };
```

- [ ] **Step 2: Test standalone (script éphémère, pas committé)**

```bash
node -e "
require('dotenv').config();
const { MessagingMeClient } = require('./src/features/stats/messagingme.client');
const c = new MessagingMeClient(process.env.MM_TOKEN_AUXERRE, process.env.MESSAGINGME_BASE);
c.listEvents().then(events => {
  console.log('events count:', events.length);
  console.log('sample:', events[0]);
}).catch(e => { console.error(e); process.exit(1); });
"
```

Note : ce test ne marche qu'en local si on a un `.env` local. Sinon on testera après le déploiement via les logs Docker. Si pas de `.env` local, **passer le step**.

Expected output (si `.env` local présent) : un nombre d'events > 0 et un sample object avec les champs `event_ns`, `name`, etc. Si HTTP 401 : token invalide. Si 0 events : workspace MessagingMe Auxerre vide (à confirmer avec Julien).

- [ ] **Step 3: Commit**

```bash
git add src/features/stats/messagingme.client.js
git -c user.name="julienmessagingme" -c user.email="203261261+julienmessagingme@users.noreply.github.com" commit -m "$(cat <<'EOF'
feat(stats): ajoute client MessagingMe (listEvents + iterOccurrences)

Pagination jusqu'a last_page, retry 3x sur 5xx/429 avec backoff exponentiel.
Port vanilla de EDH/src/lib/messagingme/client.ts.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Créer le service de sync (incrémental avec watermark)

**Files:**
- Create: `src/features/stats/sync.service.js`

- [ ] **Step 1: Créer `sync.service.js`**

```js
// src/features/stats/sync.service.js
const { getSupabase } = require('../../services/supabase.service');
const { MessagingMeClient } = require('./messagingme.client');

const SCHOOL_SLUG = 'auxerre';

/**
 * Sync incrémental des custom events MessagingMe vers Supabase.
 * Pour chaque event :
 *   1. Upsert le catalogue dans mm_events.
 *   2. Récupère le watermark (last_occurrence_id) depuis mm_sync_state.
 *   3. Itère les occurrences (most-recent-first), insère celles dont
 *      id > watermark, s'arrête dès qu'on rencontre id <= watermark.
 *   4. Met à jour mm_sync_state (nouveau watermark + last_run_at + status).
 *
 * Idempotent : run plusieurs fois ne duplique pas les rows
 * (PRIMARY KEY (school_slug, id) + ON CONFLICT DO NOTHING).
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

    // Si la batch contenait des rows <= watermark mêlées, on arrête
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
```

- [ ] **Step 2: Vérifier que ça parse**

```bash
node -e "require('./src/features/stats/sync.service.js'); console.log('OK')"
```
Expected : `OK`

- [ ] **Step 3: Commit**

```bash
git add src/features/stats/sync.service.js
git -c user.name="julienmessagingme" -c user.email="203261261+julienmessagingme@users.noreply.github.com" commit -m "$(cat <<'EOF'
feat(stats): ajoute sync incremental MessagingMe -> Supabase

syncAuxerre() :
- Upsert catalogue mm_events (renames/desc propages, deletions ignorees).
- Pour chaque event, sync incremental des occurrences via watermark
  (last_occurrence_id dans mm_sync_state).
- Idempotent (PK composite + ignoreDuplicates).
- Tracage status/error dans mm_sync_state pour debug ops.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: User mapping Auxerre → Supabase au login

**Files:**
- Modify: `src/features/auth/auth.service.js` (ajouter méthode `upsertAuxerreUser` à la classe `AuthService`)
- Modify: `src/features/auth/auth.controller.js:200-214` (appeler upsert avant `regenerate`, étendre `req.session.user` avec `userUuid`)

**Contexte du code existant (vérifié) :**
- `auth.service.js` exporte `module.exports = new AuthService()` (classe).
- `auth.controller.js` exporte `module.exports = new AuthController()` (classe).
- La session est posée à la ligne 210 dans le callback `regenerate` :
  ```js
  req.session.user = { id: user.id, email: user.email, role: user.role };
  ```

- [ ] **Step 1: Ajouter la méthode `upsertAuxerreUser` à `AuthService`**

En haut de `src/features/auth/auth.service.js`, ajouter avec les autres requires :

```js
const { getSupabase } = require('../../services/supabase.service');
```

Puis ajouter cette méthode dans la classe `AuthService` (n'importe où entre les autres méthodes) :

```js
  /**
   * Upsert l'user Auxerre dans la table Supabase auxerre_users (separee des
   * users EDH). Retourne le uuid stable a stocker dans la session Express,
   * utilise comme created_by dans dashboards (Plan 2 a venir).
   *
   * Tolerant aux pannes Supabase : si l'upsert echoue, log + retourne null.
   * Le login Auxerre continue a marcher.
   */
  async upsertAuxerreUser(email, name) {
    try {
      const sb = getSupabase();
      const { data, error } = await sb
        .from('auxerre_users')
        .upsert({ email, name: name ?? null }, { onConflict: 'email' })
        .select('id')
        .single();
      if (error) throw error;
      return data.id;
    } catch (err) {
      console.error(JSON.stringify({
        level: 'warn', msg: 'upsertAuxerreUser failed',
        email, err: err.message,
      }));
      return null;
    }
  }
```

- [ ] **Step 2: Appeler `upsertAuxerreUser` dans le handler de login**

Dans `src/features/auth/auth.controller.js`, modifier le bloc autour des lignes 200-214. Avant l'appel à `req.session.regenerate(...)`, ajouter :

```js
// Mapper l'user Auxerre vers Supabase (uuid stable pour les stats / Mes tableaux)
const userUuid = await authService.upsertAuxerreUser(user.email, user.name || null);
```

Puis dans le callback `regenerate`, modifier la ligne 210-214 pour ajouter `userUuid` :

```js
req.session.user = {
  id: user.id,
  email: user.email,
  role: user.role,
  userUuid,  // null si Supabase indisponible — n'empeche pas le login
};
```

(Vérifier que `authService` est bien importé en haut du fichier — il devrait l'être déjà puisque le controller utilise `authService.createInvitation` etc.)

- [ ] **Step 3: Vérifier que les deux fichiers parsent**

```bash
node -e "require('./src/features/auth/auth.service.js'); require('./src/features/auth/auth.controller.js'); console.log('OK')"
```
Expected : `OK` (peut planter si SUPABASE vars manquantes en local — c'est OK si le require ne déclenche pas le getSupabase au chargement, vérifier).

- [ ] **Step 4: Commit**

```bash
git add src/features/auth/auth.service.js src/features/auth/auth.controller.js
git -c user.name="julienmessagingme" -c user.email="203261261+julienmessagingme@users.noreply.github.com" commit -m "$(cat <<'EOF'
feat(stats): mappe user Auxerre vers Supabase auxerre_users au login

Ajoute methode AuthService.upsertAuxerreUser() qui upsert l'utilisateur
dans la table auxerre_users (Supabase EDH partage) et retourne son uuid.

Au login (auth.controller.js:200-214), appel avant session.regenerate ;
le uuid est stocke dans req.session.user.userUuid. Sera utilise comme
created_by quand on attaquera Mes tableaux.

Tolerant aux pannes Supabase : si l'upsert echoue, le login fonctionne
normalement, userUuid = null (les stats seront juste inaccessibles
tant que la connexion Supabase n'est pas reparee).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Installer node-cron + démarrer le scheduler au boot

**Files:**
- Modify: `package.json` (add dep)
- Create: `src/features/stats/cron.js`
- Modify: `src/server.js` (lancer le scheduler au boot)

- [ ] **Step 1: Installer node-cron**

```bash
npm install node-cron@^3
```

- [ ] **Step 2: Créer `src/features/stats/cron.js`**

```js
const cron = require('node-cron');
const { syncAuxerre } = require('./sync.service');

const SCHEDULE = '0 22 * * *'; // tous les jours à 22h00 Europe/Paris
const TZ = 'Europe/Paris';

/**
 * Lance le cron de sync MessagingMe au boot du process.
 * Idempotent : appeler plusieurs fois ne crée pas plusieurs schedules
 * (on utilise une variable module pour mémoriser).
 */
let started = false;

function startStatsCron() {
  if (started) return;
  started = true;

  cron.schedule(SCHEDULE, async () => {
    console.log(JSON.stringify({ level: 'info', msg: 'stats cron tick: syncAuxerre start' }));
    try {
      const result = await syncAuxerre();
      console.log(JSON.stringify({ level: 'info', msg: 'syncAuxerre done', ...result }));
    } catch (err) {
      console.error(JSON.stringify({
        level: 'error', msg: 'syncAuxerre fatal',
        err: err.message,
      }));
    }
  }, { timezone: TZ });

  console.log(JSON.stringify({
    level: 'info', msg: 'stats cron scheduled',
    schedule: SCHEDULE, timezone: TZ,
  }));
}

module.exports = { startStatsCron };
```

- [ ] **Step 3: Lancer le scheduler dans `src/server.js`**

Lire d'abord `src/server.js` pour repérer où le serveur Express est `.listen()`. Ajouter juste avant ou après le listen :

```js
// Démarrer le cron de sync stats (après le listen pour ne pas bloquer le boot)
const { startStatsCron } = require('./features/stats/cron');
startStatsCron();
```

- [ ] **Step 4: Vérifier le boot local (optionnel — sans .env local complet ça crash, mais on vérifie au moins le parsing)**

```bash
node -e "require('./src/features/stats/cron.js'); console.log('OK')"
```

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json src/features/stats/cron.js src/server.js
git -c user.name="julienmessagingme" -c user.email="203261261+julienmessagingme@users.noreply.github.com" commit -m "$(cat <<'EOF'
feat(stats): ajoute cron node-cron pour sync nocturne MessagingMe

Schedule '0 22 * * *' Europe/Paris (meme cadence que EDH).
Demarre au boot du process (server.js) apres le listen Express.
Idempotent : double appel a startStatsCron() ne cree pas 2 schedules.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Créer le module feature stats (controller + routes + index)

**Files:**
- Create: `src/features/stats/stats.controller.js`
- Create: `src/features/stats/stats.routes.js`
- Create: `src/features/stats/index.js`

- [ ] **Step 1: Créer `stats.controller.js` (squelette des handlers, vide pour l'instant)**

```js
// src/features/stats/stats.controller.js
const { getSupabase } = require('../../services/supabase.service');
const { syncAuxerre, SCHOOL_SLUG } = require('./sync.service');

/**
 * GET /api/stats/custom-events?from=YYYY-MM-DD&to=YYYY-MM-DD
 * Renvoie la liste des events MessagingMe pour Auxerre, avec count
 * d'occurrences sur la période demandée + état de sync par event.
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
 * Pas DST-aware exact comme EDH ; pour Auxerre on accepte une legere
 * imprecision aux changements d'heure (1-2 evenements possiblement
 * dans le mauvais bucket 2x/an).
 */
function isoBoundsParis(from, to) {
  // Approximation : Europe/Paris = UTC+1 (hiver) ou UTC+2 (été).
  // On utilise UTC+1 fixe + 1h de marge des deux côtés pour couvrir l'été.
  const fromUtc = `${from}T00:00:00.000Z`;       // 00:00 UTC = 01:00 Paris (hiver)
  const toUtc = `${to}T23:59:59.999Z`;
  return { fromUtc, toUtc };
}

function parisDay(isoTimestamp) {
  // Convert UTC to Europe/Paris day
  const d = new Date(isoTimestamp);
  // Approximation simple : on ajoute 1h (UTC+1 hiver) ou 2h (UTC+2 été)
  // selon le mois. C'est suffisant pour l'usage stats.
  const month = d.getUTCMonth(); // 0=Jan, 11=Dec
  // Heure d'été en France : dernier dim de mars -> dernier dim d'octobre
  const isSummer = month >= 3 && month <= 9;
  const offsetHours = isSummer ? 2 : 1;
  d.setUTCHours(d.getUTCHours() + offsetHours);
  return d.toISOString().slice(0, 10);
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
```

- [ ] **Step 2: Créer `stats.routes.js`**

```js
// src/features/stats/stats.routes.js
const router = require('express').Router();
const ctrl = require('./stats.controller');
const { requireAuth, requireAdmin } = require('../../middleware');

// GET routes — session auth
router.get('/custom-events', requireAuth, ctrl.listCustomEvents);
router.get('/custom-events/:event_ns/daily', requireAuth, ctrl.dailyCustomEvent);

// POST resync manuel — admin only
router.post('/admin/sync', requireAuth, requireAdmin, ctrl.adminSync);

// POST cron fallback — bearer auth dans le controller (pas de middleware)
router.post('/cron/sync', ctrl.cronSync);

module.exports = router;
```

- [ ] **Step 3: Créer `index.js`**

```js
// src/features/stats/index.js
module.exports = {
  routes: require('./stats.routes'),
};
```

- [ ] **Step 4: Vérifier le parsing**

```bash
node -e "require('./src/features/stats/index.js'); console.log('OK')"
```

- [ ] **Step 5: Commit**

```bash
git add src/features/stats/stats.controller.js src/features/stats/stats.routes.js src/features/stats/index.js
git -c user.name="julienmessagingme" -c user.email="203261261+julienmessagingme@users.noreply.github.com" commit -m "$(cat <<'EOF'
feat(stats): ajoute API stats (custom-events list + daily series)

Routes :
- GET /api/stats/custom-events?from&to  (events + counts + sync state)
- GET /api/stats/custom-events/:event_ns/daily?from&to  (serie journaliere)
- POST /api/stats/admin/sync  (resync manuel, requireAdmin)
- POST /api/stats/cron/sync  (bearer INTERNAL_API_KEY, fallback externe)

Helpers integres : parseDateRange, isoBoundsParis (approximation DST),
parisDay (groupage journalier), fillRange (zero-fill jours manquants).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Enregistrer le module stats dans app.js

**Files:**
- Modify: `src/app.js`

- [ ] **Step 1: Lire `src/app.js` pour repérer la zone d'enregistrement des features**

```bash
grep -n "require.*features\|app.use.*api" src/app.js
```

- [ ] **Step 2: Ajouter l'import et le montage**

Dans `src/app.js` :
- Ajouter avec les autres imports `const statsFeature = require('./features/stats');`
- Ajouter avec les autres `app.use` : `app.use('/api/stats', statsFeature.routes);`

(Suivre l'ordre alphabétique ou le pattern existant.)

- [ ] **Step 3: Vérifier que `app.js` parse**

```bash
node -e "require('./src/app.js'); console.log('OK')"
```

(Note : peut crash si .env vars stats manquantes en local — c'est normal et toléré, le check est purement syntaxique.)

- [ ] **Step 4: Commit**

```bash
git add src/app.js
git -c user.name="julienmessagingme" -c user.email="203261261+julienmessagingme@users.noreply.github.com" commit -m "$(cat <<'EOF'
feat(stats): monte le module stats sur /api/stats dans app.js

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Push, déploiement, premier sync manuel pour amorcer la DB

**Files:** aucun fichier modifié dans ce task — c'est un task d'opérations.

- [ ] **Step 1: Push sur GitHub (déclenche le workflow)**

```bash
GIT_SSH_COMMAND="ssh -i ~/.ssh/id_ed25519" git push origin main
```

- [ ] **Step 2: Suivre le workflow**

```bash
RUN_ID=$(gh run list --repo julienmessagingme/keolis-upload-auxerre --limit 1 --json databaseId --jq '.[0].databaseId')
gh run watch "$RUN_ID" --repo julienmessagingme/keolis-upload-auxerre --exit-status
```

Expected : workflow termine en ~30s, status `completed success`.

- [ ] **Step 3: Vérifier que le conteneur a redémarré avec les nouvelles vars**

```bash
ssh -i ~/.ssh/id_ed25519 ubuntu@146.59.233.252 \
  "sudo docker exec keolis-auxerre sh -c 'env | grep -E \"^(SUPABASE_URL|MM_TOKEN_AUXERRE|INTERNAL_API_KEY)\" | wc -l'"
```
Expected : `3`

- [ ] **Step 4: Déclencher le premier sync manuel via l'endpoint cron-bearer**

```bash
INTERNAL_KEY=$(ssh -i ~/.ssh/id_ed25519 ubuntu@146.59.233.252 \
  "grep ^INTERNAL_API_KEY= /home/ubuntu/keolis-auxerre/.env | cut -d= -f2-")
curl -X POST https://keolisauxerre.messagingme.app/api/stats/cron/sync \
  -H "Authorization: Bearer $INTERNAL_KEY" \
  -H "Content-Type: application/json"
```

Expected output JSON : `{"ok":true,"events":N,"occurrences":M,"errors":0}` avec N et M > 0.

Si `events: 0` : workspace MessagingMe Auxerre vide ou token invalide → debug avec `docker logs keolis-auxerre`.

Si erreur 500 → `docker logs --tail 50 keolis-auxerre` pour voir le message d'exception.

- [ ] **Step 5: Vérifier dans Supabase que les rows sont arrivées**

```bash
ssh -i ~/.ssh/id_ed25519 ubuntu@146.59.233.252 \
  "sudo docker exec keolis-auxerre node -e \"
  const { getSupabase } = require('./src/services/supabase.service');
  (async () => {
    const sb = getSupabase();
    const { count: ev } = await sb.from('mm_events').select('*', {count:'exact',head:true}).eq('school_slug','auxerre');
    const { count: oc } = await sb.from('mm_occurrences').select('*', {count:'exact',head:true}).eq('school_slug','auxerre');
    console.log('events:', ev, 'occurrences:', oc);
  })().catch(e => { console.error(e); process.exit(1); });
  \""
```

Expected : nombres > 0 cohérents avec ce que retournait l'endpoint cron-bearer.

- [ ] **Step 6: Pas de commit (juste vérifications ops)**

---

## Task 10: Ajouter le lien « Stats » dans toutes les navbars existantes

**Files:**
- Modify: `public/admin.html`
- Modify: `public/index.html`
- Modify: `public/knowledge.html`
- Modify: `public/news.html`
- Modify: `public/surveys.html`

Le pattern est identique dans les 5 fichiers. La navbar contient déjà `News`, `Fiches Horaires`, `Base de Connaissances`, `Enquêtes Qualité`, `Administration`. On ajoute `Stats` juste avant `Administration`.

- [ ] **Step 1: Lire la navbar de news.html pour avoir l'icône standard**

```bash
grep -n "Enquêtes Qualité" public/news.html
```

(On a déjà vu ce pattern lors de l'audit — l'icône est un SVG `path d="M11.049 2.927..."` étoile.)

- [ ] **Step 2: Modifier `public/news.html`**

Remplacer le bloc `Administration` par : (Stats AVANT Administration) :

```html
<a href="/stats.html" class="text-white px-4 py-2 rounded-lg font-semibold hover:bg-white hover:bg-opacity-10 transition-all flex items-center gap-2">
    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path>
    </svg>
    Stats
</a>
<a href="/admin.html" class="text-white px-4 py-2 rounded-lg font-semibold hover:bg-white hover:bg-opacity-10 transition-all flex items-center gap-2">
    <!-- (le bloc Administration existant inchange) -->
```

- [ ] **Step 3: Répéter pour les 4 autres pages (admin.html, index.html, knowledge.html, surveys.html)**

Pour chaque fichier, ajouter le même `<a href="/stats.html">...</a>` au même endroit dans la navbar (juste avant le lien Administration).

Pour la page courante (Stats elle-même quand elle existera), elle aura un style "active" (`bg-white bg-opacity-20`). Pas besoin maintenant — Task 11 le gérera.

- [ ] **Step 4: Vérification visuelle après deploy (Task 13)**

- [ ] **Step 5: Commit**

```bash
git add public/admin.html public/index.html public/knowledge.html public/news.html public/surveys.html
git -c user.name="julienmessagingme" -c user.email="203261261+julienmessagingme@users.noreply.github.com" commit -m "$(cat <<'EOF'
feat(stats): ajoute le lien Stats dans la navbar des 5 pages existantes

Place avant Administration, icone bar-chart, meme style que les autres
liens. Cible /stats.html (page creee dans le commit suivant).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Créer la page stats.html avec filtre période + accordéons + chart

**Files:**
- Create: `public/stats.html`

- [ ] **Step 1: Lire le head et la navbar de news.html pour copier la structure (charte Keolis bleu)**

```bash
sed -n '1,70p' public/news.html
```

Identifier :
- La balise `<head>` complète (Tailwind config, fonts, etc.)
- La navbar (avec le lien Stats actif cette fois)
- Les couleurs Tailwind custom (`keolis-blue`, `keolis-light`)

- [ ] **Step 2: Créer `public/stats.html`**

```html
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Stats - Keolis Auxerre</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <script>
        tailwind.config = {
            theme: { extend: { colors: { 'keolis-blue': '#003366', 'keolis-light': '#0066cc' } } }
        }
    </script>
</head>
<body class="bg-gradient-to-br from-keolis-blue to-keolis-light min-h-screen">
    <!-- Navbar : copie de news.html avec Stats en actif -->
    <nav class="bg-keolis-blue shadow-lg sticky top-0 z-50">
        <div class="container mx-auto px-4">
            <div class="flex items-center justify-between h-16">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 bg-white rounded-lg p-1.5 flex items-center justify-center">
                        <img src="https://f003.backblazeb2.com/file/auxerre/Capture+d'%C3%A9cran+2026-02-04+171543.png" alt="Messaging Me" class="w-full h-full object-contain">
                    </div>
                    <span class="text-white text-xl font-bold">Plateforme Keolis Auxerre</span>
                </div>
                <div class="flex items-center gap-4">
                    <a href="/news.html" class="text-white px-4 py-2 rounded-lg font-semibold hover:bg-white hover:bg-opacity-10 transition-all">News</a>
                    <a href="/index.html" class="text-white px-4 py-2 rounded-lg font-semibold hover:bg-white hover:bg-opacity-10 transition-all">Fiches Horaires</a>
                    <a href="/knowledge.html" class="text-white px-4 py-2 rounded-lg font-semibold hover:bg-white hover:bg-opacity-10 transition-all">Base de Connaissances</a>
                    <a href="/surveys.html" class="text-white px-4 py-2 rounded-lg font-semibold hover:bg-white hover:bg-opacity-10 transition-all flex items-center gap-2">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"></path></svg>
                        Enquêtes Qualité
                    </a>
                    <a href="/stats.html" class="text-white bg-white bg-opacity-20 px-4 py-2 rounded-lg font-semibold flex items-center gap-2">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path></svg>
                        Stats
                    </a>
                    <a href="/admin.html" class="text-white px-4 py-2 rounded-lg font-semibold hover:bg-white hover:bg-opacity-10 transition-all flex items-center gap-2">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"></path></svg>
                        Administration
                    </a>
                    <button onclick="logout()" class="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg font-semibold transition-colors flex items-center gap-2">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path></svg>
                        Déconnexion
                    </button>
                </div>
            </div>
        </div>
    </nav>

    <div class="container mx-auto px-4 py-8 max-w-6xl">
        <!-- Header + filtre periode -->
        <div class="bg-white rounded-2xl shadow-2xl p-6 mb-6">
            <h1 class="text-2xl font-bold text-keolis-blue mb-4">Stats — Custom events MessagingMe</h1>
            <div class="flex items-end gap-3 flex-wrap">
                <div>
                    <label class="block text-sm font-semibold text-gray-700 mb-1">Du</label>
                    <input id="dateFrom" type="date" class="border rounded-lg px-3 py-2">
                </div>
                <div>
                    <label class="block text-sm font-semibold text-gray-700 mb-1">Au</label>
                    <input id="dateTo" type="date" class="border rounded-lg px-3 py-2">
                </div>
                <button onclick="setPreset(7)" class="border border-keolis-blue text-keolis-blue px-4 py-2 rounded-lg hover:bg-keolis-blue hover:text-white transition-all">7j</button>
                <button onclick="setPreset(30)" class="border border-keolis-blue text-keolis-blue px-4 py-2 rounded-lg hover:bg-keolis-blue hover:text-white transition-all">30j</button>
                <button onclick="setPreset(90)" class="border border-keolis-blue text-keolis-blue px-4 py-2 rounded-lg hover:bg-keolis-blue hover:text-white transition-all">90j</button>
                <button onclick="loadStats()" class="bg-keolis-blue hover:bg-keolis-light text-white px-4 py-2 rounded-lg font-semibold transition-colors">Charger</button>
            </div>
        </div>

        <!-- Liste accordeons -->
        <div id="eventsContainer" class="space-y-2">
            <div class="text-white text-center py-8">Chargement…</div>
        </div>

        <!-- Footer : last sync + bouton resync (admin only - desactive sinon) -->
        <div class="mt-6 bg-white rounded-2xl shadow-2xl p-4 flex items-center justify-between text-sm">
            <span id="lastSyncLabel" class="text-gray-600">Dernier sync : —</span>
            <button id="resyncBtn" onclick="manualResync()" class="text-keolis-blue hover:underline disabled:text-gray-400 disabled:no-underline" disabled>↻ Resync manuel</button>
        </div>
    </div>

    <script>
        let charts = {}; // event_ns -> Chart instance

        function setPreset(days) {
            const to = new Date();
            const from = new Date(); from.setDate(from.getDate() - days + 1);
            document.getElementById('dateFrom').value = from.toISOString().slice(0, 10);
            document.getElementById('dateTo').value = to.toISOString().slice(0, 10);
            loadStats();
        }

        async function loadStats() {
            const from = document.getElementById('dateFrom').value;
            const to = document.getElementById('dateTo').value;
            if (!from || !to) return;

            const c = document.getElementById('eventsContainer');
            c.innerHTML = '<div class="text-white text-center py-8">Chargement…</div>';

            try {
                const r = await fetch(`/api/stats/custom-events?from=${from}&to=${to}`);
                if (!r.ok) throw new Error(`HTTP ${r.status}`);
                const j = await r.json();
                renderEvents(j.events || [], from, to);
                renderSyncStatus(j.syncs || []);
            } catch (err) {
                c.innerHTML = `<div class="bg-red-100 text-red-800 p-4 rounded-lg">Erreur : ${err.message}</div>`;
            }
        }

        function renderEvents(events, from, to) {
            const c = document.getElementById('eventsContainer');
            if (events.length === 0) {
                c.innerHTML = '<div class="bg-white rounded-2xl shadow-2xl p-6 text-center text-gray-600">Aucun custom event MessagingMe pour Auxerre. Le sync nocturne tourne a 22h, ou cliquez sur Resync manuel.</div>';
                return;
            }
            c.innerHTML = events.map(ev => `
                <details class="bg-white rounded-2xl shadow-2xl overflow-hidden">
                    <summary class="px-6 py-4 cursor-pointer flex items-center justify-between hover:bg-gray-50">
                        <div>
                            <div class="font-bold text-keolis-blue">${escapeHtml(ev.name)}</div>
                            ${ev.description ? `<div class="text-sm text-gray-600">${escapeHtml(ev.description)}</div>` : ''}
                        </div>
                        <div class="text-keolis-blue font-semibold text-lg">${ev.count}</div>
                    </summary>
                    <div class="px-6 pb-6">
                        <canvas id="chart-${ev.event_ns}" height="80"></canvas>
                    </div>
                </details>
            `).join('');

            // Bind expand handler for charts
            c.querySelectorAll('details').forEach((d, i) => {
                d.addEventListener('toggle', () => {
                    if (d.open) loadDailyChart(events[i].event_ns, from, to);
                });
            });
        }

        async function loadDailyChart(eventNs, from, to) {
            if (charts[eventNs]) return; // already loaded
            const r = await fetch(`/api/stats/custom-events/${encodeURIComponent(eventNs)}/daily?from=${from}&to=${to}`);
            const j = await r.json();
            const ctx = document.getElementById(`chart-${eventNs}`).getContext('2d');
            charts[eventNs] = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: j.series.map(s => s.day),
                    datasets: [{ label: 'Occurrences', data: j.series.map(s => s.count), backgroundColor: '#003366' }]
                },
                options: { responsive: true, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } }
            });
        }

        function renderSyncStatus(syncs) {
            const lastSync = syncs.reduce((acc, s) => {
                if (!s.last_run_at) return acc;
                if (!acc || s.last_run_at > acc) return s.last_run_at;
                return acc;
            }, null);
            const errors = syncs.filter(s => s.last_run_status === 'error').length;
            const lbl = lastSync
                ? `Dernier sync : ${new Date(lastSync).toLocaleString('fr-FR')}${errors ? ` ⚠️ ${errors} erreur${errors > 1 ? 's' : ''}` : ''}`
                : 'Dernier sync : jamais';
            document.getElementById('lastSyncLabel').textContent = lbl;
        }

        async function manualResync() {
            const btn = document.getElementById('resyncBtn');
            btn.disabled = true; btn.textContent = '⏳ Sync en cours…';
            try {
                const r = await fetch('/api/stats/admin/sync', { method: 'POST' });
                if (!r.ok) throw new Error(`HTTP ${r.status}`);
                btn.textContent = '✓ Sync OK';
                setTimeout(() => loadStats(), 1000);
            } catch (err) {
                btn.textContent = `Erreur : ${err.message}`;
            }
            setTimeout(() => { btn.disabled = false; btn.textContent = '↻ Resync manuel'; }, 3000);
        }

        function escapeHtml(s) {
            return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
        }

        async function logout() {
            await fetch('/api/auth/logout', { method: 'POST' });
            window.location.href = '/login.html';
        }

        // Activer le bouton resync seulement pour les admins
        fetch('/api/auth/me').then(r => r.json()).then(u => {
            if (u && u.role === 'admin') {
                document.getElementById('resyncBtn').disabled = false;
            }
        }).catch(() => {});

        // Init : charger 30 derniers jours
        setPreset(30);
    </script>
</body>
</html>
```

- [ ] **Step 3: Créer l'endpoint `/api/auth/me` (n'existe pas dans le code actuel — vérifié)**

Dans `src/features/auth/auth.controller.js`, ajouter une méthode dans la classe `AuthController` :

```js
  /**
   * GET /api/auth/me — retourne le user de la session courante (utilise
   * cote frontend pour activer/desactiver les boutons admin-only).
   */
  me(req, res) {
    if (!req.session || !req.session.user) {
      return res.status(401).json({ error: 'unauth' });
    }
    const { id, email, role } = req.session.user;
    return res.json({ id, email, role });
  }
```

Puis dans `src/features/auth/auth.routes.js`, ajouter (avec les autres routes) :

```js
router.get('/me', authController.me.bind(authController));
```

(Adapter la syntaxe `.bind` selon le pattern existant — d'autres routes du fichier utilisent peut-être déjà `(req, res) => authController.method(req, res)` ou autre.)

- [ ] **Step 4: Vérifier que la page valide en HTML basique**

```bash
node -e "const fs = require('fs'); const c = fs.readFileSync('public/stats.html','utf8'); console.log('size:', c.length, 'has navbar:', c.includes('keolis-blue'));"
```

- [ ] **Step 5: Commit**

```bash
git add public/stats.html
git -c user.name="julienmessagingme" -c user.email="203261261+julienmessagingme@users.noreply.github.com" commit -m "$(cat <<'EOF'
feat(stats): page stats.html (custom events + filtre periode + charts)

Charte Keolis bleu conservee. Sections :
- Filtre periode (date pickers + presets 7j/30j/90j)
- Liste accordeons par custom event MessagingMe avec count sur la periode
- Chart.js bar journalier au depliement de chaque accordeon
- Footer : dernier sync + bouton resync manuel (admin only)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: Push final + validation E2E sur prod

**Files:** aucun fichier modifié

- [ ] **Step 1: Push**

```bash
GIT_SSH_COMMAND="ssh -i ~/.ssh/id_ed25519" git push origin main
```

- [ ] **Step 2: Suivre le workflow**

```bash
RUN_ID=$(gh run list --repo julienmessagingme/keolis-upload-auxerre --limit 1 --json databaseId --jq '.[0].databaseId')
gh run watch "$RUN_ID" --repo julienmessagingme/keolis-upload-auxerre --exit-status
```

- [ ] **Step 3: Vérifier le site répond**

```bash
curl -sI -o /dev/null -w "%{http_code}\n" https://keolisauxerre.messagingme.app/login.html
```
Expected : `200`

- [ ] **Step 4: Vérifier que /stats.html est servi (login required, donc 302)**

```bash
curl -sI -o /dev/null -w "%{http_code}\n" https://keolisauxerre.messagingme.app/stats.html
```
Expected : `302` (redirection vers /login.html) ou `200` selon comment requireAuth gère les pages statiques.

- [ ] **Step 5: Test manuel browser**

Demander à Julien de :
1. Se connecter sur https://keolisauxerre.messagingme.app/login.html
2. Cliquer sur l'onglet « Stats » dans la navbar
3. Vérifier qu'il voit la liste des custom events MessagingMe Auxerre
4. Cliquer sur un accordéon → le chart bar journalier se charge
5. Changer la période (7j / 30j / 90j) → la liste se rafraîchit
6. Cliquer sur « Resync manuel » (s'il est admin) → le sync se déclenche, les counts se mettent à jour

- [ ] **Step 6: Vérifier les logs cron**

```bash
ssh -i ~/.ssh/id_ed25519 ubuntu@146.59.233.252 \
  "sudo docker logs keolis-auxerre 2>&1 | grep -E 'cron scheduled|cron tick|syncAuxerre' | tail -10"
```

Expected : voir au démarrage `stats cron scheduled, schedule: 0 22 * * *, timezone: Europe/Paris`.

- [ ] **Step 7: Cocher cette task et marquer la feature comme livrée dans wip.md → features.md**

Mettre à jour [wip.md](../../wip.md) (retirer le bloc "Module Stats + Mes tableaux" puisque la partie Stats est livrée — il restera juste « Mes tableaux ») et confirmer dans [features.md](../../features.md) (déplacer Stats de "En cours" vers "Live").

```bash
git add wip.md features.md
git -c user.name="julienmessagingme" -c user.email="203261261+julienmessagingme@users.noreply.github.com" commit -m "$(cat <<'EOF'
docs: marque Stats comme livre, garde Mes tableaux dans wip

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
GIT_SSH_COMMAND="ssh -i ~/.ssh/id_ed25519" git push origin main
```

---

## Récap des fichiers créés/modifiés

**Créés :**
- `src/services/supabase.service.js`
- `src/features/stats/messagingme.client.js`
- `src/features/stats/sync.service.js`
- `src/features/stats/cron.js`
- `src/features/stats/stats.controller.js`
- `src/features/stats/stats.routes.js`
- `src/features/stats/index.js`
- `public/stats.html`

**Modifiés :**
- `package.json` (+`@supabase/supabase-js`, +`node-cron`)
- `src/server.js` (lance `startStatsCron()`)
- `src/app.js` (monte `/api/stats`)
- `src/features/auth/auth.service.js` (ajoute `upsertAuxerreUser`)
- `src/features/auth/auth.controller.js` (appelle upsert au login, set `req.session.userUuid`)
- `public/admin.html`, `public/index.html`, `public/knowledge.html`, `public/news.html`, `public/surveys.html` (lien Stats dans la navbar)
- `wip.md`, `features.md` (retirer Stats du wip)

**Sur le VPS (hors repo) :**
- `.env` : ajout `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `MM_TOKEN_AUXERRE`, `MESSAGINGME_BASE`, `INTERNAL_API_KEY`

**Pas touché à EDH** (la promesse à Julien : `auxerre` n'est jamais ajouté à `SCHOOLS` côté EDH).
