const fs = require('fs');
const path = require('path');

/**
 * Service de gestion des historiques
 * Persiste les historiques dans data/history.json
 */
class HistoryService {
  constructor() {
    this.historyFile = path.join(__dirname, '..', '..', 'data', 'history.json');
    this.initialize();
  }

  /**
   * Initialise le fichier d'historique s'il n'existe pas
   */
  initialize() {
    const dataDir = path.join(__dirname, '..', '..', 'data');

    // Créer le dossier data si nécessaire
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    // Créer le fichier d'historique s'il n'existe pas
    if (!fs.existsSync(this.historyFile)) {
      const initialData = {
        schedules: [],
        news: [],
        knowledge: []
      };
      fs.writeFileSync(this.historyFile, JSON.stringify(initialData, null, 2), 'utf8');
      console.log('✓ Fichier d\'historique créé: data/history.json');
    }
  }

  /**
   * Lit toutes les données d'historique
   * @returns {Object} { schedules: [], news: [], knowledge: [] }
   */
  readAll() {
    try {
      const data = fs.readFileSync(this.historyFile, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.error('Erreur lors de la lecture de l\'historique:', error);
      return { schedules: [], news: [], knowledge: [] };
    }
  }

  /**
   * Écrit les données d'historique
   * @param {Object} data - Données complètes
   * @returns {boolean} Success
   */
  writeAll(data) {
    try {
      fs.writeFileSync(this.historyFile, JSON.stringify(data, null, 2), 'utf8');
      return true;
    } catch (error) {
      console.error('Erreur lors de l\'écriture de l\'historique:', error);
      return false;
    }
  }

  /**
   * Récupère l'historique d'un type spécifique
   * @param {string} type - 'schedules', 'news', ou 'knowledge'
   * @returns {Array} Historique (max 10 items)
   */
  get(type) {
    const data = this.readAll();
    return data[type] || [];
  }

  /**
   * Génère un ID unique pour un item d'historique
   * @returns {string} ID unique
   */
  generateId() {
    return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Ajoute un item à l'historique
   * @param {string} type - 'schedules', 'news', ou 'knowledge'
   * @param {Object} item - Item à ajouter
   * @returns {boolean} Success
   */
  add(type, item) {
    try {
      const data = this.readAll();

      if (!data[type]) {
        data[type] = [];
      }

      // Ajouter un ID unique si absent
      if (!item.id) {
        item.id = this.generateId();
      }

      // Ajouter au début
      data[type].unshift(item);

      // Limiter à 10 items
      if (data[type].length > 10) {
        data[type] = data[type].slice(0, 10);
      }

      return this.writeAll(data);
    } catch (error) {
      console.error(`Erreur lors de l'ajout à l'historique ${type}:`, error);
      return false;
    }
  }

  /**
   * Met à jour un item dans l'historique
   * @param {string} type - 'schedules', 'news', ou 'knowledge'
   * @param {string} itemId - ID de l'item à mettre à jour
   * @param {Object} updatedItem - Nouvelles données de l'item
   * @returns {boolean} Success
   */
  update(type, itemId, updatedItem) {
    try {
      const data = this.readAll();

      if (!data[type]) {
        return false;
      }

      const index = data[type].findIndex(item => item.id === itemId);
      if (index === -1) {
        console.error(`Item ${itemId} non trouvé dans l'historique ${type}`);
        return false;
      }

      // Conserver l'ID
      updatedItem.id = itemId;
      data[type][index] = updatedItem;

      return this.writeAll(data);
    } catch (error) {
      console.error(`Erreur lors de la mise à jour de l'historique ${type}:`, error);
      return false;
    }
  }

  /**
   * Supprime un item spécifique de l'historique
   * @param {string} type - 'schedules', 'news', ou 'knowledge'
   * @param {string} itemId - ID de l'item à supprimer
   * @returns {boolean} Success
   */
  delete(type, itemId) {
    try {
      const data = this.readAll();

      if (!data[type]) {
        return false;
      }

      const index = data[type].findIndex(item => item.id === itemId);
      if (index === -1) {
        console.error(`Item ${itemId} non trouvé dans l'historique ${type}`);
        return false;
      }

      data[type].splice(index, 1);

      return this.writeAll(data);
    } catch (error) {
      console.error(`Erreur lors de la suppression de l'historique ${type}:`, error);
      return false;
    }
  }

  /**
   * Efface l'historique d'un type spécifique
   * @param {string} type - 'schedules', 'news', ou 'knowledge'
   * @returns {boolean} Success
   */
  clear(type) {
    try {
      const data = this.readAll();
      data[type] = [];
      return this.writeAll(data);
    } catch (error) {
      console.error(`Erreur lors de l'effacement de l'historique ${type}:`, error);
      return false;
    }
  }

  /**
   * Efface tout l'historique
   * @returns {boolean} Success
   */
  clearAll() {
    try {
      const data = {
        schedules: [],
        news: [],
        knowledge: []
      };
      return this.writeAll(data);
    } catch (error) {
      console.error('Erreur lors de l\'effacement de tout l\'historique:', error);
      return false;
    }
  }
}

// Export d'une instance unique (singleton)
module.exports = new HistoryService();
