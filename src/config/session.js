/**
 * Configuration des sessions utilisateur
 */

// Fail-fast si SESSION_SECRET absent ou trop court en production
const sessionSecret = process.env.SESSION_SECRET;
if (process.env.NODE_ENV === 'production' && (!sessionSecret || sessionSecret.length < 32)) {
  throw new Error('SESSION_SECRET doit etre defini et contenir au moins 32 caracteres en production');
}

module.exports = {
  secret: sessionSecret || 'dev-only-secret-not-for-production-' + require('crypto').randomBytes(16).toString('hex'),
  resave: false,
  saveUninitialized: false,
  name: 'keolis.sid', // Nom personnalisé (masque Express)
  cookie: {
    // HTTPS en production uniquement
    secure: process.env.NODE_ENV === 'production',
    // Empêche l'accès JavaScript au cookie (protection XSS)
    httpOnly: true,
    // Protection CSRF — cookie envoyé uniquement pour les requêtes same-site
    sameSite: 'strict',
    // Durée de vie du cookie : 8 heures (au lieu de 24)
    maxAge: 8 * 60 * 60 * 1000
  }
};
