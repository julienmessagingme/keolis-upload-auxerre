# CLAUDE.md — Keolis Auxerre

Application web interne Keolis Auxerre : fiches horaires, actualites, base de connaissances chatbot, enquetes qualite, **stats + mes tableaux** (custom events MessagingMe), et un **agent horaires bus** interroge par un flow WhatsApp (cf. [features.md](features.md)).

Deploye sur VPS OVH dans Docker derriere NPM, sous-domaine `keolisauxerre.messagingme.app`.

## Documentation

- **[documentation.md](documentation.md)** — archi, stack, structure projet, env vars, deploiement
- **[features.md](features.md)** — vue produit : auth, schedules, news, knowledge, surveys, et bientot stats
- **[wip.md](wip.md)** — travail en cours (module Stats + Mes tableaux)
- **[todo.md](todo.md)** — backlog
- **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** — archi technique detaillee (827 lignes, reference approfondie)

## Commandes essentielles

```bash
npm install
npm run dev          # http://localhost:3000

# Build/run Docker en local
docker-compose up -d --build
```

## Workflow Git et deploiement

**Tout passe par `git push origin main` — JAMAIS d'edition directe sur le VPS.**

1. Commit en local sur `main`
2. `git push origin main`
3. GitHub Actions ([.github/workflows/deploy.yml](.github/workflows/deploy.yml)) deploie automatiquement :
   - SSH au VPS, `git pull`, `docker rm -f keolis-auxerre`, `docker-compose up -d --build`, reconnexion au reseau `mcp-robot_default`, health check via `docker logs`
4. Verifier le run : `gh run list --repo julienmessagingme/keolis-upload-auxerre --limit 3`

**Secrets GitHub configures** : `SSH_PRIVATE_KEY` (paire dediee), `VPS_HOST`, `VPS_USER`. La cle privee n'est PAS sur disque local — uniquement comme secret GitHub.

## VPS

- **Path** : `/home/ubuntu/keolis-auxerre/` (repo git, pull declenche par GitHub Actions)
- **Container** : `keolis-auxerre` (port 3000 expose, derriere NPM)
- **Reseau Docker** : `mcp-robot_default` (NPM)
- **`.env`** : sur le VPS uniquement, jamais committe — snapshot dans la memoire projet (`env_vars_vps.md`)
- **`data/`** : volume bind-mount `./data:/app/data` (SQLite `knowledge.db`, users.json) — root-owned, pas dans le repo
