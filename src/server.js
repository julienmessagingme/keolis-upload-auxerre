const createApp = require('./app');
const config = require('./config');
const storageService = require('./services/storage.service');
const emailService = require('./services/email.service');
const authService = require('./features/auth/auth.service');

/**
 * Démarre le serveur et initialise les services
 */
async function startServer() {
  try {
    console.log('🚍 Démarrage du serveur Keolis Auxerre...\n');

    // Créer l'application Express
    const app = createApp();

    // Authentifier Backblaze B2
    try {
      await storageService.authenticate();
      console.log(`📦 Bucket B2: ${config.storage.b2.bucketName}`);
    } catch (error) {
      console.error('❌ Erreur d\'authentification B2:', error.message);
      process.exit(1);
    }

    // Afficher le webhook configuré
    console.log(`🔗 Webhook: ${config.webhooks.newsWebhookUrl}\n`);

    // Vérifier la configuration SMTP
    console.log('🔧 Vérification de la configuration SMTP...');
    const smtpValid = await emailService.verifyConfig();
    if (!smtpValid) {
      console.warn('⚠️  SMTP non configuré correctement. L\'envoi d\'emails pourrait échouer.\n');
    } else {
      console.log('');
    }

    // Initialiser l'administrateur si necessaire
    console.log('👤 Initialisation de l\'administrateur...');
    const adminInvitation = await authService.initializeAdmin(config.admin.email);
    if (adminInvitation) {
      console.log(`✓ Invitation admin creee pour: ${config.admin.email}`);
      // Securite: ne PAS afficher le token complet dans les logs
      const maskedToken = adminInvitation.token.substring(0, 8) + '...' + adminInvitation.token.substring(adminInvitation.token.length - 4);
      console.log(`🔑 Token admin: ${maskedToken} (envoye par email)`);
      console.log(`📧 Verifiez la boite mail de ${config.admin.email} pour le lien d'activation\n`);
    } else {
      console.log(`✓ Admin deja initialise pour: ${config.admin.email}\n`);
    }

    // Nettoyer les invitations expirees
    console.log('✅ Systeme d\'authentification pret');
    const remainingInvitations = authService.cleanInvitations();
    console.log(`✓ Nettoyage invitations: ${remainingInvitations} expirees/utilisees supprimees\n`);

    // Démarrer le serveur
    const PORT = config.server.port;
    app.listen(PORT, () => {
      console.log(`🚀 Serveur démarré sur http://localhost:${PORT}`);
      console.log(`📝 Environnement: ${config.server.env}`);
      console.log(`\n✨ Prêt à recevoir des requêtes!\n`);
    });

    // Démarrer le cron de sync stats (apres le listen pour ne pas bloquer le boot)
    if (process.env.SUPABASE_URL && process.env.MM_TOKEN_AUXERRE) {
      const { startStatsCron } = require('./features/stats/cron');
      startStatsCron();
    } else {
      console.warn('⚠️  Stats cron non demarre : SUPABASE_URL ou MM_TOKEN_AUXERRE manquant');
    }

  } catch (error) {
    console.error('❌ Erreur fatale lors du démarrage du serveur:', error);
    process.exit(1);
  }
}

// Démarrer le serveur
startServer();

// Gestion de l'arrêt gracieux
process.on('SIGINT', () => {
  console.log('\n\n🛑 Arrêt du serveur...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n\n🛑 Arrêt du serveur...');
  process.exit(0);
});
