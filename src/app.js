const express = require('express');
const session = require('express-session');
const path = require('path');
const config = require('./config');
const middleware = require('./middleware');

// Import des features
const authFeature = require('./features/auth');
const schedulesFeature = require('./features/schedules');
const newsFeature = require('./features/news');
const knowledgeFeature = require('./features/knowledge');
const surveysFeature = require('./features/surveys');

// Initialiser la base de données
config.database.initialize();

/**
 * Configure l'application Express
 * @returns {Express} Application configurée
 */
function createApp() {
  const app = express();

  // =========== MIDDLEWARES GLOBAUX ===========

  // Parser JSON
  app.use(express.json());

  // Configuration des sessions
  app.use(session(config.session));

  // =========== ROUTES PUBLIQUES ===========

  // Pages publiques (accessibles sans authentification)
  app.use('/login.html', express.static(path.join(__dirname, '..', 'public', 'login.html')));
  app.use('/setup-password.html', express.static(path.join(__dirname, '..', 'public', 'setup-password.html')));

  // =========== ROUTES API ===========

  // Routes d'authentification (/api/auth/*)
  app.use('/api/auth', authFeature.routes);

  // Routes des fiches horaires (/api/schedules/*)
  app.use('/api/schedules', schedulesFeature.routes);

  // Routes des actualités (/api/news/*)
  app.use('/api/news', newsFeature.routes);

  // Routes de la base de connaissances (/api/knowledge/*)
  app.use('/api/knowledge', knowledgeFeature.routes);

  // Routes des enquêtes qualité (/api/surveys/*)
  app.use('/api/surveys', surveysFeature.routes);

  // =========== ROUTES DES PAGES PROTÉGÉES ===========

  // Route pour l'accueil - PROTÉGÉE
  app.get('/', middleware.requireAuth, (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'news.html'));
  });

  // Route pour l'admin - ADMIN SEULEMENT
  app.get('/admin.html', middleware.requireAuth, middleware.requireAdmin, (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'admin.html'));
  });

  // Servir les fichiers statiques - PROTÉGÉS
  app.use(express.static(path.join(__dirname, '..', 'public'), {
    setHeaders: (res, filePath) => {
      // Laisser passer login.html et setup-password.html (déjà gérés au-dessus)
      if (filePath.endsWith('login.html') || filePath.endsWith('setup-password.html')) {
        return;
      }
    }
  }));

  // =========== GESTION D'ERREURS ===========

  // 404 - Route non trouvée
  app.use(middleware.notFoundHandler);

  // Gestionnaire d'erreurs global
  app.use(middleware.errorHandler);

  return app;
}

module.exports = createApp;
