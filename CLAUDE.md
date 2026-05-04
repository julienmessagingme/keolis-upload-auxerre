# Keolis Auxerre - Application de Gestion

Application web interne pour Keolis Auxerre : gestion des fiches horaires, actualites, base de connaissances chatbot et enquetes de satisfaction.

**Doc d'architecture complete** : `docs/ARCHITECTURE.md`

## Stack Technique

- **Backend**: Node.js + Express.js
- **Base de donnees**: SQLite (better-sqlite3) + JSON (utilisateurs)
- **Stockage fichiers**: Backblaze B2
- **IA**: OpenAI Vector Store (base de connaissances)
- **Email**: Nodemailer (SMTP Gmail)
- **Authentification**: Sessions Express + bcrypt
- **Securite**: Helmet + express-rate-limit + brute force protection
- **PDF**: PDFKit
- **Frontend**: HTML + Tailwind CSS (CDN) + Chart.js (CDN)

## Structure du Projet

```
projet-keolis-auxerre/
├── src/
│   ├── server.js              # Point d'entree - bootstrap services
│   ├── app.js                 # Config Express, securite, routes
│   ├── config/
│   │   ├── index.js           # Configuration centralisee
│   │   ├── database.js        # Config JSON (users)
│   │   ├── email.js           # Config SMTP
│   │   ├── session.js         # Config sessions (durci)
│   │   └── storage.js         # Config B2 + OpenAI
│   ├── features/
│   │   ├── auth/              # Authentification + brute force
│   │   │   ├── auth.controller.js   # Handlers + lockout IP
│   │   │   ├── auth.model.js        # Acces donnees JSON
│   │   │   ├── auth.routes.js
│   │   │   ├── auth.service.js
│   │   │   └── index.js
│   │   ├── knowledge/         # Base de connaissances
│   │   ├── news/              # Actualites
│   │   ├── schedules/         # Fiches horaires
│   │   └── surveys/           # Enquetes qualite
│   │       ├── surveys.controller.js  # Webhook + stats + export
│   │       ├── surveys.service.js
│   │       ├── surveys.routes.js
│   │       └── index.js
│   ├── middleware/
│   │   ├── index.js           # Export centralise
│   │   ├── auth.js            # requireAuth, requireAdmin, preventSelfModification
│   │   ├── errorHandler.js    # Gestion erreurs globale
│   │   ├── upload.js          # Multer (10 MB, PDF/TXT)
│   │   └── validation.js      # Validation donnees + mot de passe
│   └── services/
│       ├── database.service.js  # SQLite (knowledge, schedules, news, surveys)
│       ├── email.service.js     # Envoi emails invitation
│       ├── openai.service.js    # OpenAI Vector Store
│       ├── pdf.service.js       # Generation PDF/TXT
│       ├── storage.service.js   # Backblaze B2
│       └── webhook.service.js   # Notifications MessagingMe
├── public/
│   ├── index.html             # Redirect vers news
│   ├── login.html             # Page connexion (publique)
│   ├── setup-password.html    # Activation compte (publique)
│   ├── admin.html             # Gestion utilisateurs (admin only)
│   ├── news.html              # Publication actualites
│   ├── knowledge.html         # Base de connaissances
│   └── surveys.html           # Dashboard enquetes qualite
├── data/
│   ├── users.json             # Utilisateurs + invitations
│   └── knowledge.db           # Base SQLite (4 tables)
├── docs/
│   ├── ARCHITECTURE.md        # Documentation architecture complete
│   └── plans/                 # Plans d'implementation
├── .env                       # Variables d'environnement
├── Dockerfile
├── docker-compose.yml
└── package.json
```

## Features

### 1. Authentification (`/api/auth`)

Systeme par invitation uniquement. Roles admin/user. Brute force protection (5 tentatives/15min).

| Route | Methode | Auth | Description |
|-------|---------|------|-------------|
| `/api/auth/login` | POST | Non | Connexion (rate limited + lockout) |
| `/api/auth/logout` | POST | Non | Deconnexion |
| `/api/auth/verify-token` | GET | Non | Verifie token invitation |
| `/api/auth/setup-password` | POST | Non | Active un compte |
| `/api/auth/invite` | POST | Admin | Invite un utilisateur |
| `/api/auth/users` | GET | Admin | Liste utilisateurs |
| `/api/auth/change-role` | POST | Admin | Change role |
| `/api/auth/delete-user` | DELETE | Admin | Supprime utilisateur |
| `/api/auth/clean-invitations` | POST | Admin | Nettoie invitations |

### 2. Fiches Horaires (`/api/schedules`)

Upload PDF vers Backblaze B2 + notification webhook MessagingMe.

| Route | Methode | Auth | Description |
|-------|---------|------|-------------|
| `/api/schedules/upload` | POST | Session | Upload fiche (multipart) |
| `/api/schedules/files` | GET | Session | Liste fichiers B2 |
| `/api/schedules/history` | GET | Session | Historique uploads |
| `/api/schedules/delete/:id` | DELETE | Session | Supprime une fiche |

### 3. Actualites (`/api/news`)

Publication actualites avec webhook vers chatbot MessagingMe.

| Route | Methode | Auth | Description |
|-------|---------|------|-------------|
| `/api/news/publish` | POST | Session | Publie une actualite |
| `/api/news/history` | GET | Session | Historique |

### 4. Base de Connaissances (`/api/knowledge`)

Documents + Q&A vectorises via OpenAI Vector Store pour le chatbot.

| Route | Methode | Auth | Description |
|-------|---------|------|-------------|
| `/api/knowledge/upload-file` | POST | Session | Upload document PDF/TXT |
| `/api/knowledge/upload-text` | POST | Session | Upload texte (converti PDF) |
| `/api/knowledge/upload-qa` | POST | Session | Ajoute Q&A |
| `/api/knowledge/update-qa/:id` | PUT | Session | Modifie Q&A |
| `/api/knowledge/delete-qa/:id` | DELETE | Session | Supprime Q&A |
| `/api/knowledge/history` | GET | Session | Liste paginee |
| `/api/knowledge/search` | GET | Session | Recherche |

### 5. Enquetes Qualite (`/api/surveys`)

Dashboard satisfaction clients. Webhook depuis MessagingMe (WhatsApp 1-5 etoiles).

| Route | Methode | Auth | Description |
|-------|---------|------|-------------|
| `/api/surveys/webhook` | POST | Token QS | Reception webhook (rate limited) |
| `/api/surveys/stats` | GET | Session | Stats agregees |
| `/api/surveys/history` | GET | Session | Liste paginee + filtres |
| `/api/surveys/export` | GET | Session | Export CSV |

## Securite

### Couches de protection

1. **Infrastructure** : ports Docker bindes sur 127.0.0.1, reverse proxy HTTPS (NPM + Let's Encrypt)
2. **Headers HTTP** : Helmet (CSP, HSTS, X-Frame-Options, nosniff, referrer-policy)
3. **Rate limiting** : global 100/min, login 5/15min, webhook 30/min
4. **Brute force** : lockout applicatif 5 tentatives -> blocage 15 min par IP
5. **Sessions** : httpOnly, secure, sameSite strict, 8h maxAge, regeneration au login
6. **Auth** : invitation only, bcrypt (10 rounds), tokens crypto 64 hex, roles admin/user
7. **Validation** : JSON 1MB max, uploads 10MB max PDF/TXT, prepared statements SQL
8. **Erreurs** : stack trace masquee en production, messages generiques

### Variables d'Environnement

```env
PORT=3000
NODE_ENV=production
BASE_URL=https://keolisauxerre.messagingme.app
SESSION_SECRET=xxx
ADMIN_EMAIL=admin@example.com
B2_APP_KEY_ID=xxx
B2_APP_KEY=xxx
B2_BUCKET_ID=xxx
B2_BUCKET_NAME=auxerre
OPENAI_API_KEY=xxx
OPENAI_VECTOR_STORE_ID=xxx
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_USER=xxx
SMTP_PASS=xxx
SMTP_FROM=xxx
MESSAGINGME_API_TOKEN=xxx
NEWS_WEBHOOK_URL=https://ai.messagingme.app/api/iwh/xxx
SURVEY_WEBHOOK_TOKEN=xxx
```

## Demarrage

```bash
npm install
npm run dev    # http://localhost:3000
```

## Architecture

Architecture modulaire par feature (controller -> service -> routes -> index.js). Services partages en singletons. Configuration centralisee dans `/config`.

Pour les details complets, voir `docs/ARCHITECTURE.md`.
