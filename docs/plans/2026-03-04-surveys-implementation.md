# Suivi Enquêtes Qualité - Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ajouter un onglet "Enquêtes Qualité" qui reçoit les réponses de satisfaction par webhook et les affiche dans un dashboard avec stats, graphiques et export CSV.

**Architecture:** Nouvelle feature `surveys/` suivant le pattern existant (controller → service → routes → index.js). Table SQLite `surveys`. Frontend vanilla JS + Tailwind + Chart.js CDN.

**Tech Stack:** Node.js/Express, SQLite (better-sqlite3), Chart.js, Tailwind CSS CDN

---

### Task 1: Table SQLite + méthodes database

**Files:**
- Modify: `src/services/database.service.js`

**Step 1: Ajouter la création de la table `surveys` dans la méthode `initialize()`**

Après le bloc de la table `news` (après ligne 112), ajouter :

```javascript
// Table pour les enquêtes de satisfaction (surveys)
this.db.exec(`
  CREATE TABLE IF NOT EXISTS surveys (
    id TEXT PRIMARY KEY,
    phone TEXT NOT NULL,
    rating INTEGER NOT NULL,
    message TEXT,
    receivedAt TEXT NOT NULL,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

this.db.exec(`
  CREATE INDEX IF NOT EXISTS idx_surveys_receivedAt ON surveys(receivedAt DESC);
  CREATE INDEX IF NOT EXISTS idx_surveys_rating ON surveys(rating);
`);
```

**Step 2: Ajouter la section SURVEYS avec les méthodes CRUD et stats**

Après la section `// ==================== NEWS ====================` et toutes ses méthodes (avant `// ==================== MIGRATION ====================`), ajouter :

```javascript
// ==================== SURVEYS ====================

addSurvey(survey) {
  const id = survey.id || this.generateId();
  const stmt = this.db.prepare(`
    INSERT INTO surveys (id, phone, rating, message, receivedAt)
    VALUES (?, ?, ?, ?, ?)
  `);
  stmt.run(id, survey.phone, survey.rating, survey.message || null, survey.receivedAt);
  return id;
}

getSurveys(options = {}) {
  const { limit = 50, offset = 0, startDate = null, endDate = null, ratings = null } = options;
  let query = 'SELECT * FROM surveys WHERE 1=1';
  let params = [];

  if (startDate) {
    query += ' AND receivedAt >= ?';
    params.push(startDate);
  }
  if (endDate) {
    query += ' AND receivedAt <= ?';
    params.push(endDate);
  }
  if (ratings && ratings.length > 0) {
    query += ` AND rating IN (${ratings.map(() => '?').join(',')})`;
    params.push(...ratings);
  }

  query += ' ORDER BY receivedAt DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  return this.db.prepare(query).all(...params);
}

countSurveys(options = {}) {
  const { startDate = null, endDate = null, ratings = null } = options;
  let query = 'SELECT COUNT(*) as count FROM surveys WHERE 1=1';
  let params = [];

  if (startDate) {
    query += ' AND receivedAt >= ?';
    params.push(startDate);
  }
  if (endDate) {
    query += ' AND receivedAt <= ?';
    params.push(endDate);
  }
  if (ratings && ratings.length > 0) {
    query += ` AND rating IN (${ratings.map(() => '?').join(',')})`;
    params.push(...ratings);
  }

  return this.db.prepare(query).get(...params).count;
}

getSurveyStats(options = {}) {
  const { startDate = null, endDate = null } = options;
  let whereClause = 'WHERE 1=1';
  let params = [];

  if (startDate) {
    whereClause += ' AND receivedAt >= ?';
    params.push(startDate);
  }
  if (endDate) {
    whereClause += ' AND receivedAt <= ?';
    params.push(endDate);
  }

  // Moyenne et total
  const global = this.db.prepare(`
    SELECT COUNT(*) as total, AVG(rating) as average FROM surveys ${whereClause}
  `).get(...params);

  // Répartition par étoile
  const distribution = this.db.prepare(`
    SELECT rating, COUNT(*) as count FROM surveys ${whereClause} GROUP BY rating ORDER BY rating
  `).all(...params);

  // Évolution par jour
  const evolution = this.db.prepare(`
    SELECT DATE(receivedAt) as date, AVG(rating) as average, COUNT(*) as count
    FROM surveys ${whereClause}
    GROUP BY DATE(receivedAt) ORDER BY date
  `).all(...params);

  return {
    total: global.total,
    average: global.average ? Math.round(global.average * 10) / 10 : 0,
    distribution,
    evolution
  };
}

getAllSurveysForExport(options = {}) {
  const { startDate = null, endDate = null, ratings = null } = options;
  let query = 'SELECT * FROM surveys WHERE 1=1';
  let params = [];

  if (startDate) {
    query += ' AND receivedAt >= ?';
    params.push(startDate);
  }
  if (endDate) {
    query += ' AND receivedAt <= ?';
    params.push(endDate);
  }
  if (ratings && ratings.length > 0) {
    query += ` AND rating IN (${ratings.map(() => '?').join(',')})`;
    params.push(...ratings);
  }

  query += ' ORDER BY receivedAt DESC';
  return this.db.prepare(query).all(...params);
}
```

**Step 3: Vérifier que le serveur démarre sans erreur**

Run: `cd C:\Users\julie\projet-keolis-auxerre && node -e "const db = require('./src/services/database.service'); console.log('OK'); db.close();"`
Expected: `OK` sans erreur

**Step 4: Commit**

```bash
git add src/services/database.service.js
git commit -m "feat(surveys): add surveys table and database methods"
```

---

### Task 2: Feature surveys — Service

**Files:**
- Create: `src/features/surveys/surveys.service.js`

**Step 1: Créer le dossier et le fichier service**

```javascript
const databaseService = require('../../services/database.service');

class SurveysService {
  /**
   * Enregistre une nouvelle réponse de satisfaction
   */
  addSurvey(data) {
    const { phone, rating, message, date } = data;

    if (!phone || !rating || !date) {
      return { success: false, error: 'phone, rating et date sont requis' };
    }

    if (rating < 1 || rating > 5 || !Number.isInteger(rating)) {
      return { success: false, error: 'rating doit être un entier entre 1 et 5' };
    }

    const id = databaseService.addSurvey({
      phone,
      rating,
      message: message || null,
      receivedAt: date
    });

    console.log(`✓ Enquête enregistrée: ${rating}★ de ${phone.slice(-4)}`);
    return { success: true, id };
  }

  /**
   * Récupère les stats agrégées
   */
  getStats(options = {}) {
    const stats = databaseService.getSurveyStats(options);

    // Calculer % satisfaits (4-5★) et insatisfaits (1-2★)
    const satisfied = stats.distribution
      .filter(d => d.rating >= 4)
      .reduce((sum, d) => sum + d.count, 0);

    const dissatisfied = stats.distribution
      .filter(d => d.rating <= 2)
      .reduce((sum, d) => sum + d.count, 0);

    return {
      ...stats,
      satisfiedPercent: stats.total > 0 ? Math.round((satisfied / stats.total) * 100) : 0,
      dissatisfiedPercent: stats.total > 0 ? Math.round((dissatisfied / stats.total) * 100) : 0
    };
  }

  /**
   * Récupère l'historique paginé avec filtres
   */
  getHistory(options = {}) {
    const { page = 1, limit = 50, startDate, endDate, ratings } = options;
    const offset = (page - 1) * limit;

    const parsedRatings = ratings ? ratings.split(',').map(Number).filter(n => n >= 1 && n <= 5) : null;

    const items = databaseService.getSurveys({
      limit, offset,
      startDate: startDate || null,
      endDate: endDate || null,
      ratings: parsedRatings
    });

    const total = databaseService.countSurveys({
      startDate: startDate || null,
      endDate: endDate || null,
      ratings: parsedRatings
    });

    return {
      items,
      total,
      page,
      totalPages: Math.ceil(total / limit)
    };
  }

  /**
   * Génère le CSV pour export
   */
  exportCSV(options = {}) {
    const { startDate, endDate, ratings } = options;
    const parsedRatings = ratings ? ratings.split(',').map(Number).filter(n => n >= 1 && n <= 5) : null;

    const items = databaseService.getAllSurveysForExport({
      startDate: startDate || null,
      endDate: endDate || null,
      ratings: parsedRatings
    });

    // Header CSV
    const header = 'Date;Telephone;Note;Message';
    const rows = items.map(item => {
      const date = new Date(item.receivedAt).toLocaleString('fr-FR');
      const message = (item.message || '').replace(/;/g, ',').replace(/\n/g, ' ');
      return `${date};${item.phone};${item.rating};${message}`;
    });

    return [header, ...rows].join('\n');
  }
}

module.exports = new SurveysService();
```

**Step 2: Commit**

```bash
git add src/features/surveys/surveys.service.js
git commit -m "feat(surveys): add surveys service with stats, history, export"
```

---

### Task 3: Feature surveys — Controller

**Files:**
- Create: `src/features/surveys/surveys.controller.js`

**Step 1: Créer le controller**

```javascript
const surveysService = require('./surveys.service');

class SurveysController {
  /**
   * POST /api/surveys/webhook?token=xxx
   * Réception webhook MessagingMe (pas d'auth session, token en query)
   */
  webhook(req, res) {
    try {
      const token = req.query.token;
      const expectedToken = process.env.SURVEY_WEBHOOK_TOKEN;

      if (!expectedToken || token !== expectedToken) {
        return res.status(401).json({ success: false, error: 'Token invalide' });
      }

      const result = surveysService.addSurvey(req.body);

      if (!result.success) {
        return res.status(400).json(result);
      }

      return res.json(result);
    } catch (error) {
      console.error('Erreur webhook survey:', error);
      return res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
  }

  /**
   * GET /api/surveys/stats?startDate=xxx&endDate=xxx
   */
  getStats(req, res) {
    try {
      const { startDate, endDate } = req.query;
      const stats = surveysService.getStats({ startDate, endDate });
      return res.json({ success: true, ...stats });
    } catch (error) {
      console.error('Erreur stats surveys:', error);
      return res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
  }

  /**
   * GET /api/surveys/history?page=1&limit=50&startDate=xxx&endDate=xxx&ratings=1,2
   */
  getHistory(req, res) {
    try {
      const { page = 1, limit = 50, startDate, endDate, ratings } = req.query;
      const result = surveysService.getHistory({
        page: parseInt(page),
        limit: parseInt(limit),
        startDate, endDate, ratings
      });
      return res.json({ success: true, ...result });
    } catch (error) {
      console.error('Erreur history surveys:', error);
      return res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
  }

  /**
   * GET /api/surveys/export?startDate=xxx&endDate=xxx&ratings=1,2
   */
  exportCSV(req, res) {
    try {
      const { startDate, endDate, ratings } = req.query;
      const csv = surveysService.exportCSV({ startDate, endDate, ratings });

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename=enquetes-qualite.csv');
      // BOM UTF-8 pour Excel
      return res.send('\uFEFF' + csv);
    } catch (error) {
      console.error('Erreur export surveys:', error);
      return res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
  }
}

module.exports = new SurveysController();
```

**Step 2: Commit**

```bash
git add src/features/surveys/surveys.controller.js
git commit -m "feat(surveys): add surveys controller with webhook, stats, history, export"
```

---

### Task 4: Feature surveys — Routes + Index

**Files:**
- Create: `src/features/surveys/surveys.routes.js`
- Create: `src/features/surveys/index.js`

**Step 1: Créer les routes**

`surveys.routes.js` :
```javascript
const express = require('express');
const router = express.Router();
const surveysController = require('./surveys.controller');
const middleware = require('../../middleware');

// Webhook — PAS d'auth session (token en query string)
router.post(
  '/webhook',
  (req, res) => surveysController.webhook(req, res)
);

// Routes protégées par session
router.get(
  '/stats',
  middleware.requireAuth,
  (req, res) => surveysController.getStats(req, res)
);

router.get(
  '/history',
  middleware.requireAuth,
  (req, res) => surveysController.getHistory(req, res)
);

router.get(
  '/export',
  middleware.requireAuth,
  (req, res) => surveysController.exportCSV(req, res)
);

module.exports = router;
```

**Step 2: Créer l'index**

`index.js` :
```javascript
module.exports = {
  routes: require('./surveys.routes'),
  service: require('./surveys.service'),
  controller: require('./surveys.controller')
};
```

**Step 3: Commit**

```bash
git add src/features/surveys/
git commit -m "feat(surveys): add surveys routes and feature index"
```

---

### Task 5: Brancher dans app.js + config

**Files:**
- Modify: `src/app.js`
- Modify: `.env`

**Step 1: Ajouter l'import et la route dans `app.js`**

Ajouter l'import après la ligne `const knowledgeFeature = require('./features/knowledge');` :

```javascript
const surveysFeature = require('./features/surveys');
```

Ajouter la route après la ligne `app.use('/api/knowledge', knowledgeFeature.routes);` :

```javascript
// Routes des enquêtes qualité (/api/surveys/*)
app.use('/api/surveys', surveysFeature.routes);
```

**Step 2: Ajouter le token dans `.env`**

Ajouter à la fin du `.env` :

```
# Surveys webhook
SURVEY_WEBHOOK_TOKEN=survey_keolis_auxerre_2026
```

**Step 3: Tester que le serveur démarre**

Run: `cd C:\Users\julie\projet-keolis-auxerre && node -e "const app = require('./src/app'); console.log('App created OK');"`
Expected: `App created OK` (plus les logs d'initialisation)

**Step 4: Commit**

```bash
git add src/app.js .env
git commit -m "feat(surveys): register surveys routes in app and add webhook token"
```

---

### Task 6: Mettre à jour la navbar sur toutes les pages HTML

**Files:**
- Modify: `public/news.html`
- Modify: `public/index.html`
- Modify: `public/knowledge.html`
- Modify: `public/admin.html`

**Step 1: Ajouter le lien "Enquêtes Qualité" dans la navbar de chaque page**

Sur chaque fichier HTML, trouver le lien `<a href="/admin.html"` dans la navbar et ajouter **juste avant** :

```html
<a href="/surveys.html" class="text-white px-4 py-2 rounded-lg font-semibold hover:bg-white hover:bg-opacity-10 transition-all flex items-center gap-2">
    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"></path>
    </svg>
    Enquêtes Qualité
</a>
```

Sur `surveys.html` (créée à la task suivante), ce même lien aura la classe active : `bg-white bg-opacity-20` au lieu de `hover:bg-white hover:bg-opacity-10`.

**Step 2: Commit**

```bash
git add public/news.html public/index.html public/knowledge.html public/admin.html
git commit -m "feat(surveys): add Enquêtes Qualité link to navbar on all pages"
```

---

### Task 7: Créer la page `surveys.html` — Structure + filtres + cartes stats

**Files:**
- Create: `public/surveys.html`

**Step 1: Créer la page avec le HTML complet**

La page suit le même pattern que `news.html` :
- Même head (Tailwind CDN, keolis colors)
- Même navbar (avec le lien surveys actif en `bg-white bg-opacity-20`)
- Ajouter Chart.js CDN : `<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>`

Contenu principal (`<div class="container mx-auto px-4 py-8">`) :

**Barre de filtres** :
- Div flex sticky top-16 z-40 bg avec boutons période (7j actif par défaut, 30j, 90j, Personnalisé)
- 2 inputs date (du/au) cachés par défaut, affichés si "Personnalisé" sélectionné
- 5 boutons étoiles (toggle, tous actifs par défaut)
- Bouton "Export CSV" à droite

**4 cartes stats** en grid 4 colonnes :
- Note moyenne : gros chiffre + étoiles SVG jaunes + flèche tendance
- Total réponses : gros chiffre + icône
- Satisfaits : pourcentage vert + barre de progression
- Insatisfaits : pourcentage rouge + barre de progression

**Step 2: Commit**

```bash
git add public/surveys.html
git commit -m "feat(surveys): create surveys page with filters and stat cards"
```

---

### Task 8: Page surveys.html — Graphiques Chart.js

**Files:**
- Modify: `public/surveys.html`

**Step 1: Ajouter le graphique de répartition par étoiles**

Section avec un canvas `<canvas id="distributionChart">` :
- Barres horizontales (Chart.js type `bar`, `indexAxis: 'y'`)
- Labels : "1 ★", "2 ★", "3 ★", "4 ★", "5 ★"
- Couleurs : `['#EF4444', '#F97316', '#EAB308', '#84CC16', '#22C55E']`
- Afficher le nombre et % dans chaque barre

**Step 2: Ajouter le graphique d'évolution temporelle**

Section avec un canvas `<canvas id="evolutionChart">` :
- Courbe (Chart.js type `line`)
- Axe X : dates, Axe Y : note moyenne (1 à 5)
- Couleur : keolis-blue `#005596`
- Points sur la courbe, fill avec opacité

**Step 3: Commit**

```bash
git add public/surveys.html
git commit -m "feat(surveys): add distribution and evolution charts"
```

---

### Task 9: Page surveys.html — Liste des réponses + pagination

**Files:**
- Modify: `public/surveys.html`

**Step 1: Ajouter le tableau des réponses**

Sous les graphiques, section "Dernières réponses" :
- Table responsive avec colonnes : Date, Note, Téléphone, Message
- Étoiles visuelles (★ jaunes / ☆ grises) pour la note
- Téléphone masqué : fonction JS `maskPhone("+33612345678")` → `•••• 56 78`
- Lignes 1-2★ avec `bg-red-50` (fond rouge léger)
- Message tronqué avec tooltip au hover si long

**Step 2: Ajouter la pagination**

Sous le tableau :
- Boutons Précédent / Suivant
- Indicateur "Page X sur Y" + "Z résultats"

**Step 3: Commit**

```bash
git add public/surveys.html
git commit -m "feat(surveys): add responses table with pagination"
```

---

### Task 10: Page surveys.html — JavaScript (fetch API + interactivité)

**Files:**
- Modify: `public/surveys.html`

**Step 1: Ajouter le JavaScript complet**

Script en bas de page avec :

```javascript
// État global
let currentPage = 1;
let currentPeriod = '7'; // 7, 30, 90, 'custom'
let selectedRatings = []; // vide = toutes
let startDate = null;
let endDate = null;

// Fonctions principales
async function loadStats() { /* GET /api/surveys/stats + mise à jour cartes + graphiques */ }
async function loadHistory() { /* GET /api/surveys/history + mise à jour tableau */ }
function updateCharts(stats) { /* Met à jour les 2 graphiques Chart.js */ }
function maskPhone(phone) { /* Masque le numéro */ }
function setPeriod(days) { /* Calcule startDate/endDate, recharge */ }
function toggleRating(rating) { /* Toggle filtre étoile, recharge */ }
async function exportCSV() { /* GET /api/surveys/export, déclenche téléchargement */ }
async function logout() { /* POST /api/auth/logout */ }

// Init au chargement
document.addEventListener('DOMContentLoaded', () => {
  setPeriod(7);
});
```

**Step 2: Tester manuellement le flux complet**

1. Démarrer le serveur : `npm run dev`
2. Se connecter
3. Naviguer vers `/surveys.html` — vérifier que la page s'affiche (vide, pas de données)
4. Envoyer un webhook test : `curl -X POST "http://localhost:3000/api/surveys/webhook?token=survey_keolis_auxerre_2026" -H "Content-Type: application/json" -d "{\"phone\":\"+33612345678\",\"rating\":4,\"message\":\"Très bien\",\"date\":\"2026-03-04T14:30:00Z\"}"`
5. Recharger la page — vérifier que la réponse apparaît

**Step 3: Commit**

```bash
git add public/surveys.html
git commit -m "feat(surveys): add full JavaScript interactivity and API integration"
```

---

### Task 11: Test end-to-end + corrections

**Step 1: Insérer des données de test variées**

Envoyer 10-15 webhooks avec des notes variées (1 à 5), dates différentes, certains avec message, certains sans.

**Step 2: Vérifier chaque fonctionnalité**

- [ ] Dashboard stats (note moyenne, total, % satisfaits/insatisfaits)
- [ ] Graphique répartition (barres avec bonnes couleurs)
- [ ] Graphique évolution (courbe cohérente)
- [ ] Filtres période (7j, 30j, 90j, personnalisé)
- [ ] Filtres étoiles (toggle, combinables avec période)
- [ ] Liste réponses (ordre, étoiles visuelles, téléphone masqué, fond rouge 1-2★)
- [ ] Pagination
- [ ] Export CSV (téléchargement, bon contenu, téléphone en clair)
- [ ] Navbar (lien sur toutes les pages, actif sur surveys.html)
- [ ] Webhook rejeté sans token / avec mauvais token

**Step 3: Corriger les bugs éventuels et commit final**

```bash
git add -A
git commit -m "feat(surveys): finalize satisfaction survey dashboard"
```
