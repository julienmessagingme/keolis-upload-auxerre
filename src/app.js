const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const config = require('./config');
const middleware = require('./middleware');

// Import des features
const authFeature = require('./features/auth');
const schedulesFeature = require('./features/schedules');
const newsFeature = require('./features/news');
const knowledgeFeature = require('./features/knowledge');
const surveysFeature = require('./features/surveys');
const statsFeature = require('./features/stats');
const dashboardsFeature = require('./features/dashboards');
const busFeature = require('./features/bus-agent');

// Initialiser la base de données
config.database.initialize();

/**
 * Configure l'application Express
 * @returns {Express} Application configurée
 */
function createApp() {
  const app = express();

  // =========== SÉCURITÉ ===========

  // Trust proxy (derrière Nginx Proxy Manager)
  app.set('trust proxy', 1);

  // Headers de sécurité (Helmet)
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "cdn.tailwindcss.com", "cdn.jsdelivr.net", "cdn.sheetjs.com"],
        scriptSrcAttr: ["'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "f003.backblazeb2.com"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  }));

  // Rate limiting global (100 req/min par IP)
  app.use(rateLimit({
    windowMs: 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'Trop de requêtes, réessayez dans une minute' }
  }));

  // Rate limiting strict sur login (5 tentatives / 15 min par IP)
  app.use('/api/auth/login', rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'Trop de tentatives de connexion. Réessayez dans 15 minutes.' }
  }));

  // Rate limiting sur le webhook surveys (30 req/min — protège contre le spam)
  app.use('/api/surveys/webhook', rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'Trop de requêtes webhook' }
  }));

  // Rate limiting sur l'agent horaires bus (60 req/min — appele par le flow WhatsApp)
  app.use('/api/bus', rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'Trop de requêtes' }
  }));

  // =========== CORS ===========

  // Bloquer les requetes cross-origin (pas d'API publique)
  app.use((req, res, next) => {
    const origin = req.get('Origin');
    if (origin) {
      // Autoriser uniquement notre propre domaine
      const allowed = [config.server.baseUrl];
      if (!allowed.includes(origin)) {
        return res.status(403).json({ success: false, error: 'Origin non autorise' });
      }
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    }
    // Pas de headers CORS si pas d'Origin (requetes same-origin normales)
    next();
  });

  // =========== MIDDLEWARES GLOBAUX ===========

  // Parser JSON (limite a 1MB)
  app.use(express.json({ limit: '1mb' }));

  // Configuration des sessions
  app.use(session(config.session));

  // =========== AUDIT LOG ===========

  // Log des actions sensibles (mutations API) pour tracabilite
  app.use('/api', (req, res, next) => {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      const user = req.session?.user?.email || 'anonymous';
      const ip = req.ip;
      console.log(`[AUDIT] ${new Date().toISOString()} | ${req.method} ${req.originalUrl} | user=${user} | ip=${ip}`);
    }
    next();
  });

  // =========== ROUTES PUBLIQUES ===========

  // security.txt (RFC 9116) — accessible sans auth
  app.use('/.well-known', express.static(path.join(__dirname, '..', 'public', '.well-known')));

  // Pages publiques (accessibles sans authentification)
  app.use('/login.html', express.static(path.join(__dirname, '..', 'public', 'login.html')));
  app.use('/setup-password.html', express.static(path.join(__dirname, '..', 'public', 'setup-password.html')));

  // Favicon accessible publiquement
  app.use('/favicon2.png', express.static(path.join(__dirname, '..', 'public', 'favicon2.png')));

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

  // Routes des stats custom events MessagingMe (/api/stats/*)
  app.use('/api/stats', statsFeature.routes);

  // Routes des tableaux personnels (/api/dashboards/*)
  app.use('/api/dashboards', dashboardsFeature.routes);

  // Routes de l'agent horaires bus (/api/bus/*) — appele par le flow WhatsApp
  app.use('/api/bus', busFeature.routes);

  // =========== ROUTES DES PAGES PROTÉGÉES ===========

  // Route pour l'accueil - PROTÉGÉE
  app.get('/', middleware.requireAuth, (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'news.html'));
  });

  // Route pour le compte utilisateur - PROTÉGÉE
  app.get('/account.html', middleware.requireAuth, (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'account.html'));
  });

  // Pages protégées - requièrent authentification
  app.get('/news.html', middleware.requireAuth, (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'news.html'));
  });

  app.get('/knowledge.html', middleware.requireAuth, (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'knowledge.html'));
  });

  app.get('/surveys.html', middleware.requireAuth, (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'surveys.html'));
  });

  app.get('/stats.html', middleware.requireAuth, (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'stats.html'));
  });

  app.get('/dashboards.html', middleware.requireAuth, (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'dashboards.html'));
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
