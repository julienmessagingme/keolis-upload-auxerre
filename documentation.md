# Documentation technique — Keolis Auxerre

Pour le detail exhaustif (couches de securite, schema DB, flow auth complet, etc.), voir **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** (version 3.1).

## Stack

- **Backend** : Node.js 20 + Express 4
- **DB locale** : SQLite (`better-sqlite3`) pour knowledge/schedules/news/surveys + JSON (`data/users.json`) pour les users
- **DB stats (a venir)** : Supabase (projet partage avec EDH, `school_slug = "auxerre"`) — cf. [wip.md](wip.md)
- **Stockage fichiers** : Backblaze B2 (bucket `auxerre`)
- **IA** : OpenAI Vector Store (chatbot)
- **Email** : Nodemailer (Gmail SMTP, port 465)
- **Auth** : sessions Express + bcrypt + invitation only + brute force lockout
- **Securite** : Helmet (CSP/HSTS), express-rate-limit, validation JSON 1MB, uploads 10MB
- **PDF** : PDFKit
- **Frontend** : HTML statique + Tailwind CSS (CDN) + Chart.js (CDN)
- **Container** : Docker (`node:20-alpine`, build avec python3/make/g++ pour bcrypt)
- **Reverse proxy** : Nginx Proxy Manager (sur le VPS)

## Structure du projet

```
keolis-upload-auxerre/
├── .github/workflows/deploy.yml  # CI/CD auto-deploy
├── src/
│   ├── server.js              # Bootstrap (charge .env, demarre Express)
│   ├── app.js                 # Config Express + montage des routes
│   ├── config/                # database, email, session, storage, index
│   ├── features/              # auth, schedules, news, knowledge, surveys
│   │   └── <feature>/
│   │       ├── *.controller.js  # Handlers HTTP
│   │       ├── *.service.js     # Logique metier
│   │       ├── *.routes.js      # Definition routes
│   │       └── index.js         # Export { routes }
│   ├── middleware/            # auth (requireAuth/Admin), errorHandler, upload (multer), validation
│   └── services/              # database (SQLite), email, openai, pdf, storage (B2), webhook
├── public/                    # Pages HTML statiques + favicons
├── data/                      # SQLite + users.json (volume Docker, NON committe)
├── docs/
│   ├── ARCHITECTURE.md        # Reference complete
│   └── plans/                 # Plans d'implementation (surveys, bientot stats)
├── templates/                 # Email templates (HTML)
├── Dockerfile                 # node:20-alpine + bcrypt build deps
├── docker-compose.yml         # Service `app`, port 3000, volume `./data`, env_file `.env`
└── package.json               # 15 deps
```

## Pattern code par feature

Chaque feature (auth, knowledge, news, schedules, surveys) suit le meme pattern :

```js
// features/<feature>/index.js
module.exports = { routes: require('./<feature>.routes') };

// features/<feature>/<feature>.routes.js
const router = require('express').Router();
const ctrl = require('./<feature>.controller');
const { requireAuth } = require('../../middleware');
router.get('/...', requireAuth, ctrl.list);
module.exports = router;
```

Les routes sont montees dans `src/app.js` avec un prefixe `/api/<feature>`.

## Env vars

Liste complete des cles attendues (voir snapshot des valeurs prod en memoire projet `env_vars_vps.md`) :

```env
# Server
PORT=3000
NODE_ENV=production
BASE_URL=https://keolisauxerre.messagingme.app
SESSION_SECRET=<random hex 128>
ADMIN_EMAIL=<email>

# Backblaze B2
B2_APP_KEY_ID=<...>
B2_APP_KEY=<...>
B2_BUCKET_ID=<...>
B2_BUCKET_NAME=auxerre

# OpenAI
OPENAI_API_KEY=<...>
OPENAI_VECTOR_STORE_ID=<...>

# SMTP
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_USER=<email>
SMTP_PASS=<app password>
SMTP_FROM=<from header>

# MessagingMe (webhook entrant + sortant)
MESSAGINGME_API_TOKEN=<...>
NEWS_WEBHOOK_URL=https://ai.messagingme.app/api/iwh/<...>
SURVEY_WEBHOOK_TOKEN=<...>

# A AJOUTER pour le module stats (cf. wip.md)
SUPABASE_URL=<...>
SUPABASE_SERVICE_ROLE_KEY=<...>
MM_TOKEN_AUXERRE=<bearer pour /flow/custom-events>
MESSAGINGME_BASE=https://ai.messagingme.app/api
INTERNAL_API_KEY=<random hex 64 pour /api/cron/sync>
```

## Schema DB SQLite

Tables principales (`data/knowledge.db`) :
- `knowledge_items` — Q&A et fichiers vectorises (id, type, subType, question, answer, fileName, vectorStoreFileId, status, ...)
- `schedules` — historique uploads fiches horaires
- `news` — historique publications actualites
- `surveys` — reponses webhook MessagingMe (etoiles 1-5 + commentaire + metadata)

(Voir `src/services/database.service.js` pour le DDL complet.)

## Securite — couches

1. **Infra** : ports Docker bindes 127.0.0.1 (sauf 3000:3000 ici), reverse proxy HTTPS via NPM + Let's Encrypt
2. **Headers** : Helmet (CSP, HSTS, X-Frame-Options, nosniff, referrer-policy)
3. **Rate limit** : 100/min global, 5/15min login, 30/min webhook surveys
4. **Brute force** : lockout applicatif 5 echecs login → IP bloquee 15 min
5. **Sessions** : httpOnly + secure + sameSite strict + 8h maxAge + regen au login
6. **Auth** : invitation only, bcrypt (10 rounds), tokens crypto 64 hex, roles admin/user
7. **Validation** : JSON 1MB, uploads 10MB PDF/TXT, prepared SQL statements
8. **Erreurs** : stack trace masquee en prod

## Deploiement

Workflow `git push origin main` → GitHub Actions → SSH VPS → `git pull` + `docker-compose up -d --build` + reconnexion reseau `mcp-robot_default` + health check. Voir [.github/workflows/deploy.yml](.github/workflows/deploy.yml).
