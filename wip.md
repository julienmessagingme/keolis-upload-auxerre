# Work in progress

(Aucun chantier actif pour le moment.)

---

## Historique récent (livré)

### 2026-05-04 — Mes tableaux (LIVRE)

Module « Mes tableaux » deploye en prod. Plan d'execution dans
[docs/plans/2026-05-04-auxerre-dashboards-implementation.md](docs/plans/2026-05-04-auxerre-dashboards-implementation.md).
12 tasks + un fix CRITICAL identifie en code review : atomic replace via
RPC PL/pgSQL (cf. migration 007 cote EDH/Supabase). Le meme bug existait
identique cote EDH ; le fix profite aux 2 projets simultanement.

Fonctionnel :
- API CRUD complete `/api/dashboards/*` (list, create, get, patch, delete, data)
- Page `/dashboards.html` : vue liste + builder SPA-style (toggle dans la meme page)
- Builder : palette events MessagingMe (gauche) + steps drag-and-drop SortableJS (droite)
  - Cumul multi-events par step (anti-doublon)
  - Reorder steps en drag, label editable, fallback inline = noms refs joints par '+'
  - Validation client : confirm si steps vides au save
- Viz funnel : bar chart horizontal Chart.js sur 30 derniers jours
- Sub-nav `[Custom events] [Mes tableaux]` cohérent dans stats.html et dashboards.html

Securite : `created_by = req.session.user.userUuid` hardcode cote serveur,
ownership check avec capture d'erreurs Supabase, validation cross-tenant
des `event_ns` contre `mm_events WHERE school_slug='auxerre'`.

### 2026-05-04 — Module Stats (LIVRE)

Module Stats deploye en prod. Plan d'execution dans
[docs/plans/2026-05-04-auxerre-stats-implementation.md](docs/plans/2026-05-04-auxerre-stats-implementation.md).
12 tasks, 4 bugs corriges en code review (occurred_at field mapping,
parseNumeric NaN, WebSocket Node 20, bornes UTC DST).

Fonctionnel :
- Sync nocturne MessagingMe → Supabase a 22h Europe/Paris (node-cron interne au process)
- Endpoint admin resync manuel + endpoint cron-bearer fallback
- Page `/stats.html` : filtre periode, accordeons par event, charts Chart.js journaliers
- Onglet « Stats » dans la navbar des 5 pages existantes

### 2026-05-04 — Regularisation infra (LIVRE)

Avant d'attaquer Stats, reorganise l'infra :

- Le repo GitHub `keolis-upload-auxerre` ne contenait qu'un sous-ensemble de 13 fichiers (juste la feature surveys). Le projet complet vivait sur le VPS, non versionne. Probleme : impossible d'avoir un workflow git propre.
- Rapatrie l'integralite du projet VPS dans le repo via `tar` over SSH (en excluant `.env`, `node_modules`, `data/`, fichiers Windows pourris).
- VPS transforme en repo git pointant sur GitHub (`git init` + `remote add` + `reset --hard origin/main`).
- Workflow GitHub Actions cree : push to main → SSH VPS → git pull → docker rebuild → reconnect mcp-robot_default → health check. Premier run de bout en bout reussi en 29s.
- Cle SSH dediee generee pour l'action (publique ajoutee au VPS, privee mise comme secret GitHub `SSH_PRIVATE_KEY`, locale supprimee).
- VPS nettoye : `NUL` + 2 dossiers Windows pourris (`C:Users...`) supprimes.
