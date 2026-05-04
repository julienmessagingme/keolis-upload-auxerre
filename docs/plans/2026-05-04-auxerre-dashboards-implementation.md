# Auxerre Dashboards (« Mes tableaux ») Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter un module « Mes tableaux » à Auxerre, permettant à chaque utilisateur de construire des funnels personnels par drag-and-drop d'events MessagingMe vers des étapes ordonnées. Chaque étape peut cumuler plusieurs events (volumes sommés). Privé par utilisateur, persisté côté Supabase.

**Architecture:** Réutilise les tables Supabase EDH existantes (`dashboards`, `dashboard_steps`, `dashboard_step_refs`) avec `school_slug = "auxerre"`. Ownership scopé par `created_by = req.session.user.userUuid` côté Express (mappé au login dans la table `auxerre_users` — déjà fait dans le Plan 1 Stats). Pas de RLS ; isolation par code serveur. Pas d'URLs trackées (Auxerre n'en a pas) — seul `step_type = 'mm_event'` est utilisé. UI en HTML + Tailwind + SortableJS (drag-and-drop vanilla, équivalent UX de `@dnd-kit` d'EDH) + Chart.js pour la viz.

**Tech Stack:** Express, `@supabase/supabase-js` (déjà installé Plan 1), Chart.js CDN, SortableJS CDN. Pas de framework de tests dans ce projet — validation par curl + browser.

**Préalable côté DB (déjà fait par Julien dans Plan 1) :**
- Table `auxerre_users` créée
- FK stricte `dashboards.created_by → users.id` droppée (les uuid pointent maintenant vers `auxerre_users.id`)
- Tables `dashboards`, `dashboard_steps`, `dashboard_step_refs` existent déjà (créées par EDH)

**Hors scope :**
- Pas d'URLs trackées (out — Auxerre n'en a pas).
- Pas de partage entre utilisateurs (chaque tableau est privé). Si Julien veut ça plus tard, c'est un autre plan.
- Pas d'export PDF / CSV des tableaux. Le user pourra recharger la viz manuellement.

---

## Task 1: API GET /api/dashboards — liste des tableaux du user

**Files:**
- Create: `src/features/dashboards/index.js`
- Create: `src/features/dashboards/dashboards.routes.js`
- Create: `src/features/dashboards/dashboards.controller.js`
- Create: `src/features/dashboards/dashboards.service.js`

- [ ] **Step 1: Créer le dossier et le service**

```bash
mkdir -p src/features/dashboards
```

Créer `src/features/dashboards/dashboards.service.js` :

```js
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
```

- [ ] **Step 2: Créer le controller (handler GET /api/dashboards)**

Créer `src/features/dashboards/dashboards.controller.js` :

```js
const service = require('./dashboards.service');

/**
 * Renvoie 503 si l'user n'a pas de userUuid en session (Supabase
 * indisponible au moment du login). Plus utile qu'un 500 cryptique.
 */
function requireUserUuid(req, res) {
  const userUuid = req.session?.user?.userUuid;
  if (!userUuid) {
    res.status(503).json({ error: 'service_unavailable', message: 'Mapping Supabase user indisponible. Reconnectez-vous.' });
    return null;
  }
  return userUuid;
}

async function listDashboards(req, res, next) {
  try {
    const userUuid = requireUserUuid(req, res);
    if (!userUuid) return;
    const dashboards = await service.listDashboards(userUuid);
    res.json({ dashboards });
  } catch (err) {
    next(err);
  }
}

module.exports = { listDashboards, requireUserUuid };
```

- [ ] **Step 3: Créer les routes et l'index**

`src/features/dashboards/dashboards.routes.js` :

```js
const router = require('express').Router();
const ctrl = require('./dashboards.controller');
const { requireAuth } = require('../../middleware');

router.get('/', requireAuth, ctrl.listDashboards);

module.exports = router;
```

`src/features/dashboards/index.js` :

```js
module.exports = { routes: require('./dashboards.routes') };
```

- [ ] **Step 4: Vérifier le parse**

```bash
node -e "require('./src/features/dashboards/index.js'); console.log('OK')"
```
Expected : `OK`

- [ ] **Step 5: Commit**

```bash
git add src/features/dashboards/
git -c user.name="julienmessagingme" -c user.email="203261261+julienmessagingme@users.noreply.github.com" commit -m "$(cat <<'EOF'
feat(dashboards): GET /api/dashboards (liste tableaux du user)

Service + controller + routes + index. Scope school_slug=auxerre +
created_by=userUuid (defense en profondeur). Renvoie 503 explicite si
userUuid absent (panne Supabase au login).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: API POST /api/dashboards — créer un tableau

**Files:**
- Modify: `src/features/dashboards/dashboards.service.js` (ajouter `createDashboard`)
- Modify: `src/features/dashboards/dashboards.controller.js` (handler `createDashboard`)
- Modify: `src/features/dashboards/dashboards.routes.js`

- [ ] **Step 1: Ajouter `createDashboard` au service**

Append à `dashboards.service.js` :

```js
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

module.exports.createDashboard = createDashboard;
```

(Adapter le `module.exports` en bas pour exporter `createDashboard`.)

- [ ] **Step 2: Ajouter le handler au controller**

```js
async function createDashboard(req, res, next) {
  try {
    const userUuid = requireUserUuid(req, res);
    if (!userUuid) return;
    const { name } = req.body || {};
    const id = await service.createDashboard(userUuid, name);
    res.status(201).json({ id });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
}
module.exports.createDashboard = createDashboard;
```

- [ ] **Step 3: Ajouter la route**

```js
router.post('/', requireAuth, ctrl.createDashboard);
```

- [ ] **Step 4: Vérifier le parse**

```bash
node -e "require('./src/features/dashboards/index.js'); console.log('OK')"
```

- [ ] **Step 5: Commit**

```bash
git add src/features/dashboards/
git -c user.name="julienmessagingme" -c user.email="203261261+julienmessagingme@users.noreply.github.com" commit -m "feat(dashboards): POST /api/dashboards (cree tableau vide)

Validation : name trim non-vide, max 200 chars. Renvoie 201 avec l'id.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: API GET /api/dashboards/:id — détail avec steps + refs

**Files:**
- Modify: `src/features/dashboards/dashboards.service.js`
- Modify: `src/features/dashboards/dashboards.controller.js`
- Modify: `src/features/dashboards/dashboards.routes.js`

- [ ] **Step 1: Ajouter `getDashboardWithSteps` au service**

```js
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

module.exports.getDashboardWithSteps = getDashboardWithSteps;
```

- [ ] **Step 2: Handler controller**

```js
async function getDashboard(req, res, next) {
  try {
    const userUuid = requireUserUuid(req, res);
    if (!userUuid) return;
    const dashboard = await service.getDashboardWithSteps(userUuid, req.params.id);
    res.json({ dashboard });
  } catch (err) {
    if (err.status === 404) return res.status(404).json({ error: 'not_found' });
    next(err);
  }
}
module.exports.getDashboard = getDashboard;
```

- [ ] **Step 3: Route**

```js
router.get('/:id', requireAuth, ctrl.getDashboard);
```

- [ ] **Step 4: Vérifier le parse**

```bash
node -e "require('./src/features/dashboards/index.js'); console.log('OK')"
```

- [ ] **Step 5: Commit**

```bash
git add src/features/dashboards/
git -c user.name="julienmessagingme" -c user.email="203261261+julienmessagingme@users.noreply.github.com" commit -m "feat(dashboards): GET /api/dashboards/:id (detail + steps + refs)

Ownership verifie avant retour : 404 si created_by != userUuid OU
school_slug != auxerre. Pas d'IDOR possible.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: API PATCH /api/dashboards/:id — update name + remplacer steps atomiquement

**Files:**
- Modify: `src/features/dashboards/dashboards.service.js`
- Modify: `src/features/dashboards/dashboards.controller.js`
- Modify: `src/features/dashboards/dashboards.routes.js`

L'API EDH PATCH supporte name + date_preset + date_from + date_to + steps. Pour Auxerre V1 on simplifie : juste `name` et `steps`. Si Julien demande date_preset plus tard, on étend.

Le PATCH steps **remplace tous les steps** (delete cascade + insert). C'est ce qu'EDH fait aussi : c'est l'opération que le builder UI déclenche au save.

- [ ] **Step 1: Ajouter `updateDashboard` au service**

```js
/**
 * Update partiel du tableau. Si steps fourni, remplace TOUS les steps
 * existants par les nouveaux (delete cascade + insert ordonne). Verifie
 * l'ownership avant chaque mutation.
 *
 * @param {string} userUuid
 * @param {string} dashboardId
 * @param {{name?: string, steps?: Array<{label?: string|null, refs: Array<{event_ns: string}>}>}} patch
 */
async function updateDashboard(userUuid, dashboardId, patch) {
  const sb = getSupabase();

  // Ownership check
  const { data: dash } = await sb
    .from('dashboards')
    .select('id, created_by, school_slug')
    .eq('id', dashboardId)
    .maybeSingle();
  if (!dash || dash.created_by !== userUuid || dash.school_slug !== SCHOOL_SLUG) {
    throw Object.assign(new Error('not found'), { status: 404 });
  }

  // Update fields scalaires
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

  // Replace steps si fourni
  if (patch.steps !== undefined) {
    if (!Array.isArray(patch.steps)) throw Object.assign(new Error('steps doit etre un array'), { status: 400 });
    if (patch.steps.length > 50) throw Object.assign(new Error('Max 50 steps'), { status: 400 });

    // Validation : chaque step a au moins 1 ref, chaque ref est un mm_event valide
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

    // Delete cascade les steps existants (ON DELETE CASCADE sur dashboard_step_refs)
    const { error: delErr } = await sb.from('dashboard_steps').delete().eq('dashboard_id', dashboardId);
    if (delErr) throw new Error(`delete steps: ${delErr.message}`);

    // Insert les nouveaux steps + leurs refs
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

module.exports.updateDashboard = updateDashboard;
```

- [ ] **Step 2: Handler controller**

```js
async function updateDashboard(req, res, next) {
  try {
    const userUuid = requireUserUuid(req, res);
    if (!userUuid) return;
    await service.updateDashboard(userUuid, req.params.id, req.body || {});
    res.json({ ok: true });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
}
module.exports.updateDashboard = updateDashboard;
```

- [ ] **Step 3: Route**

```js
router.patch('/:id', requireAuth, ctrl.updateDashboard);
```

- [ ] **Step 4: Vérifier le parse**

```bash
node -e "require('./src/features/dashboards/index.js'); console.log('OK')"
```

- [ ] **Step 5: Commit**

```bash
git add src/features/dashboards/
git -c user.name="julienmessagingme" -c user.email="203261261+julienmessagingme@users.noreply.github.com" commit -m "feat(dashboards): PATCH /api/dashboards/:id (update name + replace steps)

Update partiel : name + steps (Auxerre V1 — date_preset/from/to pas
encore exposes en UI mais pris en charge par la DB si on les ajoute
plus tard). Replace steps = delete cascade + reinsert atomique
(EDH pattern).

Validation stricte : max 50 steps, max 20 refs par step, chaque ref
doit avoir un event_ns string non-vide. Ownership check avant chaque
mutation. Pas d'IDOR.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: API DELETE /api/dashboards/:id

**Files:**
- Modify: `src/features/dashboards/dashboards.service.js`
- Modify: `src/features/dashboards/dashboards.controller.js`
- Modify: `src/features/dashboards/dashboards.routes.js`

- [ ] **Step 1: Service**

```js
async function deleteDashboard(userUuid, dashboardId) {
  const sb = getSupabase();
  const { data: dash } = await sb
    .from('dashboards')
    .select('id, created_by, school_slug')
    .eq('id', dashboardId)
    .maybeSingle();
  if (!dash || dash.created_by !== userUuid || dash.school_slug !== SCHOOL_SLUG) {
    throw Object.assign(new Error('not found'), { status: 404 });
  }
  // Cascade : dashboard_steps -> dashboard_step_refs
  const { error } = await sb.from('dashboards').delete().eq('id', dashboardId);
  if (error) throw new Error(`deleteDashboard: ${error.message}`);
}
module.exports.deleteDashboard = deleteDashboard;
```

- [ ] **Step 2: Controller**

```js
async function deleteDashboard(req, res, next) {
  try {
    const userUuid = requireUserUuid(req, res);
    if (!userUuid) return;
    await service.deleteDashboard(userUuid, req.params.id);
    res.json({ ok: true });
  } catch (err) {
    if (err.status === 404) return res.status(404).json({ error: 'not_found' });
    next(err);
  }
}
module.exports.deleteDashboard = deleteDashboard;
```

- [ ] **Step 3: Route**

```js
router.delete('/:id', requireAuth, ctrl.deleteDashboard);
```

- [ ] **Step 4: Vérifier + commit**

```bash
node -e "require('./src/features/dashboards/index.js'); console.log('OK')"
git add src/features/dashboards/
git -c user.name="julienmessagingme" -c user.email="203261261+julienmessagingme@users.noreply.github.com" commit -m "feat(dashboards): DELETE /api/dashboards/:id

Cascade DB : dashboards -> dashboard_steps -> dashboard_step_refs
(via ON DELETE CASCADE des FKs existantes). Ownership check.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: API GET /api/dashboards/:id/data — calcul des counts par step

**Files:**
- Modify: `src/features/dashboards/dashboards.service.js`
- Modify: `src/features/dashboards/dashboards.controller.js`
- Modify: `src/features/dashboards/dashboards.routes.js`

Cet endpoint est appelé par la viz du builder pour afficher la bar chart funnel. Pour chaque step, on somme les counts de tous ses refs sur la période.

- [ ] **Step 1: Ajouter `computeDashboardData` au service**

```js
/**
 * Calcule les counts agreges par step pour la viz funnel.
 * Pour chaque step : count = somme des occurrences de tous ses refs sur [from, to].
 * Reutilise le helper isoBoundsParis de stats.controller via une duplication minimale
 * (on ne veut pas couplage cross-feature ; le helper fait 5 lignes).
 */
async function computeDashboardData(userUuid, dashboardId, fromDate, toDate) {
  const sb = getSupabase();

  // Ownership check
  const { data: dash } = await sb
    .from('dashboards')
    .select('id, created_by, school_slug')
    .eq('id', dashboardId)
    .maybeSingle();
  if (!dash || dash.created_by !== userUuid || dash.school_slug !== SCHOOL_SLUG) {
    throw Object.assign(new Error('not found'), { status: 404 });
  }

  const { fromUtc, toUtc } = isoBoundsParis(fromDate, toDate);

  // Steps + refs en 2 requetes
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

  // Pre-fetch les noms des events (label fallback)
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

  // Compute en parallele
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

// Helper duplique de stats.controller pour bornes UTC DST-correctes Europe/Paris
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

module.exports.computeDashboardData = computeDashboardData;
```

Note : la duplication `parisOffsetHours` / `isoBoundsParis` avec `stats.controller.js` est intentionnelle — c'est 12 lignes. Si on les utilise ailleurs un jour, on les extrait dans un helper partagé `src/lib/parisDates.js`.

- [ ] **Step 2: Controller (avec parseDateRange minimal)**

```js
async function getDashboardData(req, res, next) {
  try {
    const userUuid = requireUserUuid(req, res);
    if (!userUuid) return;
    const re = /^\d{4}-\d{2}-\d{2}$/;
    const { from, to } = req.query;
    if (!re.test(from || '') || !re.test(to || '')) {
      return res.status(400).json({ error: 'from/to format YYYY-MM-DD requis' });
    }
    const data = await service.computeDashboardData(userUuid, req.params.id, from, to);
    res.json(data);
  } catch (err) {
    if (err.status === 404) return res.status(404).json({ error: 'not_found' });
    next(err);
  }
}
module.exports.getDashboardData = getDashboardData;
```

- [ ] **Step 3: Route**

```js
router.get('/:id/data', requireAuth, ctrl.getDashboardData);
```

- [ ] **Step 4: Vérifier + commit**

```bash
node -e "require('./src/features/dashboards/index.js'); console.log('OK')"
git add src/features/dashboards/
git -c user.name="julienmessagingme" -c user.email="203261261+julienmessagingme@users.noreply.github.com" commit -m "feat(dashboards): GET /api/dashboards/:id/data (counts agreges par step)

Pour chaque step, somme les occurrences de tous ses refs sur [from, to]
(bornes Paris DST-correctes via Intl.DateTimeFormat). Renvoie un tableau
ordonne par position avec : { label, refs:[{label,count}], total }.

Si un event_ns n'existe plus dans mm_events, label='(indisponible)' et
count=0 — le UI peut grayer la ref. Pas d'erreur 500.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Enregistrer le module dashboards dans app.js + route /dashboards.html

**Files:**
- Modify: `src/app.js`

- [ ] **Step 1: Ajouter l'import + le montage**

Dans `src/app.js`, après `const surveysFeature = ...` :

```js
const dashboardsFeature = require('./features/dashboards');
```

Après `app.use('/api/stats', ...)` :

```js
app.use('/api/dashboards', dashboardsFeature.routes);
```

Après `app.get('/stats.html', ...)` :

```js
app.get('/dashboards.html', middleware.requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'dashboards.html'));
});
```

- [ ] **Step 2: Vérifier + commit**

```bash
grep -n dashboards src/app.js
# Expected : 3 matches (require, use, get)
git add src/app.js
git -c user.name="julienmessagingme" -c user.email="203261261+julienmessagingme@users.noreply.github.com" commit -m "feat(dashboards): monte le module sur /api/dashboards + route /dashboards.html

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Créer la page `/dashboards.html` — vue liste

**Files:**
- Create: `public/dashboards.html`

Cette page commence en mode « liste » (mes tableaux) puis bascule en mode « builder » quand on clique sur un tableau (toggle JS, pas de page séparée). On commence par juste la vue liste dans ce task ; le builder vient Task 9-10.

- [ ] **Step 1: Créer `public/dashboards.html` avec la navbar + sub-nav Stats/Mes tableaux + vue liste**

```html
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Mes tableaux - Keolis Auxerre</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/sortablejs@1.15.0/Sortable.min.js"></script>
    <script>
        tailwind.config = { theme: { extend: { colors: { 'keolis-blue': '#003366', 'keolis-light': '#0066cc' } } } }
    </script>
</head>
<body class="bg-gradient-to-br from-keolis-blue to-keolis-light min-h-screen">
    <!-- Navbar identique a stats.html mais avec Stats actif comme tab parent -->
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
                    <a href="/surveys.html" class="text-white px-4 py-2 rounded-lg font-semibold hover:bg-white hover:bg-opacity-10 transition-all">Enquêtes Qualité</a>
                    <a href="/stats.html" class="text-white bg-white bg-opacity-20 px-4 py-2 rounded-lg font-semibold hover:bg-opacity-30 transition-all">Stats</a>
                    <a href="/admin.html" class="text-white px-4 py-2 rounded-lg font-semibold hover:bg-white hover:bg-opacity-10 transition-all">Administration</a>
                    <button onclick="logout()" class="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg font-semibold">Déconnexion</button>
                </div>
            </div>
        </div>
    </nav>

    <div class="container mx-auto px-4 py-8 max-w-6xl">
        <!-- Sub-nav Stats / Mes tableaux -->
        <div class="bg-white rounded-2xl shadow-2xl p-2 mb-6 inline-flex gap-1">
            <a href="/stats.html" class="px-4 py-2 rounded-lg font-semibold text-keolis-blue hover:bg-gray-100 transition-all">Custom events</a>
            <a href="/dashboards.html" class="px-4 py-2 rounded-lg font-semibold bg-keolis-blue text-white">Mes tableaux</a>
        </div>

        <!-- Vue LISTE -->
        <div id="listView">
            <div class="bg-white rounded-2xl shadow-2xl p-6 mb-6 flex items-center justify-between">
                <h1 class="text-2xl font-bold text-keolis-blue">Mes tableaux</h1>
                <button onclick="newDashboard()" class="bg-keolis-blue hover:bg-keolis-light text-white px-4 py-2 rounded-lg font-semibold">+ Nouveau tableau</button>
            </div>
            <div id="dashboardsList" class="space-y-2">
                <div class="text-white text-center py-8">Chargement…</div>
            </div>
        </div>

        <!-- Vue BUILDER (cachee tant qu'on clique pas un tableau) -->
        <div id="builderView" class="hidden">
            <!-- Rempli en Task 9-10 -->
        </div>
    </div>

    <script>
        let currentDashboard = null; // { id, name, steps } quand on est en mode builder
        let availableEvents = []; // catalogue MM events pour la palette

        async function loadList() {
            const r = await fetch('/api/dashboards');
            if (!r.ok) {
                document.getElementById('dashboardsList').innerHTML = `<div class="bg-red-100 text-red-800 p-4 rounded-lg">Erreur HTTP ${r.status}</div>`;
                return;
            }
            const j = await r.json();
            renderList(j.dashboards || []);
        }

        function renderList(dashboards) {
            const c = document.getElementById('dashboardsList');
            if (dashboards.length === 0) {
                c.innerHTML = '<div class="bg-white rounded-2xl shadow-2xl p-6 text-center text-gray-600">Aucun tableau pour le moment. Cliquez sur « + Nouveau tableau » pour commencer.</div>';
                return;
            }
            c.innerHTML = dashboards.map(d => `
                <div class="bg-white rounded-2xl shadow-2xl p-4 flex items-center justify-between hover:bg-gray-50 cursor-pointer" onclick="openBuilder('${escapeAttr(d.id)}')">
                    <div>
                        <div class="font-bold text-keolis-blue">${escapeHtml(d.name)}</div>
                        <div class="text-xs text-gray-500">Modifié ${new Date(d.updated_at).toLocaleString('fr-FR')}</div>
                    </div>
                    <button onclick="event.stopPropagation(); deleteDashboard('${escapeAttr(d.id)}', '${escapeAttr(d.name)}')" class="text-red-600 hover:text-red-800 px-3 py-1 rounded">🗑</button>
                </div>
            `).join('');
        }

        async function newDashboard() {
            const name = prompt('Nom du tableau :');
            if (!name || !name.trim()) return;
            const r = await fetch('/api/dashboards', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: name.trim() }),
            });
            if (!r.ok) { alert(`Erreur HTTP ${r.status}`); return; }
            const { id } = await r.json();
            openBuilder(id);
        }

        async function deleteDashboard(id, name) {
            if (!confirm(`Supprimer le tableau « ${name} » ?`)) return;
            const r = await fetch(`/api/dashboards/${encodeURIComponent(id)}`, { method: 'DELETE' });
            if (!r.ok) { alert(`Erreur HTTP ${r.status}`); return; }
            loadList();
        }

        // openBuilder, builder UI, save, etc. — implementes en Task 9-10
        async function openBuilder(id) {
            // Placeholder pour Task 9-10
            alert('Builder a venir (Task 9-10)');
        }

        async function logout() {
            await fetch('/api/auth/logout', { method: 'POST' });
            window.location.href = '/login.html';
        }
        function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }
        function escapeAttr(s) { return escapeHtml(s); }

        loadList();
    </script>
</body>
</html>
```

- [ ] **Step 2: Commit**

```bash
git add public/dashboards.html
git -c user.name="julienmessagingme" -c user.email="203261261+julienmessagingme@users.noreply.github.com" commit -m "feat(dashboards): page dashboards.html (vue liste + sub-nav)

Charte Keolis bleu identique a stats.html. Sub-nav Stats / Mes tableaux
au-dessus du contenu. Vue liste avec :
- bouton « + Nouveau tableau » (prompt nom puis ouvre builder)
- chaque tableau : nom + date modif + bouton supprimer
- vue builder cachee, sera implementee Task 9-10

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: Builder UI — palette events + steps drag&drop (sans viz)

**Files:**
- Modify: `public/dashboards.html` (remplir `#builderView` + JS)

Dans la page, on remplace le placeholder `<div id="builderView" class="hidden"></div>` par un layout 2-colonnes :
- Gauche : palette des events MessagingMe disponibles (chargée depuis `/api/stats/custom-events?from=...&to=...`)
- Droite : liste ordonnée des steps (drop target) avec multi-refs cumulables

SortableJS gère le drag des items palette → drop dans une step (ou crée une nouvelle step si on drop dans la zone vide).

- [ ] **Step 1: Remplacer le placeholder builderView**

```html
<div id="builderView" class="hidden">
    <div class="bg-white rounded-2xl shadow-2xl p-6 mb-6 flex items-center justify-between">
        <div>
            <button onclick="closeBuilder()" class="text-keolis-blue hover:underline mb-2 text-sm">← Retour à la liste</button>
            <input id="builderName" type="text" class="text-2xl font-bold text-keolis-blue border-b-2 border-transparent focus:border-keolis-blue focus:outline-none w-full" placeholder="Nom du tableau">
        </div>
        <button id="saveBtn" onclick="saveDashboard()" class="bg-keolis-blue hover:bg-keolis-light text-white px-4 py-2 rounded-lg font-semibold">Enregistrer</button>
    </div>

    <div class="grid grid-cols-12 gap-6">
        <!-- Palette events -->
        <div class="col-span-4 bg-white rounded-2xl shadow-2xl p-4">
            <h3 class="font-bold text-keolis-blue mb-3">Custom events MessagingMe</h3>
            <p class="text-xs text-gray-500 mb-3">Glissez un event sur une étape pour l'ajouter (cumul possible).</p>
            <div id="palette" class="space-y-1 max-h-[600px] overflow-y-auto">
                <div class="text-gray-500 text-sm">Chargement…</div>
            </div>
        </div>

        <!-- Steps droppables -->
        <div class="col-span-8 bg-white rounded-2xl shadow-2xl p-4">
            <div class="flex items-center justify-between mb-3">
                <h3 class="font-bold text-keolis-blue">Étapes du funnel</h3>
                <button onclick="addEmptyStep()" class="text-keolis-blue text-sm hover:underline">+ Étape vide</button>
            </div>
            <div id="steps" class="space-y-3 min-h-[200px]">
                <div class="text-gray-500 text-sm text-center py-8 border-2 border-dashed border-gray-300 rounded-lg">
                    Glissez un event de la palette ici pour créer la première étape.
                </div>
            </div>
        </div>
    </div>

    <!-- Viz funnel : remplie en Task 10 -->
    <div id="vizContainer" class="hidden bg-white rounded-2xl shadow-2xl p-6 mt-6">
        <h3 class="font-bold text-keolis-blue mb-3">Visualisation</h3>
        <canvas id="funnelChart" height="120"></canvas>
    </div>
</div>
```

- [ ] **Step 2: Étendre le JS pour le builder**

Remplacer le placeholder `openBuilder` par cette implémentation :

```js
async function openBuilder(id) {
    document.getElementById('listView').classList.add('hidden');
    document.getElementById('builderView').classList.remove('hidden');

    // Charger en parallele : le tableau + les events disponibles
    const [dashRes, evRes] = await Promise.all([
        fetch(`/api/dashboards/${encodeURIComponent(id)}`),
        fetch('/api/stats/custom-events?from=2020-01-01&to=2099-12-31'), // tout le catalogue
    ]);
    if (!dashRes.ok) { alert(`Erreur ${dashRes.status} chargement tableau`); closeBuilder(); return; }
    if (!evRes.ok) { alert(`Erreur ${evRes.status} chargement palette`); closeBuilder(); return; }
    const { dashboard } = await dashRes.json();
    const { events } = await evRes.json();

    currentDashboard = dashboard;
    availableEvents = events || [];

    document.getElementById('builderName').value = dashboard.name;
    renderPalette();
    renderSteps(dashboard.steps || []);
}

function closeBuilder() {
    document.getElementById('builderView').classList.add('hidden');
    document.getElementById('listView').classList.remove('hidden');
    currentDashboard = null;
    loadList();
}

function renderPalette() {
    const c = document.getElementById('palette');
    if (availableEvents.length === 0) {
        c.innerHTML = '<div class="text-gray-500 text-sm">Aucun event disponible. Lancez un sync depuis la page Stats.</div>';
        return;
    }
    c.innerHTML = availableEvents.map(ev => `
        <div class="palette-item bg-gray-100 hover:bg-gray-200 rounded p-2 cursor-grab text-sm" data-event-ns="${escapeAttr(ev.event_ns)}" data-event-name="${escapeAttr(ev.name)}">
            <div class="font-semibold text-keolis-blue truncate">${escapeHtml(ev.name)}</div>
            ${ev.description ? `<div class="text-xs text-gray-600 truncate">${escapeHtml(ev.description)}</div>` : ''}
        </div>
    `).join('');

    // SortableJS : palette est draggable, clone au drag (ne sort pas de la liste source)
    Sortable.create(c, {
        group: { name: 'events', pull: 'clone', put: false },
        sort: false,
        animation: 150,
    });
}

function renderSteps(steps) {
    const c = document.getElementById('steps');
    if (steps.length === 0) {
        c.innerHTML = `
            <div id="emptyStepsZone" class="text-gray-500 text-sm text-center py-8 border-2 border-dashed border-gray-300 rounded-lg">
                Glissez un event de la palette ici pour créer la première étape.
            </div>
        `;
        Sortable.create(document.getElementById('emptyStepsZone'), {
            group: { name: 'events', pull: false, put: true },
            onAdd: (evt) => {
                const item = evt.item;
                const eventNs = item.dataset.eventNs;
                const eventName = item.dataset.eventName;
                item.remove(); // supprimer le clone (on reconstruit la step)
                addStepWithRef(eventNs, eventName);
            },
        });
        return;
    }
    c.innerHTML = steps.map((step, i) => stepHtml(step, i)).join('');
    bindStepInteractions();
}

function stepHtml(step, idx) {
    const refsHtml = (step.refs || []).map(r => {
        const ev = availableEvents.find(e => e.event_ns === r.event_ns);
        const label = ev ? ev.name : '(indisponible)';
        return `<span class="inline-flex items-center gap-1 bg-keolis-light text-white text-xs px-2 py-1 rounded mr-1 mb-1" data-event-ns="${escapeAttr(r.event_ns)}">
            ${escapeHtml(label)}
            <button onclick="removeRef(this)" class="hover:bg-keolis-blue rounded px-1">×</button>
        </span>`;
    }).join('');
    return `
        <div class="step-card bg-gray-50 border border-gray-200 rounded-lg p-3" data-step-index="${idx}">
            <div class="flex items-center gap-2 mb-2">
                <span class="bg-keolis-blue text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold">${idx + 1}</span>
                <input type="text" class="step-label-input flex-1 border-b border-transparent focus:border-keolis-blue focus:outline-none text-sm" placeholder="Label (vide = '${escapeAttr((step.refs || []).map(r => availableEvents.find(e => e.event_ns === r.event_ns)?.name || '?').join(' + '))}')" value="${escapeAttr(step.label || '')}">
                <button onclick="removeStep(this)" class="text-red-600 hover:text-red-800 text-sm">🗑</button>
            </div>
            <div class="step-refs flex flex-wrap min-h-[28px]">${refsHtml}</div>
        </div>
    `;
}

function bindStepInteractions() {
    document.querySelectorAll('.step-card').forEach((card) => {
        const refsContainer = card.querySelector('.step-refs');
        Sortable.create(refsContainer, {
            group: { name: 'events', pull: false, put: true },
            onAdd: (evt) => {
                const item = evt.item;
                const eventNs = item.dataset.eventNs;
                const eventName = item.dataset.eventName;
                item.remove();
                // Eviter doublon dans la meme step
                if (refsContainer.querySelector(`[data-event-ns="${CSS.escape(eventNs)}"]`)) return;
                const tag = document.createElement('span');
                tag.className = 'inline-flex items-center gap-1 bg-keolis-light text-white text-xs px-2 py-1 rounded mr-1 mb-1';
                tag.dataset.eventNs = eventNs;
                tag.innerHTML = `${escapeHtml(eventName)} <button onclick="removeRef(this)" class="hover:bg-keolis-blue rounded px-1">×</button>`;
                refsContainer.appendChild(tag);
            },
        });
    });

    // Allow reorder steps (drag step-card)
    Sortable.create(document.getElementById('steps'), {
        handle: '.step-card',
        animation: 150,
        // Group different from events to avoid mixing
        group: 'steps-reorder',
    });
}

function addStepWithRef(eventNs, eventName) {
    const step = { label: null, refs: [{ event_ns: eventNs }] };
    const currentSteps = collectStepsFromDOM();
    currentSteps.push(step);
    renderSteps(currentSteps);
}

function addEmptyStep() {
    const currentSteps = collectStepsFromDOM();
    currentSteps.push({ label: null, refs: [] });
    renderSteps(currentSteps);
}

function removeStep(btn) {
    btn.closest('.step-card').remove();
    // Re-numbering
    const steps = collectStepsFromDOM();
    renderSteps(steps);
}

function removeRef(btn) {
    btn.closest('span[data-event-ns]').remove();
}

function collectStepsFromDOM() {
    const steps = [];
    document.querySelectorAll('.step-card').forEach((card) => {
        const label = card.querySelector('.step-label-input').value.trim() || null;
        const refs = [];
        card.querySelectorAll('.step-refs > span[data-event-ns]').forEach((tag) => {
            refs.push({ event_ns: tag.dataset.eventNs });
        });
        steps.push({ label, refs });
    });
    return steps;
}

async function saveDashboard() {
    if (!currentDashboard) return;
    const name = document.getElementById('builderName').value.trim();
    if (!name) { alert('Le nom est requis'); return; }
    const steps = collectStepsFromDOM().filter((s) => s.refs.length > 0); // skip steps vides
    const btn = document.getElementById('saveBtn');
    btn.disabled = true; btn.textContent = '⏳ Enregistrement…';
    try {
        const r = await fetch(`/api/dashboards/${encodeURIComponent(currentDashboard.id)}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, steps }),
        });
        if (!r.ok) {
            const j = await r.json().catch(() => ({}));
            throw new Error(j.error || `HTTP ${r.status}`);
        }
        btn.textContent = '✓ Enregistré';
        // La viz sera rafraichie en Task 10 ; pour l'instant, juste marquer le succes
        setTimeout(() => { btn.textContent = 'Enregistrer'; btn.disabled = false; }, 2000);
    } catch (err) {
        alert(`Erreur enregistrement : ${err.message}`);
        btn.textContent = 'Enregistrer'; btn.disabled = false;
    }
}
```

- [ ] **Step 3: Commit**

```bash
git add public/dashboards.html
git -c user.name="julienmessagingme" -c user.email="203261261+julienmessagingme@users.noreply.github.com" commit -m "feat(dashboards): builder UI (palette + steps drag&drop SortableJS)

- Layout 2-cols : palette events MessagingMe (gauche) + steps (droite)
- SortableJS : drag d'event de la palette vers une step (ou zone vide
  pour creer une nouvelle step). Cumul multi-events par step (anti-doublon).
- Bouton « + Etape vide » pour ajouter une step manuellement.
- Reorder steps en drag (handle = step-card complete).
- Label de step editable, fallback inline = noms refs joints par '+'.
- Save : PATCH avec name + steps non-vides (skip steps sans refs).

Pas encore la viz funnel (Task 10).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: Builder — viz funnel bar chart

**Files:**
- Modify: `public/dashboards.html` (étendre le JS pour le chart)

Après save, charger `/api/dashboards/:id/data?from&to` et render un bar chart. Pour V1, on utilise une période fixe (30 derniers jours) — pas de filtre période exposé sur cette page V1 (Julien peut en demander un plus tard).

- [ ] **Step 1: Étendre `saveDashboard` pour rafraîchir la viz après save**

Remplacer le bloc try du saveDashboard par :

```js
    try {
        const r = await fetch(`/api/dashboards/${encodeURIComponent(currentDashboard.id)}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, steps }),
        });
        if (!r.ok) {
            const j = await r.json().catch(() => ({}));
            throw new Error(j.error || `HTTP ${r.status}`);
        }
        btn.textContent = '✓ Enregistré';
        await refreshViz();
        setTimeout(() => { btn.textContent = 'Enregistrer'; btn.disabled = false; }, 2000);
    } catch (err) {
        alert(`Erreur enregistrement : ${err.message}`);
        btn.textContent = 'Enregistrer'; btn.disabled = false;
    }
```

- [ ] **Step 2: Ajouter `refreshViz` + appeler aussi à l'ouverture du builder**

Ajouter dans le JS :

```js
let funnelChart = null;

async function refreshViz() {
    if (!currentDashboard) return;
    const today = new Date();
    const from = new Date(today); from.setDate(from.getDate() - 29);
    const fromStr = from.toISOString().slice(0, 10);
    const toStr = today.toISOString().slice(0, 10);

    const r = await fetch(`/api/dashboards/${encodeURIComponent(currentDashboard.id)}/data?from=${fromStr}&to=${toStr}`);
    if (!r.ok) {
        document.getElementById('vizContainer').classList.add('hidden');
        return;
    }
    const data = await r.json();
    const stepsWithRefs = (data.steps || []).filter((s) => s.refs.length > 0);
    if (stepsWithRefs.length === 0) {
        document.getElementById('vizContainer').classList.add('hidden');
        return;
    }
    document.getElementById('vizContainer').classList.remove('hidden');

    if (funnelChart) funnelChart.destroy();
    const ctx = document.getElementById('funnelChart').getContext('2d');
    funnelChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: stepsWithRefs.map((s, i) => {
                if (s.label) return s.label;
                return s.refs.map((r) => r.label).join(' + ');
            }),
            datasets: [{
                label: `Volumes (${fromStr} → ${toStr})`,
                data: stepsWithRefs.map((s) => s.total),
                backgroundColor: '#003366',
            }],
        },
        options: {
            responsive: true,
            indexAxis: 'y', // funnel horizontal
            plugins: { legend: { display: true, position: 'top' } },
            scales: { x: { beginAtZero: true, ticks: { precision: 0 } } },
        },
    });
}
```

Et appeler `refreshViz()` à la fin de `openBuilder` :

```js
    document.getElementById('builderName').value = dashboard.name;
    renderPalette();
    renderSteps(dashboard.steps || []);
    refreshViz();
```

- [ ] **Step 3: Commit**

```bash
git add public/dashboards.html
git -c user.name="julienmessagingme" -c user.email="203261261+julienmessagingme@users.noreply.github.com" commit -m "feat(dashboards): viz funnel bar chart sur les 30 derniers jours

Chart.js horizontal bar (indexAxis='y'). Affiche les steps avec au
moins 1 ref. Label = step.label || refs joints par ' + '. Periode
fixe 30j pour V1 — filtre periode exposable plus tard si demande.

Refresh : a l'ouverture du builder + apres chaque save.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 11: Sub-nav Stats / Mes tableaux dans stats.html (cohérence)

**Files:**
- Modify: `public/stats.html` (ajouter le sub-nav identique à dashboards.html)

Pour cohérence avec EDH (qui a un sub-nav `[URLs] [Stats] [Mes tableaux]`), on ajoute un sub-nav `[Custom events] [Mes tableaux]` au-dessus du contenu de `stats.html`.

- [ ] **Step 1: Lire stats.html pour repérer où insérer le sub-nav**

```bash
grep -n "container mx-auto px-4 py-8" public/stats.html | head -1
```

Le sub-nav doit aller juste après l'ouverture du `<div class="container ...">` et avant le `<div class="bg-white rounded-2xl shadow-2xl p-6 mb-6">` du header.

- [ ] **Step 2: Insérer le sub-nav**

Modifier `public/stats.html` :

```html
    <div class="container mx-auto px-4 py-8 max-w-6xl">
        <!-- Sub-nav Stats / Mes tableaux -->
        <div class="bg-white rounded-2xl shadow-2xl p-2 mb-6 inline-flex gap-1">
            <a href="/stats.html" class="px-4 py-2 rounded-lg font-semibold bg-keolis-blue text-white">Custom events</a>
            <a href="/dashboards.html" class="px-4 py-2 rounded-lg font-semibold text-keolis-blue hover:bg-gray-100 transition-all">Mes tableaux</a>
        </div>

        <!-- Header + filtre periode -->
        <div class="bg-white rounded-2xl shadow-2xl p-6 mb-6">
        ...
```

- [ ] **Step 3: Commit**

```bash
git add public/stats.html
git -c user.name="julienmessagingme" -c user.email="203261261+julienmessagingme@users.noreply.github.com" commit -m "feat(stats): ajoute sub-nav Stats / Mes tableaux

Coherence avec dashboards.html : meme sub-nav au-dessus du contenu,
avec l'onglet courant marque actif. Pattern equivalent au sub-nav EDH
[URLs] [Stats] [Mes tableaux].

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 12: Push final + validation E2E sur prod

- [ ] **Step 1: Push tous les commits**

```bash
GIT_SSH_COMMAND="ssh -i ~/.ssh/id_ed25519" git push origin main
```

- [ ] **Step 2: Suivre le workflow**

```bash
RUN_ID=$(gh run list --repo julienmessagingme/keolis-upload-auxerre --limit 1 --json databaseId --jq '.[0].databaseId')
gh run watch "$RUN_ID" --repo julienmessagingme/keolis-upload-auxerre --exit-status
```

- [ ] **Step 3: Smoke tests**

```bash
echo "/dashboards.html (sans auth) :"; curl -sI -o /dev/null -w "%{http_code}\n" https://keolisauxerre.messagingme.app/dashboards.html
echo "/api/dashboards (sans auth) :"; curl -sI -o /dev/null -w "%{http_code}\n" https://keolisauxerre.messagingme.app/api/dashboards
```
Expected : `302` puis `401`.

- [ ] **Step 4: Test manuel browser**

Demander à Julien de :
1. Aller sur https://keolisauxerre.messagingme.app/login.html, se connecter
2. Cliquer Stats dans la navbar → puis sub-nav « Mes tableaux »
3. Cliquer « + Nouveau tableau », saisir un nom → doit ouvrir le builder
4. Drag un event de la palette vers la zone vide → crée une étape
5. Drag d'autres events vers la même étape → cumul
6. Drag d'un event vers une nouvelle ligne → nouvelle étape
7. Cliquer Enregistrer → message « ✓ Enregistré » + viz funnel apparaît
8. Cliquer « ← Retour à la liste » → tableau visible avec date modif récente
9. Recliquer le tableau → builder rouvre avec les steps déjà sauvés
10. Tester suppression (icône poubelle dans la liste)

- [ ] **Step 5: Mettre à jour wip.md et features.md**

Déplacer Mes tableaux de wip vers features Live.

```bash
# editer wip.md (retirer le bloc 2026-05-04 — Mes tableaux)
# editer features.md (deplacer Mes tableaux vers Live)
git add wip.md features.md
git -c user.name="julienmessagingme" -c user.email="203261261+julienmessagingme@users.noreply.github.com" commit -m "docs: marque Mes tableaux comme livre

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
GIT_SSH_COMMAND="ssh -i ~/.ssh/id_ed25519" git push origin main
```

---

## Récap des fichiers créés/modifiés

**Créés :**
- `src/features/dashboards/dashboards.service.js`
- `src/features/dashboards/dashboards.controller.js`
- `src/features/dashboards/dashboards.routes.js`
- `src/features/dashboards/index.js`
- `public/dashboards.html`

**Modifiés :**
- `src/app.js` (+`/api/dashboards`, +`/dashboards.html`)
- `public/stats.html` (+sub-nav)
- `wip.md`, `features.md`

**Pas touché à EDH** (`auxerre` reste hors `SCHOOLS`).

**Pas de migration DB** (les tables `dashboards`, `dashboard_steps`, `dashboard_step_refs`, `auxerre_users` existent déjà).

**Pas d'env vars supplémentaires** (réutilise SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY déjà présents).
