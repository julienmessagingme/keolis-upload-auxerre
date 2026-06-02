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
├── scripts/
│   └── parse-schedule.js      # Outil de BUILD : PDF horaire -> JSON (pdfjs coords, devDep)
├── src/
│   ├── server.js              # Bootstrap (charge .env, demarre Express)
│   ├── app.js                 # Config Express + montage des routes
│   ├── config/                # database, email, session, storage, index
│   ├── features/              # auth, schedules, news, knowledge, surveys, stats, dashboards, bus-agent
│   │   └── <feature>/
│   │       ├── *.controller.js  # Handlers HTTP
│   │       ├── *.service.js     # Logique metier
│   │       ├── *.routes.js      # Definition routes
│   │       ├── data/            # (bus-agent) grilles horaires JSON committees
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

# Module stats
SUPABASE_URL=<...>
SUPABASE_SERVICE_ROLE_KEY=<...>
MM_TOKEN_AUXERRE=<bearer pour /flow/custom-events>
MESSAGINGME_BASE=https://ai.messagingme.app/api
INTERNAL_API_KEY=<random hex 64 pour /api/cron/sync>

# Agent horaires bus (/api/bus) — appele par le flow WhatsApp
BUS_AGENT_TOKEN=<random hex 32 ; header x-api-key ou ?token=>
```

Si `BUS_AGENT_TOKEN` est absent, l'endpoint `/api/bus/*` renvoie 401 systematiquement (ferme par defaut).

## Agent horaires bus — parsing des fiches et ajout d'une ligne

**Principe (build hors runtime).** Le runtime ne lit JAMAIS un PDF. Il charge au
demarrage tous les `src/features/bus-agent/data/ligne-<n>.json` (auto-decouverte
par regex `^ligne-.+\.json$`) et fait un lookup deterministe. Les JSON sont
generes hors ligne par `scripts/parse-schedule.js`, qui lit la couche texte du
PDF avec les coordonnees (x,y) de chaque horaire (`pdfjs-dist`, devDependency).
Lire la grille "a la vision" (LLM type Gemini) a ete teste et **abandonne** :
arrets inventes, colonnes perdues, lent. Les coordonnees sont exactes.

**Procedure pour ajouter / mettre a jour UNE ligne :**

1. **Recuperer le PDF.** Les fiches uploadees via l'app vivent sur Backblaze B2,
   nommees `<lineName>.pdf` (ex. `Ligne-2.pdf`). URL publique :
   `https://f003.backblazeb2.com/file/auxerre/<lineName>.pdf`. Telecharger en local.
2. **Parser** (ecrit le JSON au bon endroit par defaut) :
   ```bash
   npm run parse:schedule -- <chemin.pdf> <numeroLigne>
   # ex : npm run parse:schedule -- ./Ligne-2.pdf 2
   # -> ecrit src/features/bus-agent/data/ligne-2.json
   ```
3. **LIRE le resume de controle** imprime sur stderr et le **recouper avec le PDF** :
   - `[ALERTE]` eventuelles (PDF multi-pages, nb de sens != 2) = parsing probablement faux ;
   - nb de sens = 2, `de -> vers` corrects pour chaque sens ;
   - nb d'arrets coherent, nb de courses coherent, plage horaire (1re..derniere) plausible ;
   - `valable_des` correct.
   Verifier en plus 2-3 points precis : ouvrir le PDF, prendre un arret au milieu et
   une heure, et comparer a la sortie de l'API en local.
4. **Tester en local** : `npm run dev` puis
   `curl "http://localhost:3000/api/bus/next?ligne=2&arret=<...>&heure=8:00&token=<BUS_AGENT_TOKEN>"`.
5. **Commit + push** `git push origin main`. Le deploiement GHA reconstruit le
   conteneur ; le service recharge automatiquement le nouveau `ligne-<n>.json`.

**Limites connues du parser (calibre sur la Ligne 1)** — si une fiche a une mise
en page differente, le JSON peut etre faux SANS erreur. A surveiller :
- **Page 1 uniquement** (`getPage(1)`). Une fiche multi-pages (scolaire/vacances) perd des courses → l'`[ALERTE]` multi-pages le signale.
- **Exactement 2 tableaux** supposes, separes par le plus grand ecart vertical (`splitTables`). Une ligne a sens unique ou a 3 sous-grilles sera mal decoupee.
- **Colonne des noms a x < 190** (`NAME_X_MAX`). Layout different → noms mal extraits.
- **Pastilles collees au nom** filtrees par `MARKER` (`/^(\d+|N|Flexi|bus)$/i`).

Si une ligne ne passe pas la verif : ajuster les constantes en tete de
`scripts/parse-schedule.js` (documentees inline) pour cette mise en page, ou en
dernier recours saisir/corriger le JSON a la main. Ne JAMAIS committer un
`ligne-<n>.json` non verifie contre le PDF.

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
3. **Rate limit** : 100/min global, 5/15min login, 30/min webhook surveys, 60/min agent bus
4. **Brute force** : lockout applicatif 5 echecs login → IP bloquee 15 min
5. **Sessions** : httpOnly + secure + sameSite strict + 8h maxAge + regen au login
6. **Auth** : invitation only, bcrypt (10 rounds), tokens crypto 64 hex, roles admin/user
7. **Validation** : JSON 1MB, uploads 10MB PDF/TXT, prepared SQL statements
8. **Erreurs** : stack trace masquee en prod

## Deploiement

Workflow `git push origin main` → GitHub Actions → SSH VPS → `git pull` + `docker-compose up -d --build` + reconnexion reseau `mcp-robot_default` + health check. Voir [.github/workflows/deploy.yml](.github/workflows/deploy.yml).
