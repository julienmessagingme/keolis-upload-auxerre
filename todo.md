# Todo — Backlog

Quand on commence une entree, elle bascule de `todo.md` vers `wip.md`.

## Prioritaire

(Rien pour le moment — la priorite actuelle est le module Stats + Mes tableaux, deja dans wip.md.)

## Ameliorations (non prioritaire)

- Ajouter un `.gitattributes` pour normaliser les line endings (`* text=auto eol=lf`) et arreter les warnings CRLF/LF a chaque commit.
- Migrer `data/users.json` vers SQLite (cohere avec le reste, evite les race conditions sur ecriture concurrente).
- Ajouter des tests automatises (vitest ou jest) — actuellement aucun test.
- Surveiller le run GitHub Actions deploy : ajouter une notification (Slack ou email) en cas d'echec, plutot que d'avoir a verifier manuellement avec `gh run list`.
- **Stats** : `listCustomEvents` fait actuellement N requetes Supabase (une par event) en parallele via `Promise.all`. Pour 16 events c'est OK, mais si le nombre d'events MM Auxerre grandit, remplacer par une RPC Supabase qui fait `GROUP BY event_ns` cote DB. Detecte au code review du 2026-05-04.
- **Mes tableaux** : `updateDashboard` fait `delete dashboard_steps + N inserts` en sequentiel sans transaction. Si une insert plante au milieu, on a un dashboard avec moins de steps que prevu (le user peut re-save pour reparer). Fix propre : RPC PL/pgSQL `replace_dashboard_steps(dashboard_id, jsonb_steps)` qui fait tout dans une transaction. Repere au code review du 2026-05-04.
- **Mes tableaux** : `computeDashboardData` fait jusqu'a (steps × refs_par_step) queries count Supabase parallelement (worst case 50×20=1000). OK V1 (16 events Auxerre, peu de tableaux), mais a optimiser : grouper en 1 count par event_ns unique puis fan-out. Repere au code review.
- **Mes tableaux** : pas de routing — la page /dashboards.html ouvre toujours en mode liste. Bookmark d'un builder impossible. Ajouter un hash routing (#dashboard=uuid) si demande.
- Pinner les versions des libs CDN (Chart.js, Tailwind) dans tous les HTML pour eviter qu'un breaking change upstream casse le site.

## Bugs connus

(Aucun documente pour le moment.)

## Idees produit

- Centraliser un dashboard "vue admin globale" qui agrege les indicateurs des 5 modules (uploads du mois, news publiees, Q&A ajoutees, surveys recus, custom events).
