const axios = require('axios');

/**
 * Service de gestion des webhooks
 * Envoie des notifications vers l'API MessagingMe
 */
class WebhookService {
  constructor() {
    this.apiUrl = 'https://ai.messagingme.app/api/flow/set-bot-field-by-name';
    this.apiToken = process.env.MESSAGINGME_API_TOKEN;
  }

  /**
   * Envoie une notification de mise à jour de fichier
   * @param {string} name - Nom du champ (ex: "Ligne-1")
   * @param {string} value - Valeur (URL du fichier)
   * @returns {Promise<Object>} Réponse de l'API
   */
  async notifyFileUpdate(name, value) {
    try {
      const payload = {
        name,
        value
      };

      console.log('Envoi de la notification API:', payload);

      const response = await axios.post(this.apiUrl, payload, {
        headers: {
          'Authorization': `Bearer ${this.apiToken}`,
          'Content-Type': 'application/json'
        }
      });

      console.log('Notification API envoyée avec succès:', response.status);
      return response.data;
    } catch (error) {
      console.error('Erreur lors de l\'envoi de la notification API:', error.message);
      // Ne pas faire échouer l'upload si la notification échoue
      return null;
    }
  }

  /**
   * Envoie ou met à jour le champ news via l'API MessagingMe
   * @param {string} content - Contenu de la news (ou " " pour vider)
   * @returns {Promise<Object>} Réponse de l'API
   */
  async setNewsField(content) {
    try {
      const payload = {
        name: 'news',
        value: content
      };

      console.log('Envoi de la news vers MessagingMe:', payload);

      const response = await axios.post(this.apiUrl, payload, {
        headers: {
          'Authorization': `Bearer ${this.apiToken}`,
          'Content-Type': 'application/json'
        }
      });

      console.log('News envoyée avec succès:', response.status);
      return { success: true, data: response.data };
    } catch (error) {
      console.error('Erreur lors de l\'envoi de la news:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Vide le champ news (appelé quand la news expire)
   * @returns {Promise<Object>} Réponse de l'API
   */
  async clearNewsField() {
    console.log('Vidage du champ news (expiration)...');
    return this.setNewsField(' ');
  }

  /**
   * Envoie une notification générique
   * @param {string} url - URL du webhook
   * @param {Object} payload - Données à envoyer
   * @param {Object} options - Options supplémentaires (headers, etc.)
   * @returns {Promise<Object>} Réponse de l'API
   */
  async send(url, payload, options = {}) {
    try {
      console.log(`Envoi webhook vers ${url}:`, payload);

      const response = await axios.post(url, payload, {
        headers: {
          'Content-Type': 'application/json',
          ...options.headers
        }
      });

      console.log('Webhook envoyé avec succès:', response.status);
      return response.data;
    } catch (error) {
      console.error(`Erreur lors de l'envoi du webhook vers ${url}:`, error.message);
      return null;
    }
  }
}

// Export d'une instance unique (singleton)
module.exports = new WebhookService();
