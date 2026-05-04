/**
 * Configuration SMTP pour l'envoi d'emails
 */
module.exports = {
  // Configuration du transporteur SMTP
  smtp: {
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_PORT === '465',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    },
    tls: {
      // Verification TLS activee en production, desactivee en dev local
      rejectUnauthorized: process.env.NODE_ENV !== 'development'
    }
  },

  // Email par défaut pour l'envoi
  from: process.env.SMTP_FROM || process.env.SMTP_USER,

  // URL de base de l'application
  baseUrl: process.env.BASE_URL || 'http://localhost:3000',

  // Durée de validité des liens d'invitation
  invitationExpiry: {
    admin: 30, // 30 jours pour l'admin
    user: 7    // 7 jours pour les utilisateurs
  }
};
