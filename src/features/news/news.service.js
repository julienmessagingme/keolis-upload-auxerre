const axios = require('axios');
const databaseService = require('../../services/database.service');

/**
 * Service de gestion des actualités
 * Supporte 2 slots de news en parallèle (champs 'news' et 'news2')
 */
class NewsService {

  constructor() {
    this.apiUrl = 'https://ai.messagingme.app/api/flow/set-bot-field-by-name';
    this.apiToken = 'yz6RCDk9EdWrA2KreYcPJx22wJRRDKWJ6QwSAhsLweOLBSQ8p6EXrjye3eLO';
    // Démarrer le vérificateur d'expiration toutes les minutes
    this.startExpirationChecker();
  }

  /**
   * Retourne le nom du champ API pour un slot donné
   * @param {number} slot - 1 ou 2
   * @returns {string} 'news' ou 'news2'
   */
  getFieldName(slot) {
    return slot === 2 ? 'news2' : 'news';
  }

  /**
   * Appelle l'API MessagingMe pour mettre à jour un champ news
   * @param {string} fieldName - Nom du champ ('news' ou 'news2')
   * @param {string} value - Contenu à mettre dans le champ
   * @returns {Promise<Object>} Résultat de l'appel API
   */
  async setNewsField(fieldName, value) {
    try {
      const payload = {
        name: fieldName,
        value: value
      };

      console.log(`Appel API MessagingMe [${fieldName}]:`, payload);

      const response = await axios.put(this.apiUrl, payload, {
        headers: {
          'Authorization': `Bearer ${this.apiToken}`,
          'Content-Type': 'application/json'
        }
      });

      console.log(`API MessagingMe [${fieldName}] - Succès:`, response.status);
      return { success: true, data: response.data };
    } catch (error) {
      console.error(`API MessagingMe [${fieldName}] - Erreur:`, error.message);
      if (error.response) {
        console.error('Status:', error.response.status);
        console.error('Data:', error.response.data);
      }
      return { success: false, error: error.message };
    }
  }

  /**
   * Vide un champ news (appelé quand la news expire ou est annulée)
   * @param {number} slot - Numéro du slot (1 ou 2)
   * @returns {Promise<Object>} Résultat de l'appel API
   */
  async clearNewsField(slot) {
    const fieldName = this.getFieldName(slot);
    console.log(`Vidage du champ ${fieldName}...`);
    return this.setNewsField(fieldName, ' ');
  }

  /**
   * Récupère les slots disponibles
   * @returns {Array<number>} Liste des slots libres [1], [2], [1,2] ou []
   */
  getAvailableSlots() {
    const activeNews = databaseService.getAllActiveNews();
    const usedSlots = activeNews.map(n => n.slot);
    const availableSlots = [];

    if (!usedSlots.includes(1)) availableSlots.push(1);
    if (!usedSlots.includes(2)) availableSlots.push(2);

    return availableSlots;
  }

  /**
   * Récupère le statut des news actives
   * @returns {Object} Statut des 2 slots
   */
  getActiveNewsStatus() {
    const news1 = databaseService.getActiveNewsBySlot(1);
    const news2 = databaseService.getActiveNewsBySlot(2);

    return {
      slot1: news1 ? {
        id: news1.id,
        title: news1.title,
        content: news1.content,
        expiresAt: news1.expiresAt,
        uploadedAt: news1.uploadedAt
      } : null,
      slot2: news2 ? {
        id: news2.id,
        title: news2.title,
        content: news2.content,
        expiresAt: news2.expiresAt,
        uploadedAt: news2.uploadedAt
      } : null,
      availableSlots: this.getAvailableSlots()
    };
  }

  /**
   * Publie une actualité
   * @param {string} title - Titre de l'actualité
   * @param {string} content - Contenu
   * @param {number} duration - Durée en heures ou jours
   * @param {string} durationType - 'hours' ou 'days' ou 'heures' ou 'jours'
   * @param {number} slot - Slot à utiliser (1 ou 2), optionnel (auto-sélection si non fourni)
   * @returns {Promise<Object>} Résultat
   */
  async publishNews(title, content, duration, durationType, slot = null) {
    try {
      // Vérifier les slots disponibles
      const availableSlots = this.getAvailableSlots();

      if (availableSlots.length === 0) {
        return {
          success: false,
          error: 'Les 2 slots de news sont occupés. Annulez une news avant d\'en publier une nouvelle.'
        };
      }

      // Auto-sélection du slot si non spécifié
      if (!slot) {
        slot = availableSlots[0];
      } else if (!availableSlots.includes(slot)) {
        return {
          success: false,
          error: `Le slot ${slot} est déjà occupé.`
        };
      }

      // Normaliser le type de durée
      const isDays = durationType === 'days' || durationType === 'jours';

      // Calculer la date d'expiration
      const now = new Date();
      const durationMs = isDays
        ? duration * 24 * 60 * 60 * 1000
        : duration * 60 * 60 * 1000;

      const expiresAt = new Date(now.getTime() + durationMs).toISOString();

      // Calculer la durée en heures pour l'affichage
      const durationHours = isDays ? duration * 24 : duration;

      // Formater le contenu pour l'API (titre + contenu)
      const fullContent = `${title}\n\n${content}`;

      // Envoyer vers l'API MessagingMe
      const fieldName = this.getFieldName(slot);
      const apiResult = await this.setNewsField(fieldName, fullContent);

      // Ajouter à la base de données
      const newsId = databaseService.addNews({
        title,
        content,
        uploadedAt: now.toISOString(),
        expiresAt,
        status: 'active',
        webhookSent: apiResult.success,
        slot
      });

      // Formater la date d'expiration pour l'affichage
      const expirationDate = new Date(expiresAt).toLocaleString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });

      return {
        success: true,
        id: newsId,
        titre: title,
        slot: slot,
        duree_heures: durationHours,
        expiration_date: expirationDate,
        expires_at: expiresAt,
        api_success: apiResult.success,
        api_error: apiResult.error || null
      };
    } catch (error) {
      console.error('Erreur lors de la publication de l\'actualité:', error);
      throw error;
    }
  }

  /**
   * Annule une news active
   * @param {string} newsId - ID de la news à annuler
   * @returns {Promise<Object>} Résultat
   */
  async cancelNews(newsId) {
    try {
      const news = databaseService.getNewsById(newsId);

      if (!news) {
        return { success: false, error: 'News non trouvée' };
      }

      if (news.status !== 'active') {
        return { success: false, error: 'Cette news n\'est plus active' };
      }

      // Vider le champ API
      const slot = news.slot || 1;
      const apiResult = await this.clearNewsField(slot);

      // Marquer comme annulée en base
      databaseService.cancelNews(newsId);

      console.log(`✓ News "${news.title}" (slot ${slot}) annulée`);

      return {
        success: true,
        message: `News "${news.title}" annulée`,
        slot: slot,
        api_success: apiResult.success
      };
    } catch (error) {
      console.error('Erreur lors de l\'annulation de la news:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Vérifie et traite les news expirées (pour les 2 slots)
   */
  async checkExpiredNews() {
    try {
      // Vérifier chaque slot séparément
      for (const slot of [1, 2]) {
        const expiredNews = databaseService.getExpiredActiveNewsBySlot(slot);

        if (expiredNews.length > 0) {
          const fieldName = this.getFieldName(slot);
          console.log(`📰 ${expiredNews.length} news expirée(s) sur ${fieldName}, vidage du champ...`);

          // Vider le champ news via l'API
          const result = await this.clearNewsField(slot);

          if (result.success) {
            // Marquer toutes les news expirées comme 'expired'
            for (const news of expiredNews) {
              databaseService.markNewsAsExpired(news.id);
              console.log(`✓ News "${news.title}" (slot ${slot}) marquée comme expirée`);
            }
          } else {
            console.error(`❌ Erreur lors du vidage du champ ${fieldName}:`, result.error);
          }
        }
      }
    } catch (error) {
      console.error('Erreur lors de la vérification des news expirées:', error);
    }
  }

  /**
   * Démarre le vérificateur d'expiration périodique
   */
  startExpirationChecker() {
    // Vérifier immédiatement au démarrage
    setTimeout(() => this.checkExpiredNews(), 5000);

    // Puis vérifier toutes les minutes
    setInterval(() => this.checkExpiredNews(), 60 * 1000);

    console.log('✓ Vérificateur d\'expiration des news démarré (intervalle: 1 minute)');
  }

  /**
   * Récupère l'historique des news
   * @returns {Array} Historique
   */
  getHistory(limit = 10) {
    return databaseService.getNews(limit);
  }
}

module.exports = new NewsService();
