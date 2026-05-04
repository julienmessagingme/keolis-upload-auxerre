# Work in progress

## 2026-05-04 — Module Stats + Mes tableaux

**Statut** : architecture validee avec Julien, plan detaille a rediger ensuite, code pas encore commence.

### Decisions prises
- DB : projet Supabase partage avec EDH, `school_slug = "auxerre"`. Tables reutilisees : `mm_events`, `mm_occurrences`, `mm_sync_state`, `dashboards`, `dashboard_steps`, `dashboard_step_refs`. Nouvelle table dediee `auxerre_users` (user mapping) + drop FK stricte sur `dashboards.created_by`.
- EDH ne doit JAMAIS afficher Auxerre — garanti par sa constante `SCHOOLS` hardcodee qui ne contient pas `auxerre`. **Ne jamais ajouter `auxerre` a [SCHOOLS](../EDH/src/lib/schools.ts).**
- Auth : la table `users` Supabase reste 100% EDH (collision d'email evitee via table `auxerre_users` separee).
- Pas de RLS — securite cote code Express (middleware `requireAuth` + hardcode `school_slug` et `created_by` cote serveur, frontend ne touche jamais Supabase directement).
- MessagingMe : bearer token Auxerre dans `MM_TOKEN_AUXERRE` (.env VPS), base API `https://ai.messagingme.app/api`. Sync nocturne via `node-cron` interne au process (pattern EDH `0 22 * * *`), + endpoint admin manuel + endpoint cron-bearer fallback.
- Drag & drop : EDH utilise `@dnd-kit` (React-only). Auxerre HTML statique → on utilise **SortableJS** (vanilla, meme UX).
- Charts : Chart.js (CDN, deja utilise sur surveys.html).
- Look : charte Keolis bleu existante conservee (palette `keolis-blue`/`keolis-light`, navbar sticky, cards `bg-white rounded-2xl shadow-2xl`).

### Phases prevues
1. Setup Supabase + sync MessagingMe (backend)
2. Sync user Auxerre → table `auxerre_users` au login
3. API Stats (custom-events list, daily series)
4. API Mes tableaux (CRUD dashboards/steps/refs)
5. UI : ajout onglet Stats dans toutes les navbars existantes
6. Page `stats.html` (custom events + chart journalier)
7. Page `dashboards.html` (mes tableaux + drag&drop SortableJS)
8. Test end-to-end + deploy via GitHub Actions

### Reste a faire avant d'attaquer le code
- [ ] Rediger le plan d'implementation detaille (skill `writing-plans`) dans `docs/plans/2026-05-04-auxerre-stats-implementation.md`
- [ ] Recuperer `SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY` depuis le conteneur EDH (`docker exec edh-app env | grep SUPABASE`)
- [ ] Generer un `INTERNAL_API_KEY` random hex 64
- [ ] Ajouter ces 5 vars au `.env` du VPS Auxerre

## 2026-05-04 — Regularisation infra (TERMINE)

Ce qu'on a fait dans cette session avant d'attaquer la feature stats :

- Le repo GitHub `keolis-upload-auxerre` ne contenait qu'un sous-ensemble de 13 fichiers (juste la feature surveys). Le projet complet vivait sur le VPS, non versionne. Probleme : impossible d'avoir un workflow git propre.
- Rapatrie l'integralite du projet VPS dans le repo via `tar` over SSH (en excluant `.env`, `node_modules`, `data/`, fichiers Windows pourris).
- Commit `chore: import full project state from VPS` (commit `662d725`).
- VPS transforme en repo git pointant sur GitHub (`git init` + `remote add` + `reset --hard origin/main`).
- Workflow GitHub Actions cree : push to main → SSH VPS → git pull → docker rebuild → reconnect mcp-robot_default → health check. Premier run de bout en bout reussi en 29s.
- Cle SSH dediee generee pour l'action (publique ajoutee au VPS, privee mise comme secret GitHub `SSH_PRIVATE_KEY`, locale supprimee).
- VPS nettoye : `NUL` + 2 dossiers Windows pourris (`C:Users...`) supprimes.
