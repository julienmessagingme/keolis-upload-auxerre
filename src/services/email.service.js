const nodemailer = require('nodemailer');

/**
 * Service de gestion des emails
 * Envoie des emails via SMTP (nodemailer)
 */
class EmailService {
  constructor() {
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT),
      secure: process.env.SMTP_PORT === '465',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      },
      tls: {
        rejectUnauthorized: false
      }
    });
  }

  /**
   * Template HTML pour l'email d'invitation
   * @param {string} setupUrl - URL de création de mot de passe
   * @returns {string} HTML de l'email
   */
  getInvitationEmailHTML(setupUrl) {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      background-color: #f4f4f4;
      margin: 0;
      padding: 0;
    }
    .container {
      max-width: 600px;
      margin: 40px auto;
      background-color: #ffffff;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    }
    .header {
      background: linear-gradient(135deg, #005596, #0072CE);
      color: #ffffff;
      padding: 40px 30px;
      text-align: center;
    }
    .header h1 {
      margin: 0;
      font-size: 28px;
      font-weight: bold;
    }
    .header p {
      margin: 10px 0 0 0;
      font-size: 16px;
      opacity: 0.9;
    }
    .content {
      padding: 40px 30px;
    }
    .content h2 {
      color: #005596;
      font-size: 22px;
      margin-top: 0;
    }
    .content p {
      margin: 15px 0;
      color: #555;
    }
    .button-container {
      text-align: center;
      margin: 35px 0;
    }
    .button {
      display: inline-block;
      padding: 16px 40px;
      background-color: #005596;
      color: #ffffff !important;
      text-decoration: none;
      border-radius: 8px;
      font-weight: bold;
      font-size: 16px;
      transition: background-color 0.3s;
    }
    .button:hover {
      background-color: #0072CE;
    }
    .info-box {
      background-color: #f0f7ff;
      border-left: 4px solid #005596;
      padding: 15px 20px;
      margin: 25px 0;
      border-radius: 4px;
    }
    .footer {
      background-color: #f8f9fa;
      padding: 25px 30px;
      text-align: center;
      font-size: 13px;
      color: #666;
    }
    .footer p {
      margin: 5px 0;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div style="display: inline-block; background: white; border-radius: 12px; padding: 12px; margin-bottom: 15px;">
        <img src="https://f003.backblazeb2.com/file/auxerre/mme-icon+(1).png" alt="Messaging Me" style="width: 60px; height: 60px; object-fit: contain; display: block;">
      </div>
      <h1>Plateforme Keolis Auxerre</h1>
      <p>Gestion par Messaging Me</p>
    </div>

    <div class="content">
      <h2>Bienvenue!</h2>

      <p>Bonjour,</p>

      <p>Vous avez été invité à rejoindre la plateforme de gestion Keolis Auxerre. Cette plateforme vous permet de gérer les horaires, les actualités et la base de connaissances.</p>

      <div class="info-box">
        <strong>📋 Prochaines étapes:</strong>
        <ol style="margin: 10px 0; padding-left: 20px;">
          <li>Cliquez sur le bouton ci-dessous</li>
          <li>Créez votre mot de passe sécurisé</li>
          <li>Accédez à la plateforme</li>
        </ol>
      </div>

      <div class="button-container">
        <a href="${setupUrl}" class="button">Créer mon mot de passe</a>
      </div>

      <p style="font-size: 14px; color: #666; margin-top: 30px;">
        <strong>Note:</strong> Ce lien est valable pendant 7 jours. Si vous n'avez pas demandé cette invitation, vous pouvez ignorer cet email.
      </p>

      <p style="font-size: 14px; color: #666;">
        Si le bouton ne fonctionne pas, copiez et collez ce lien dans votre navigateur:<br>
        <a href="${setupUrl}" style="color: #005596; word-break: break-all;">${setupUrl}</a>
      </p>
    </div>

    <div class="footer">
      <p><strong>Plateforme Keolis Auxerre</strong></p>
      <p>Solution développée par Messaging Me</p>
      <p style="margin-top: 15px; font-size: 12px;">
        Cet email a été envoyé automatiquement, merci de ne pas y répondre.
      </p>
    </div>
  </div>
</body>
</html>
    `;
  }

  /**
   * Envoie un email d'invitation
   * @param {string} email - Email du destinataire
   * @param {string} token - Token d'invitation
   * @returns {Promise<Object>} Résultat de l'envoi
   */
  async sendInvitationEmail(email, token) {
    const setupUrl = `${process.env.BASE_URL || 'http://localhost:3000'}/setup-password.html?token=${token}`;

    const mailOptions = {
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: email,
      subject: 'Invitation Plateforme Keolis Auxerre - Créez votre compte',
      html: this.getInvitationEmailHTML(setupUrl)
    };

    try {
      const info = await this.transporter.sendMail(mailOptions);
      console.log(`📧 Email d'invitation envoyé à ${email}:`, info.messageId);
      return { success: true, messageId: info.messageId };
    } catch (error) {
      console.error(`❌ Erreur lors de l'envoi de l'email à ${email}:`, error);
      throw error;
    }
  }

  /**
   * Envoie un email générique
   * @param {Object} options - Options de l'email
   * @param {string} options.to - Destinataire
   * @param {string} options.subject - Sujet
   * @param {string} options.html - Contenu HTML
   * @param {string} options.text - Contenu texte (optionnel)
   * @returns {Promise<Object>} Résultat de l'envoi
   */
  async send({ to, subject, html, text }) {
    const mailOptions = {
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to,
      subject,
      html,
      text
    };

    try {
      const info = await this.transporter.sendMail(mailOptions);
      console.log(`📧 Email envoyé à ${to}:`, info.messageId);
      return { success: true, messageId: info.messageId };
    } catch (error) {
      console.error(`❌ Erreur lors de l'envoi de l'email à ${to}:`, error);
      throw error;
    }
  }

  /**
   * Vérifie la configuration SMTP
   * @returns {Promise<boolean>} True si la config est valide
   */
  async verifyConfig() {
    try {
      await this.transporter.verify();
      console.log('✓ Configuration SMTP valide');
      return true;
    } catch (error) {
      console.error('✗ Erreur de configuration SMTP:', error.message);
      return false;
    }
  }
}

// Export d'une instance unique (singleton)
module.exports = new EmailService();
