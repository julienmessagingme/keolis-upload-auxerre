const openaiService = require('../../services/openai.service');
const pdfService = require('../../services/pdf.service');
const databaseService = require('../../services/database.service');

/**
 * Service de gestion de la base de connaissances
 */
class KnowledgeService {

  /**
   * Upload un document vers le Vector Store
   * @param {Buffer} fileBuffer - Buffer du fichier
   * @param {string} fileName - Nom du fichier
   * @returns {Promise<Object>} Résultat
   */
  async uploadFile(fileBuffer, fileName) {
    try {
      const result = await openaiService.uploadToVectorStore(fileBuffer, fileName);

      databaseService.addKnowledgeItem({
        type: 'file',
        subType: 'file',
        fileName,
        uploadedAt: new Date().toISOString(),
        vectorStoreFileId: result.id,
        fileId: result.file_id,
        status: result.status
      });

      return {
        success: true,
        result
      };
    } catch (error) {
      console.error('Erreur lors de l\'upload vers le Vector Store:', error);
      throw error;
    }
  }

  /**
   * Crée un PDF à partir de texte et l'upload au Vector Store
   * @param {string} text - Contenu textuel
   * @param {string} title - Titre du document
   * @returns {Promise<Object>} Résultat
   */
  async uploadText(text, title) {
    try {
      // Créer le PDF
      const pdfBuffer = await pdfService.createFromText(text, title);
      const fileName = `${title.replace(/[^a-z0-9]/gi, '_')}.pdf`;

      // Upload vers Vector Store
      const result = await openaiService.uploadToVectorStore(pdfBuffer, fileName);

      databaseService.addKnowledgeItem({
        type: 'text',
        subType: 'text',
        title,
        fileName,
        uploadedAt: new Date().toISOString(),
        vectorStoreFileId: result.id,
        fileId: result.file_id,
        status: result.status
      });

      return {
        success: true,
        result
      };
    } catch (error) {
      console.error('Erreur lors de l\'upload de texte:', error);
      throw error;
    }
  }

  /**
   * Crée un fichier TXT Q&A et l'upload au Vector Store
   * @param {string} question - La question
   * @param {string} answer - La réponse
   * @returns {Promise<Object>} Résultat
   */
  async uploadQA(question, answer) {
    try {
      // Verifier les doublons
      const duplicate = databaseService.findDuplicateQA(question, answer);
      let upserted = false;

      if (duplicate) {
        if (duplicate.field === 'question') {
          // Meme question : verifier si la reponse est identique
          if (duplicate.answer && duplicate.answer.trim() === answer.trim()) {
            throw new Error('Cette Q&A existe deja a l\'identique');
          }
          // Meme question, reponse differente -> upsert : supprimer l'ancienne
          await this.deleteQA(duplicate.id);
          upserted = true;
        } else {
          // Meme reponse, question differente -> rejet
          throw new Error('Doublon detecte : une Q&A avec la meme reponse existe deja');
        }
      }

      // Creer le fichier TXT Q&A (plus leger que PDF)
      const txtBuffer = pdfService.createTextFromQA(question, answer);
      const questionPreview = question.substring(0, 30).replace(/[^a-z0-9]/gi, '_');
      const fileName = `QA_${questionPreview}.txt`;

      // Upload vers Vector Store
      const result = await openaiService.uploadToVectorStore(txtBuffer, fileName);

      databaseService.addKnowledgeItem({
        type: 'qa',
        subType: 'qa',
        question,
        answer,
        fileName,
        uploadedAt: new Date().toISOString(),
        vectorStoreFileId: result.id,
        fileId: result.file_id,
        status: result.status
      });

      return {
        success: true,
        upserted,
        result
      };
    } catch (error) {
      console.error('Erreur lors de l\'upload Q&A:', error);
      throw error;
    }
  }

  /**
   * Met à jour une Q&A existante
   * @param {string} itemId - ID de l'item à mettre à jour
   * @param {string} question - Nouvelle question
   * @param {string} answer - Nouvelle réponse
   * @returns {Promise<Object>} Résultat
   */
  async updateQA(itemId, question, answer) {
    try {
      // Récupérer l'item existant
      const existingItem = databaseService.getKnowledgeItemById(itemId);

      if (!existingItem) {
        throw new Error('Item non trouvé');
      }

      // Vérifier les doublons (en excluant l'item en cours de modification)
      const duplicate = databaseService.findDuplicateQA(question, answer, itemId);
      if (duplicate) {
        const field = duplicate.field === 'question' ? 'question' : 'réponse';
        throw new Error(`Doublon détecté : une Q&A avec la même ${field} existe déjà`);
      }

      // Supprimer l'ancien fichier OpenAI
      try {
        if (existingItem.vectorStoreFileId) {
          await openaiService.deleteFromVectorStore(existingItem.vectorStoreFileId);
        }
        if (existingItem.fileId) {
          await openaiService.deleteFile(existingItem.fileId);
        }
      } catch (error) {
        console.warn('Erreur lors de la suppression de l\'ancien fichier (peut-être déjà supprimé):', error.message);
      }

      // Créer et uploader le nouveau fichier TXT
      const txtBuffer = pdfService.createTextFromQA(question, answer);
      const questionPreview = question.substring(0, 30).replace(/[^a-z0-9]/gi, '_');
      const fileName = `QA_${questionPreview}.txt`;

      const result = await openaiService.uploadToVectorStore(txtBuffer, fileName);

      // Mettre à jour dans la base de données
      databaseService.updateKnowledgeItem(itemId, {
        question,
        answer,
        fileName,
        uploadedAt: new Date().toISOString(),
        vectorStoreFileId: result.id,
        fileId: result.file_id,
        status: result.status
      });

      return {
        success: true,
        result
      };
    } catch (error) {
      console.error('Erreur lors de la mise à jour Q&A:', error);
      throw error;
    }
  }

  /**
   * Supprime une Q&A
   * @param {string} itemId - ID de l'item à supprimer
   * @returns {Promise<Object>} Résultat
   */
  async deleteQA(itemId) {
    try {
      // Récupérer l'item existant
      const existingItem = databaseService.getKnowledgeItemById(itemId);

      if (!existingItem) {
        throw new Error('Item non trouvé');
      }

      // Supprimer du Vector Store et de OpenAI Files
      try {
        if (existingItem.vectorStoreFileId) {
          await openaiService.deleteFromVectorStore(existingItem.vectorStoreFileId);
        }
        if (existingItem.fileId) {
          await openaiService.deleteFile(existingItem.fileId);
        }
      } catch (error) {
        console.warn('Erreur lors de la suppression du fichier OpenAI (peut-être déjà supprimé):', error.message);
      }

      // Supprimer de la base de données
      databaseService.deleteKnowledgeItem(itemId);

      return {
        success: true
      };
    } catch (error) {
      console.error('Erreur lors de la suppression Q&A:', error);
      throw error;
    }
  }

  /**
   * Import en masse de paires Q&A avec progression
   * @param {Array<{question: string, answer: string}>} pairs - Paires Q&A
   * @param {Function} onProgress - Callback de progression
   * @param {Function} isCancelled - Fonction vérifiant l'annulation
   * @returns {Promise<Object>} Résumé { total, successes, failures }
   */
  async importBulkQA(pairs, onProgress, isCancelled) {
    const total = pairs.length;
    let successes = 0;
    let upserts = 0;
    const failures = [];

    for (let i = 0; i < total; i++) {
      if (isCancelled()) {
        onProgress({ type: 'cancelled', index: i, total, successes, upserts, failures });
        break;
      }

      const pair = pairs[i];
      onProgress({
        type: 'progress',
        index: i,
        total,
        question: pair.question.substring(0, 80)
      });

      try {
        const result = await this.uploadQA(pair.question.trim(), pair.answer.trim());
        successes++;
        if (result && result.upserted) upserts++;
        onProgress({
          type: 'success',
          index: i,
          total,
          successes,
          upserts,
          failureCount: failures.length
        });
      } catch (error) {
        failures.push({
          index: i,
          question: pair.question.substring(0, 80),
          error: error.message
        });
        onProgress({
          type: 'failure',
          index: i,
          total,
          successes,
          upserts,
          failureCount: failures.length,
          error: error.message
        });
      }
    }

    return { total, successes, upserts, failures };
  }

  /**
   * Récupère tous les items de la base de connaissances avec pagination
   * @param {Object} options - Options de pagination et filtrage
   * @returns {Object} { items, total, page, totalPages }
   */
  getHistory(options = {}) {
    const { page = 1, limit = 50, subType = null } = options;
    const offset = (page - 1) * limit;

    const items = databaseService.getKnowledgeItems({ limit, offset, subType });
    const total = databaseService.countKnowledgeItems(subType);
    const totalPages = Math.ceil(total / limit);

    return {
      items,
      total,
      page: parseInt(page),
      totalPages,
      hasMore: page < totalPages
    };
  }

  /**
   * Recherche dans la base de connaissances
   * @param {string} searchTerm - Terme de recherche
   * @param {Object} options - Options de pagination et filtrage
   * @returns {Object} Résultats de recherche
   */
  search(searchTerm, options = {}) {
    const { page = 1, limit = 50, subType = null } = options;
    const offset = (page - 1) * limit;

    const items = databaseService.searchKnowledgeItems(searchTerm, { limit, offset, subType });
    const total = databaseService.countSearchKnowledgeItems(searchTerm, subType);
    const totalPages = Math.ceil(total / limit);

    return {
      items,
      searchTerm,
      total,
      page: parseInt(page),
      totalPages,
      hasMore: page < totalPages
    };
  }
}

module.exports = new KnowledgeService();
