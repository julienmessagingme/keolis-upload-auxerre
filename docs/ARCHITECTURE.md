# Architecture Technique - Keolis Auxerre

**Version**: 3.1
**Date**: 2026-03-04
**Auteur**: Julien Dumas / MessagingMe

---

## 1. Vue d'ensemble

Application web interne pour Keolis Auxerre permettant la gestion de :
- **Fiches horaires** (upload PDF vers Backblaze B2)
- **Actualites** (publication vers chatbot MessagingMe)
- **Base de connaissances** (documents + Q&A vers OpenAI Vector Store)
- **Enquetes qualite** (dashboard satisfaction clients WhatsApp)
- **Administration** (gestion utilisateurs par invitation, 2FA, audit trail)

### URL de production

| Environnement | URL |
|---|---|
| Application | `https://keolisauxerre.messagingme.app` |
| VPS | `146.59.233.252` (OVH) |
| Conteneur Docker | `keolis-auxerre` (port interne 3000) |

---

## 2. Stack technique

| Couche | Technologie | Version |
|---|---|---|
| Runtime | Node.js | 20 (Alpine) |
| Framework | Express.js | 4.18 |
| Base de donnees (app) | SQLite | better-sqlite3 12.6 |
| Base de donnees (users) | JSON fichier | `data/users.json` |
| Stockage fichiers | Backblaze B2 | SDK 1.7 |
| IA / Vectorisation | OpenAI Vector Store | SDK 6.16 |
| Email | Nodemailer | 7.0 (SMTP Gmail) |
| Auth | express-session + bcrypt 12 rounds | bcrypt 6.0 |
| 2FA/TOTP | otplib + qrcode | v13 |
| Securite headers | Helmet | 8.1 |
| Rate limiting | express-rate-limit | 8.2 |
| PDF | PDFKit | 0.17 |
| Frontend | HTML + Tailwind CSS (CDN) | - |
| Graphiques | Chart.js (CDN) | - |
| Conteneurisation | Docker | docker-compose v1 |
| Reverse proxy | Nginx Proxy Manager | via Docker |
| SSL | Let's Encrypt | auto-renew via NPM |

---

## 3. Architecture applicative

### 3.1 Structure des dossiers

```
projet-keolis-auxerre/
|-- src/
|   |-- server.js                    # Point d'entree, bootstrap services
|   |-- app.js                       # Config Express, securite, CORS, audit, routes
|   |-- config/
|   |   |-- index.js                 # Config centralisee (point d'entree)
|   |   |-- database.js              # Config JSON (users) — ecriture atomique
|   |   |-- email.js                 # Config SMTP — TLS verifie en production
|   |   |-- session.js               # Config sessions — fail-fast si secret faible
|   |   +-- storage.js               # Config B2 + OpenAI
|   |-- features/
|   |   |-- auth/                    # Authentification + 2FA
|   |   |   |-- auth.controller.js   # Handlers HTTP + lockout persistant + 2FA
|   |   |   |-- auth.model.js        # Acces donnees JSON
|   |   |   |-- auth.routes.js       # Definition routes (auth + 2FA + password)
|   |   |   |-- auth.service.js      # Logique metier + TOTP + backup codes
|   |   |   +-- index.js             # Barrel export
|   |   |-- knowledge/               # Base de connaissances
|   |   |-- news/                    # Actualites
|   |   |-- schedules/               # Fiches horaires
|   |   +-- surveys/                 # Enquetes qualite
|   |-- middleware/
|   |   |-- index.js                 # Export centralise
|   |   |-- auth.js                  # requireAuth, requireAdmin, preventSelfModification
|   |   |-- errorHandler.js          # Gestion erreurs — anti-XSS, messages generiques en prod
|   |   |-- upload.js                # Multer (fichiers)
|   |   +-- validation.js            # Validation donnees — politique mot de passe 12 chars
|   +-- services/
|       |-- database.service.js      # SQLite (singleton) — audit trail + whitelist colonnes
|       |-- email.service.js         # SMTP
|       |-- openai.service.js        # OpenAI Vector Store
|       |-- pdf.service.js           # Generation PDF/TXT
|       |-- storage.service.js       # Backblaze B2
|       +-- webhook.service.js       # Notifications MessagingMe
|-- public/
|   |-- .well-known/security.txt     # RFC 9116 — politique divulgation responsable
|   |-- index.html                   # Redirect -> news
|   |-- login.html                   # Page connexion (publique) — support 2FA
|   |-- setup-password.html          # Activation compte (publique)
|   |-- account.html                 # Gestion compte (2FA + changement mot de passe)
|   |-- admin.html                   # Gestion users (admin)
|   |-- news.html                    # Publication actualites
|   |-- knowledge.html               # Base de connaissances
|   +-- surveys.html                 # Dashboard enquetes
|-- data/
|   |-- users.json                   # Utilisateurs + invitations + secrets 2FA
|   +-- knowledge.db                 # Base SQLite (+ table login_audit)
|-- docs/
|   +-- ARCHITECTURE.md              # Ce document
|-- .env                             # Variables d'environnement
|-- Dockerfile
+-- docker-compose.yml
```

### 3.2 Pattern architectural

**Feature-based modular architecture** : chaque domaine metier est un module autonome.

```
Feature Module:
  controller.js  ->  Gere les requetes HTTP (validation I/O)
  service.js     ->  Logique metier
  routes.js      ->  Definition des routes Express
  model.js       ->  Acces donnees (optionnel, auth uniquement)
  index.js       ->  Barrel export { routes, service, controller }
```

**Services partages** : singletons instancies au demarrage, injectes par `require()`.

**Flux de requete** :
```
Client -> Nginx Proxy Manager (HTTPS/443)
       -> Docker network (172.18.0.x)
       -> Express (port 3000)
       -> Helmet (headers securite)
       -> CORS middleware (origine autorisee uniquement)
       -> Rate limiter (global 100 req/min)
       -> Rate limiter (specifique si applicable)
       -> Audit log (POST/PUT/DELETE API)
       -> Session middleware
       -> Route matching
       -> Auth middleware (si protege)
       -> Controller -> Service -> Database/API externe
       -> Response JSON ou HTML
```

---

## 4. Base de donnees

### 4.1 SQLite (`data/knowledge.db`)

5 tables :

#### `knowledge_items`
| Colonne | Type | Description |
|---|---|---|
| id | TEXT PK | ID unique (timestamp_random) |
| type | TEXT NOT NULL | Type principal |
| subType | TEXT NOT NULL | Sous-type (qa, file, text) |
| question | TEXT | Question (Q&A) |
| answer | TEXT | Reponse (Q&A) |
| title | TEXT | Titre (texte/fichier) |
| fileName | TEXT NOT NULL | Nom du fichier |
| uploadedAt | TEXT NOT NULL | Date ISO |
| vectorStoreFileId | TEXT NOT NULL | ID fichier OpenAI |
| fileId | TEXT NOT NULL | ID fichier OpenAI |
| status | TEXT NOT NULL | Statut indexation |

Index : `subType`, `uploadedAt DESC`, `createdAt DESC`

**Protection** : whitelist de colonnes autorisees pour les updates (anti-injection SQL via noms de colonnes).

#### `schedules`
| Colonne | Type | Description |
|---|---|---|
| id | TEXT PK | ID unique |
| fileName | TEXT NOT NULL | Nom fichier PDF |
| lineName | TEXT | Nom de la ligne |
| fileUrl | TEXT NOT NULL | URL publique B2 |
| uploadedAt | TEXT NOT NULL | Date ISO |

#### `news`
| Colonne | Type | Description |
|---|---|---|
| id | TEXT PK | ID unique |
| title | TEXT NOT NULL | Titre |
| content | TEXT NOT NULL | Contenu HTML |
| uploadedAt | TEXT NOT NULL | Date publication |
| expiresAt | TEXT | Date expiration (nullable) |
| status | TEXT | active / expired / cancelled |
| webhookSent | BOOLEAN | Webhook envoye |
| slot | INTEGER | Slot 1 ou 2 |

#### `surveys`
| Colonne | Type | Description |
|---|---|---|
| id | TEXT PK | ID unique |
| phone | TEXT NOT NULL | Numero (5-20 chars, valide) |
| rating | INTEGER NOT NULL | Note 1-5 (parseInt strict) |
| message | TEXT | Message optionnel (max 2000 chars) |
| receivedAt | TEXT NOT NULL | Date ISO (validee) |

Index : `receivedAt DESC`, `rating`

#### `login_audit` (NOUVEAU)
| Colonne | Type | Description |
|---|---|---|
| id | INTEGER PK AUTO | ID auto-increment |
| email | TEXT NOT NULL | Email tente |
| ip | TEXT NOT NULL | Adresse IP client |
| userAgent | TEXT | User-Agent du navigateur |
| success | INTEGER NOT NULL | 1 = reussi, 0 = echoue |
| failReason | TEXT | Raison echec (bad_credentials, bad_2fa) |
| createdAt | DATETIME | Horodatage |

Index : `email`, `ip`, `createdAt DESC`

**Retention** : nettoyage automatique des logs > 90 jours a chaque demarrage.

### 4.2 JSON (`data/users.json`)

```json
{
  "users": [
    {
      "id": "uuid",
      "email": "user@example.com",
      "password": "$2b$12$...",
      "role": "admin|user",
      "status": "active",
      "totpEnabled": true,
      "totpSecret": "BASE32SECRET",
      "backupCodes": "[\"sha256hash\",...]",
      "passwordChangedAt": "ISO date",
      "createdAt": "ISO date"
    }
  ],
  "invitations": [
    {
      "id": "uuid",
      "email": "invited@example.com",
      "token": "hex64",
      "invitedBy": "admin@email",
      "role": "user",
      "status": "pending|used",
      "expiresAt": "ISO date"
    }
  ]
}
```

**Ecriture atomique** : utilisation d'un fichier temporaire + `fs.renameSync()` pour eviter la corruption en cas de crash.

---

## 5. API Endpoints

### 5.1 Authentification (`/api/auth`)

| Route | Methode | Auth | Description |
|---|---|---|---|
| `/api/auth/login` | POST | Non | Connexion (rate limited + lockout + 2FA) |
| `/api/auth/logout` | POST | Non | Deconnexion |
| `/api/auth/verify-token` | POST | Non | Verifie token invitation (token dans body) |
| `/api/auth/setup-password` | POST | Non | Active un compte invite |
| `/api/auth/change-password` | POST | Session | Change le mot de passe |
| `/api/auth/2fa/setup` | POST | Session | Genere secret TOTP + QR code |
| `/api/auth/2fa/verify` | POST | Session | Confirme activation 2FA (+ backup codes) |
| `/api/auth/2fa/disable` | POST | Session | Desactive 2FA (mot de passe requis) |
| `/api/auth/2fa/status` | GET | Session | Statut 2FA + codes restants |
| `/api/auth/invite` | POST | Admin | Invite un utilisateur |
| `/api/auth/users` | GET | Admin | Liste utilisateurs (inclut statut 2FA) |
| `/api/auth/change-role` | POST | Admin | Change role |
| `/api/auth/delete-user` | DELETE | Admin | Supprime utilisateur |
| `/api/auth/clean-invitations` | POST | Admin | Nettoie invitations |
| `/api/auth/login-audit` | GET | Admin | Historique connexions |

### 5.2 Fiches horaires (`/api/schedules`)

| Route | Methode | Auth | Description |
|---|---|---|---|
| `/api/schedules/upload` | POST | Session | Upload PDF (multipart) |
| `/api/schedules/files` | GET | Session | Liste fichiers B2 |
| `/api/schedules/history` | GET | Session | Historique uploads |
| `/api/schedules/delete/:id` | DELETE | Session | Supprime une fiche |

### 5.3 Actualites (`/api/news`)

| Route | Methode | Auth | Description |
|---|---|---|---|
| `/api/news/publish` | POST | Session | Publie une actualite |
| `/api/news/history` | GET | Session | Historique |

### 5.4 Base de connaissances (`/api/knowledge`)

| Route | Methode | Auth | Description |
|---|---|---|---|
| `/api/knowledge/upload-file` | POST | Session | Upload document PDF/TXT |
| `/api/knowledge/upload-text` | POST | Session | Upload texte libre |
| `/api/knowledge/upload-qa` | POST | Session | Ajoute Q&A |
| `/api/knowledge/update-qa/:id` | PUT | Session | Modifie Q&A |
| `/api/knowledge/delete-qa/:id` | DELETE | Session | Supprime Q&A |
| `/api/knowledge/history` | GET | Session | Liste paginee (max 200/page) |
| `/api/knowledge/search` | GET | Session | Recherche |

### 5.5 Enquetes qualite (`/api/surveys`)

| Route | Methode | Auth | Description |
|---|---|---|---|
| `/api/surveys/webhook` | POST | Token QS | Reception webhook (timing-safe) |
| `/api/surveys/stats` | GET | Session | Stats agregees |
| `/api/surveys/history` | GET | Session | Liste paginee (max 200/page) |
| `/api/surveys/export` | GET | Session | Export CSV (cap 100k lignes) |

---

## 6. Securite

### 6.1 Vue d'ensemble

L'application implemente une strategie de **defense en profondeur** avec **41 mesures de securite** reparties sur 8 couches :

```
COUCHE 1 — INFRASTRUCTURE RESEAU
  |  Ports Docker 127.0.0.1 only, Nginx Proxy Manager, Let's Encrypt
  v
COUCHE 2 — TRANSPORT
  |  HTTPS obligatoire, HSTS, certificats TLS verifies
  v
COUCHE 3 — HEADERS HTTP
  |  Helmet (CSP, X-Frame-Options, CORP, nosniff, no-referrer)
  v
COUCHE 4 — CONTROLE D'ACCES
  |  CORS strict, rate limiting (3 niveaux), double lockout IP+compte (anti-VPN)
  v
COUCHE 5 — AUTHENTIFICATION
  |  Session securisee, bcrypt 12 rounds, 2FA TOTP, backup codes
  v
COUCHE 6 — AUTORISATION
  |  Roles admin/user, middleware requireAuth/requireAdmin, preventSelfModification
  v
COUCHE 7 — VALIDATION DES DONNEES
  |  Politique MDP 12 chars, prepared statements SQL, whitelist colonnes,
  |  echappement HTML, validation webhook stricte, limites bornees
  v
COUCHE 8 — AUDIT & TRACABILITE
  |  Login audit trail SQLite, audit log API mutations, security.txt RFC 9116
```

### 6.2 Infrastructure reseau

```
Internet
   |
   v
[VPS 146.59.233.252] (OVH, Ubuntu)
   |
   v
[Nginx Proxy Manager] (:80/:443)
   |  - Certificat Let's Encrypt auto-renew
   |  - Proxy pass vers conteneurs Docker
   |  - Panel admin sur 127.0.0.1:81 (SSH tunnel requis)
   |
   v (reseau Docker: mcp-robot_default)
   |
   +-- keolis-auxerre     (127.0.0.1:3000 -> :3000)
   +-- keolis-granddole   (127.0.0.1:3002 -> :3000)
   +-- mieuxassure        (127.0.0.1:3001 -> :3000)
   +-- n8n                (127.0.0.1:5678 -> :5678)
```

**Ports Docker** : TOUS bindes sur `127.0.0.1` pour empecher l'acces direct depuis Internet. Docker bypass UFW par defaut — cette mesure est critique.

**Acces NPM admin** : `ssh -L 81:127.0.0.1:81 ubuntu@146.59.233.252` puis `http://localhost:81`

### 6.3 Headers HTTP (Helmet)

| Header | Valeur | Protection |
|---|---|---|
| Content-Security-Policy | `default-src 'self'; script-src 'self' 'unsafe-inline' cdn.tailwindcss.com cdn.jsdelivr.net; style-src 'self' 'unsafe-inline'; img-src 'self' data: f003.backblazeb2.com; connect-src 'self'; font-src 'self'; object-src 'none'; frame-ancestors 'none'` | XSS, injection, clickjacking |
| Strict-Transport-Security | `max-age=31536000; includeSubDomains` | Force HTTPS 1 an |
| X-Frame-Options | SAMEORIGIN | Clickjacking |
| X-Content-Type-Options | nosniff | MIME sniffing |
| X-DNS-Prefetch-Control | off | DNS prefetch leaks |
| Referrer-Policy | no-referrer | Fuite URL/donnees |
| Cross-Origin-Opener-Policy | same-origin | Isolation fenetre |
| Cross-Origin-Resource-Policy | same-origin | Isolation ressources |
| X-Permitted-Cross-Domain-Policies | none | Flash/PDF policies |

### 6.4 CORS (Cross-Origin Resource Sharing)

Middleware custom bloquant toute requete cross-origin :

```
Origin presente  ->  Verification contre liste autorisee [BASE_URL]
                ->  Si non autorise: HTTP 403 "Origin non autorise"
                ->  Si autorise: Access-Control-Allow-Origin + Credentials
Pas d'Origin    ->  Requete same-origin normale (passee)
```

Pas d'API publique — aucune origine tierce autorisee.

### 6.5 Rate limiting (3 niveaux)

| Scope | Limite | Fenetre | Message |
|---|---|---|---|
| Global (toutes routes) | 100 req | 1 min | "Trop de requetes" |
| `/api/auth/login` | 5 req | 15 min | "Trop de tentatives de connexion" |
| `/api/surveys/webhook` | 30 req | 1 min | "Trop de requetes webhook" |

Configuration : `standardHeaders: true`, `legacyHeaders: false`, `trust proxy: 1`.

Headers de reponse : `RateLimit-Policy`, `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset`.

### 6.6 Protection brute force — Double lockout (anti-VPN)

Le systeme implemente un **double lockout persistant** en SQLite (table `login_audit`) pour contrer les attaques par VPN ou proxies rotatifs.

**Probleme resolu** : un lockout uniquement par IP est contourne par un attaquant utilisant un VPN — il obtient 5 tentatives par IP, soit des milliers de tentatives sur un meme compte. Le lockout par compte bloque cette strategie.

#### Lockout par IP (brute force classique)

| Parametre | Valeur |
|---|---|
| Tentatives max | **5** |
| Duree lockout | **15 minutes** |
| Cle de groupement | Adresse IP source |
| Message | "Trop de tentatives depuis cette adresse" |

#### Lockout par compte (anti-VPN / proxies rotatifs)

| Parametre | Valeur |
|---|---|
| Tentatives max | **8** (toutes IPs confondues) |
| Duree lockout | **30 minutes** |
| Cle de groupement | Adresse email |
| Tracking | Compte aussi les IPs distinctes (`COUNT(DISTINCT ip)`) |
| Message | "Ce compte est temporairement verrouille" (vague, ne revele pas la detection multi-IP) |

#### Alerte email admin automatique

L'admin recoit un email d'alerte lorsque :
- Un compte atteint le seuil de verrouillage (8 tentatives echouees)
- **OU** 3+ IPs distinctes tentent le meme compte avec 5+ tentatives

L'email inclut : compte cible, nombre de tentatives, IPs distinctes, derniere IP, date/heure.

#### Scenario d'attaque avec VPN

```
Attaquant avec VPN:
  IP-1: 5 tentatives -> IP bloquee (lockout IP)
  IP-2: 3 tentatives -> COMPTE BLOQUE (8 total = lockout compte)
  IP-3 a IP-500: REFUSE — le compte est verrouille 30 min
  + Admin recoit une alerte email (3+ IPs = attaque multi-IP detectee)
```

#### Comportement detaille

1. Chaque tentative de login est enregistree en SQLite (succes ou echec)
2. Verification IP : nombre d'echecs recents par IP via requete SQL
3. Verification compte : nombre d'echecs recents par email, toutes IPs confondues
4. A 5 echecs/IP (15 min) OU 8 echecs/email (30 min) : HTTP 429
5. Si 3+ IPs distinctes ou seuil compte atteint : alerte admin par email
6. Un login reussi ne reset PAS les logs (tracabilite complete)

#### Parametres (auth.controller.js)

```javascript
IP_MAX_ATTEMPTS = 5           // Lockout IP
IP_LOCKOUT_DURATION = 15      // minutes
ACCOUNT_MAX_ATTEMPTS = 8      // Lockout compte (anti-VPN)
ACCOUNT_LOCKOUT_DURATION = 30  // minutes
ALERT_DISTINCT_IPS = 3        // Seuil alerte multi-IP
```

| Donnee | Stockage | Retention |
|---|---|---|
| Tentatives de login | SQLite `login_audit` | 90 jours |
| IP, email, user-agent, raison | Persistant (survit aux redemarrages) | Nettoyage auto au boot |

### 6.7 Authentification

#### Systeme d'invitation (pas d'inscription publique)

- **Tokens** : `crypto.randomBytes(32)` = 256 bits d'entropie (64 hex chars)
- **Expiration** : 30 jours (admin) / 7 jours (user)
- **Token dans POST body** : jamais en query string (protection logs/historique)
- **Nettoyage** : invitations expirees/utilisees purgees au demarrage

#### Politique de mots de passe

| Exigence | Valeur |
|---|---|
| Longueur minimale | **12 caracteres** |
| Majuscule | Au moins 1 (A-Z) |
| Minuscule | Au moins 1 (a-z) |
| Chiffre | Au moins 1 (0-9) |
| Caractere special | Au moins 1 (!@#$%^&*...) |

Validation cote serveur (`middleware/validation.js`) + cote client (temps reel avec indicateurs visuels).

#### Hachage des mots de passe

| Parametre | Valeur |
|---|---|
| Algorithme | **bcrypt** |
| Salt rounds | **12** (~400ms sur hardware moderne) |
| Salt | Genere automatiquement par bcrypt |

Les anciens mots de passe (10 rounds) restent compatibles avec `bcrypt.compare()`.

#### Changement de mot de passe

- Endpoint : `POST /api/auth/change-password`
- Verification du mot de passe actuel avant modification
- Verification que le nouveau est different de l'ancien
- Validation complete de la politique de complexite
- Accessible via la page `/account.html`

### 6.8 Authentification a deux facteurs (2FA/TOTP)

Implementation complete de TOTP (RFC 6238) compatible avec Google Authenticator, Authy, Microsoft Authenticator.

#### Flow de setup 2FA

```
1. Utilisateur connecte -> POST /api/auth/2fa/setup
   <- Secret TOTP genere + QR code data URL

2. Utilisateur scanne le QR code avec son application

3. Utilisateur entre le code 6 chiffres -> POST /api/auth/2fa/verify
   <- 2FA active + 10 codes de secours affiches une seule fois

4. Codes de secours haches en SHA-256 et stockes dans users.json
```

#### Flow de login avec 2FA

```
1. POST /api/auth/login { email, password }
   <- { success: true, requires2FA: true }

2. POST /api/auth/login { email, password, totpCode }
   <- Verification TOTP ou code de secours
   <- Session creee si valide
```

#### Codes de secours

| Parametre | Valeur |
|---|---|
| Nombre | 10 codes |
| Format | 8 caracteres hexadecimaux (4 bytes) |
| Stockage | SHA-256 hashes dans users.json |
| Usage | One-time use (supprime apres utilisation) |
| Affichage | Une seule fois lors du setup |

#### Desactivation 2FA

Necessite la saisie du mot de passe (empeche la desactivation par un attaquant avec une session volee).

#### Parametres TOTP

| Parametre | Valeur |
|---|---|
| Algorithme | SHA-1 (standard RFC 6238) |
| Periode | 30 secondes |
| Chiffres | 6 |
| Issuer | "Keolis Auxerre" |
| Bibliotheque | otplib v13 |

### 6.9 Sessions

| Parametre | Valeur | Raison |
|---|---|---|
| `name` | `keolis.sid` | Masque l'identite Express |
| `httpOnly` | `true` | Bloque acces JavaScript au cookie |
| `secure` | `true` (prod) | Cookie HTTPS uniquement |
| `sameSite` | `strict` | Protection CSRF stricte |
| `maxAge` | 8 heures | Limite la duree de session |
| `resave` | `false` | Evite les ecritures inutiles |
| `saveUninitialized` | `false` | Pas de session vide |
| `secret` | 64+ chars aleatoires | Fail-fast si < 32 chars en prod |

**Session fixation** : `req.session.regenerate()` a chaque login reussi.

**Fail-fast** : le serveur refuse de demarrer si `SESSION_SECRET` est absent ou trop court (< 32 chars) en production.

### 6.10 Securite webhook surveys

| Mesure | Detail |
|---|---|
| Token secret | Variable `SURVEY_WEBHOOK_TOKEN` |
| Comparaison timing-safe | `crypto.timingSafeEqual` (anti timing attack) |
| Rate limiting | 30 req/min |
| Validation payload | phone 5-20 chars, rating 1-5, date ISO 8601, message max 2000 chars |

### 6.11 Validation des entrees

| Donnee | Validation | Protection |
|---|---|---|
| JSON body | Limite 1 MB | DoS payload |
| Upload fichiers | Multer, max 10 MB, PDF/TXT | Upload malicieux |
| Email | Regex validation | Injection |
| Mot de passe | 12 chars, 4 categories | Brute force |
| Rating survey | parseInt + check 1-5 | Injection |
| Phone survey | 5-20 chars, String().trim() | Overflow |
| Date survey | new Date() + isNaN check | Injection |
| Message survey | Tronque a 2000 chars | DoS |
| Pagination limit | Math.min(max(1, n), 200) | DoS |
| Export CSV | Cap 100 000 lignes | DoS memoire |
| Requetes SQL | Prepared statements (better-sqlite3) | SQL injection |
| Colonnes update | Whitelist (`ALLOWED_COLUMNS`) | SQL injection via noms |

### 6.12 Gestion des erreurs

| Mode | Comportement |
|---|---|
| Production | Messages generiques ("Une erreur est survenue"), pas de stack trace |
| Development | Message d'erreur detaille + stack trace |

**Anti-XSS** : tous les messages injectes dans les pages HTML d'erreur sont echappes via `escapeHtml()` (encode `&`, `<`, `>`, `"`, `'`).

### 6.13 CORS strict

Middleware custom rejetant toute requete avec un header `Origin` qui ne correspond pas a `BASE_URL`.

### 6.14 Audit trail

#### Audit des connexions (SQLite)

Chaque tentative de login est enregistree dans `login_audit` :
- Email, IP, User-Agent
- Succes/echec + raison
- Horodatage
- Consultable par l'admin via `GET /api/auth/login-audit`
- Retention 90 jours

#### Audit des mutations API

Toutes les requetes `POST`, `PUT`, `DELETE` sur `/api/*` sont loggees en console :

```
[AUDIT] 2026-03-04T14:30:00Z | POST /api/news/publish | user=julien@messagingme.fr | ip=::ffff:172.18.0.1
```

### 6.15 Conformite

| Standard | Implementation |
|---|---|
| **RFC 9116** | `/.well-known/security.txt` avec contact, langues, expiration |
| **RFC 6238** | TOTP pour l'authentification 2FA |
| **OWASP** | bcrypt, CSP, HSTS, session fixation, rate limiting, input validation |

### 6.16 Tokens et secrets — protection en logs

- **Token admin initial** : masque dans les logs (`abc12345...wxyz`)
- **Token invitation** : jamais en query string (POST body uniquement)
- **Webhook URL** : externalisee dans `.env` (plus de hardcoded)
- **SESSION_SECRET** : 64+ chars, fail-fast en production

---

## 7. Services externes

### 7.1 Backblaze B2
- **Usage** : Stockage des fiches horaires PDF
- **Bucket** : `auxerre`
- **URL publique** : `https://f003.backblazeb2.com/file/auxerre/`

### 7.2 OpenAI
- **Usage** : Vectorisation de la base de connaissances pour le chatbot
- **API** : Files API + Vector Store API
- **Timeout indexation** : 60 secondes

### 7.3 MessagingMe (webhook)
- **Usage** : Notification chatbot lors de publication news/horaires
- **Auth** : Token API en header

### 7.4 SMTP (Gmail)
- **Usage** : Envoi emails invitation
- **Config** : `smtp.gmail.com:465` (SSL)
- **TLS** : `rejectUnauthorized: true` en production

---

## 8. Deploiement

### 8.1 Docker

**Dockerfile** : Node.js 20 Alpine, `npm ci --omit=dev`

**docker-compose.yml** :
```yaml
services:
  keolis-auxerre:
    build: .
    ports:
      - "127.0.0.1:3000:3000"    # IMPORTANT: bind localhost only
    env_file: .env
    volumes:
      - ./data:/app/data
    restart: unless-stopped
```

### 8.2 Procedure de deploiement

```bash
# 1. Creer l'archive (exclure .env, data, node_modules)
tar --exclude='node_modules' --exclude='.git' --exclude='.env' --exclude='data' -czf deploy.tar.gz -C . .

# 2. Envoyer au VPS
scp deploy.tar.gz ubuntu@146.59.233.252:/home/ubuntu/keolis-auxerre/

# 3. Extraire
ssh ubuntu@146.59.233.252 "cd /home/ubuntu/keolis-auxerre && tar -xzf deploy.tar.gz && rm deploy.tar.gz"

# 4. Rebuild (OBLIGATOIRE: rm -f avant up, bug docker-compose v1)
ssh ubuntu@146.59.233.252 "sudo docker rm -f keolis-auxerre && cd /home/ubuntu/keolis-auxerre && sudo docker-compose up -d --build"

# 5. Reconnecter au reseau NPM
ssh ubuntu@146.59.233.252 "sudo docker network connect mcp-robot_default keolis-auxerre"

# 6. Verifier
ssh ubuntu@146.59.233.252 "sudo docker logs keolis-auxerre --tail 20"
```

---

## 9. Variables d'environnement

| Variable | Description | Critique |
|---|---|---|
| `PORT` | Port du serveur | Non |
| `NODE_ENV` | `production` (OBLIGATOIRE en prod) | **OUI** |
| `BASE_URL` | URL publique | OUI |
| `SESSION_SECRET` | Secret sessions (64+ chars) | **OUI** |
| `ADMIN_EMAIL` | Email admin initial | OUI |
| `B2_APP_KEY_ID` | Backblaze App Key ID | OUI |
| `B2_APP_KEY` | Backblaze App Key | OUI |
| `B2_BUCKET_ID` | Backblaze Bucket ID | OUI |
| `B2_BUCKET_NAME` | Nom du bucket | Non |
| `OPENAI_API_KEY` | Cle API OpenAI | OUI |
| `OPENAI_VECTOR_STORE_ID` | ID Vector Store | OUI |
| `SMTP_HOST` | Serveur SMTP | Non |
| `SMTP_PORT` | Port SMTP | Non |
| `SMTP_USER` | User SMTP | OUI |
| `SMTP_PASS` | Password SMTP | OUI |
| `SMTP_FROM` | Email expediteur | Non |
| `MESSAGINGME_API_TOKEN` | Token API MessagingMe | OUI |
| `NEWS_WEBHOOK_URL` | URL webhook news | OUI |
| `SURVEY_WEBHOOK_TOKEN` | Token webhook enquetes | OUI |

**`NODE_ENV=production`** active : cookies secure, TLS verification, messages d'erreur generiques, session secret fail-fast, rate limit headers.

---

## 10. Frontend

### Pages

| Page | Acces | Description |
|---|---|---|
| `login.html` | Public | Connexion + 2FA step |
| `setup-password.html` | Public (token) | Activation compte |
| `account.html` | Session | Gestion compte (2FA + mot de passe) |
| `news.html` | Session | Publication actualites (page d'accueil) |
| `knowledge.html` | Session | Gestion base connaissances |
| `surveys.html` | Session | Dashboard enquetes qualite |
| `admin.html` | Admin | Gestion utilisateurs |

### Protection des pages

- `login.html` et `setup-password.html` : routes statiques publiques
- `account.html` : protegee par `middleware.requireAuth`
- `admin.html` : protegee par `middleware.requireAuth` + `middleware.requireAdmin`
- Toutes les autres : protegees par `express.static` servi apres les routes protegees
- `/.well-known/security.txt` : accessible sans auth (RFC 9116)

---

## 11. Synthese securite

### Mesures implementees (41)

| # | Mesure | Couche | Impact |
|---|---|---|---|
| 1 | Ports Docker 127.0.0.1 | Infra | Bloque acces direct conteneurs |
| 2 | HTTPS Let's Encrypt | Transport | Chiffrement TLS |
| 3 | HSTS 1 an | Transport | Force HTTPS |
| 4 | TLS verifie en prod | Transport | Empeche MITM |
| 5 | Helmet (10+ headers) | Headers | XSS, clickjacking, sniffing |
| 6 | CSP strict | Headers | Script/style injection |
| 7 | CORS strict | Acces | Bloque origines tierces |
| 8 | Rate limit global 100/min | Acces | DoS |
| 9 | Rate limit login 5/15min | Acces | Brute force |
| 10 | Rate limit webhook 30/min | Acces | Spam webhook |
| 11 | Lockout par IP (SQLite persistant) | Acces | Brute force classique (5 tentatives/15 min) |
| 12 | **Lockout par compte anti-VPN** | Acces | **Brute force multi-IP (8 tentatives/30 min, toutes IPs)** |
| 13 | **Alerte email admin auto** | Acces | **Notification attaque multi-IP (3+ IPs distinctes)** |
| 14 | Sessions httpOnly+secure+strict | Auth | Vol session |
| 15 | Session regeneration | Auth | Session fixation |
| 16 | Session secret fail-fast | Auth | Secret faible |
| 17 | bcrypt 12 rounds | Auth | Cracking hors-ligne |
| 18 | MDP 12 chars 4 categories | Auth | Dictionnaire/brute force |
| 19 | 2FA TOTP (RFC 6238) | Auth | Compromission MDP |
| 20 | 10 backup codes SHA-256 | Auth | Perte app TOTP |
| 21 | Changement MDP securise | Auth | Rotation credentials |
| 22 | Invitation only (pas inscription) | Auth | Creation comptes non autorisee |
| 23 | Tokens 256 bits crypto | Auth | Prediction tokens |
| 24 | Token POST body (pas URL) | Auth | Fuite logs/historique |
| 25 | Roles admin/user | Authz | Privilege escalation |
| 26 | preventSelfModification | Authz | Auto-escalation admin |
| 27 | Prepared statements SQL | Validation | SQL injection |
| 28 | Whitelist colonnes update | Validation | SQL injection noms |
| 29 | Validation webhook stricte | Validation | Injection payload |
| 30 | Limites pagination bornees | Validation | DoS memoire |
| 31 | Export cap 100k lignes | Validation | DoS memoire |
| 32 | Token webhook timing-safe | Validation | Timing side-channel |
| 33 | escapeHtml() erreurs | Validation | XSS reflete |
| 34 | Messages generiques en prod | Validation | Fuite info |
| 35 | **Messages lockout vagues** | Validation | **Ne revele pas detection multi-IP a l'attaquant** |
| 36 | Ecriture atomique users.json | Integrite | Corruption donnees |
| 37 | Login audit trail SQLite | Audit | Tracabilite connexions |
| 38 | Audit log mutations API | Audit | Tracabilite actions |
| 39 | security.txt RFC 9116 | Conformite | Divulgation responsable |
| 40 | Token admin masque en logs | Logs | Fuite credentials |
| 41 | Webhook URL externalisee | Config | Secret hors code source |
