# Todo — Backlog

Quand on commence une entree, elle bascule de `todo.md` vers `wip.md`.

## Prioritaire

(Rien pour le moment — la priorite actuelle est le module Stats + Mes tableaux, deja dans wip.md.)

## Ameliorations (non prioritaire)

- Ajouter un `.gitattributes` pour normaliser les line endings (`* text=auto eol=lf`) et arreter les warnings CRLF/LF a chaque commit.
- Migrer `data/users.json` vers SQLite (cohere avec le reste, evite les race conditions sur ecriture concurrente).
- Ajouter des tests automatises (vitest ou jest) — actuellement aucun test.
- Surveiller le run GitHub Actions deploy : ajouter une notification (Slack ou email) en cas d'echec, plutot que d'avoir a verifier manuellement avec `gh run list`.

## Bugs connus

(Aucun documente pour le moment.)

## Idees produit

- Centraliser un dashboard "vue admin globale" qui agrege les indicateurs des 5 modules (uploads du mois, news publiees, Q&A ajoutees, surveys recus, custom events).
