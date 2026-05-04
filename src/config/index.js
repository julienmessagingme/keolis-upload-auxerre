/**
 * Configuration centralisée de l'application
 * Point d'entrée unique pour toute la configuration
 */

// Charger les variables d'environnement
require('dotenv').config();

module.exports = {
  // Configuration du serveur
  server: {
    port: process.env.PORT || 3000,
    env: process.env.NODE_ENV || 'development',
    baseUrl: process.env.BASE_URL || 'http://localhost:3000'
  },

  // Configuration de la base de données
  database: require('./database'),

  // Configuration du stockage (B2 + OpenAI)
  storage: require('./storage'),

  // Configuration email (SMTP)
  email: require('./email'),

  // Configuration des sessions
  session: require('./session'),

  // Configuration de l'admin initial
  admin: {
    email: process.env.ADMIN_EMAIL || 'admin@example.com'
  },

  // Configuration des webhooks (TOUTES les valeurs doivent venir du .env)
  webhooks: {
    messagingMeToken: process.env.MESSAGINGME_API_TOKEN,
    newsWebhookUrl: process.env.NEWS_WEBHOOK_URL || null
  }
};
