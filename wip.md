# Work in progress

## 2026-05-04 — Mes tableaux (Plan 2)

**Statut** : pas encore commence. Plan detaille a rediger.

Le module Stats est livre (cf. plus bas). Reste a ajouter le builder de tableaux personnels (funnels drag-and-drop), reutilisant les memes events MessagingMe que Stats.

### Decisions deja prises (architecture)
- Tables Supabase deja en place (cf. EDH `dashboards`, `dashboard_steps`, `dashboard_step_refs`). Migration `auxerre_users` + drop FK `dashboards.created_by` deja appliquee par Julien.
- `created_by = req.session.user.userUuid` cote Express (mappe au login dans la table `auxerre_users`).
- Pas d'URLs trackees comme EDH — palette uniquement custom events MessagingMe.
- Drag & drop : SortableJS (vanilla, meme UX que `@dnd-kit` d'EDH).
- Look : charte Keolis bleu identique.

### Reste a faire
- [ ] Rediger le plan d'implementation detaille `docs/plans/2026-05-XX-auxerre-dashboards-implementation.md`
- [ ] Implementer (apres validation du plan par Julien)

---

## 2026-05-04 — Module Stats (LIVRE)

Module Stats deploye en prod le 2026-05-04. Plan d'execution dans [docs/plans/2026-05-04-auxerre-stats-implementation.md](docs/plans/2026-05-04-auxerre-stats-implementation.md). 12 tasks, ~14 commits, 4 bugs corriges en code review (occurred_at field mapping, parseNumeric NaN, WebSocket Node 20, bornes UTC DST).

Fonctionnel :
- Sync nocturne MessagingMe → Supabase a 22h Europe/Paris (node-cron interne au process)
- Endpoint admin resync manuel + endpoint cron-bearer fallback
- Page `/stats.html` : filtre periode, accordeons par event, charts Chart.js journaliers
- Onglet « Stats » dans la navbar des 5 pages existantes

Premier sync prod : 16 events + 76 occurrences. Idempotence verifiee. 0 timestamp NULL.

## 2026-05-04 — Regularisation infra (LIVRE)

Avant d'attaquer Stats, reorganise l'infra :

- Le repo GitHub `keolis-upload-auxerre` ne contenait qu'un sous-ensemble de 13 fichiers (juste la feature surveys). Le projet complet vivait sur le VPS, non versionne. Probleme : impossible d'avoir un workflow git propre.
- Rapatrie l'integralite du projet VPS dans le repo via `tar` over SSH (en excluant `.env`, `node_modules`, `data/`, fichiers Windows pourris).
- Commit `chore: import full project state from VPS` (commit `662d725`).
- VPS transforme en repo git pointant sur GitHub (`git init` + `remote add` + `reset --hard origin/main`).
- Workflow GitHub Actions cree : push to main → SSH VPS → git pull → docker rebuild → reconnect mcp-robot_default → health check. Premier run de bout en bout reussi en 29s.
- Cle SSH dediee generee pour l'action (publique ajoutee au VPS, privee mise comme secret GitHub `SSH_PRIVATE_KEY`, locale supprimee).
- VPS nettoye : `NUL` + 2 dossiers Windows pourris (`C:Users...`) supprimes.
