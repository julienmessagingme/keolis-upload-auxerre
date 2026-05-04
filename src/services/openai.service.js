const OpenAI = require('openai');
const axios = require('axios');

/**
 * Service de gestion OpenAI Vector Store
 * Gère l'upload de fichiers et l'indexation pour la base de connaissances
 */
class OpenAIService {
  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
    this.vectorStoreId = process.env.OPENAI_VECTOR_STORE_ID;
    this.apiKey = process.env.OPENAI_API_KEY;
  }

  /**
   * Upload un fichier vers OpenAI Files API
   * @param {Buffer} fileBuffer - Buffer du fichier
   * @param {string} fileName - Nom du fichier
   * @returns {Promise<Object>} Fichier uploadé
   */
  async uploadFile(fileBuffer, fileName) {
    try {
      console.log(`Upload du fichier ${fileName} vers OpenAI Files...`);

      // Déterminer le type MIME selon l'extension
      const extension = fileName.toLowerCase().split('.').pop();
      const mimeType = extension === 'txt' ? 'text/plain' : 'application/pdf';

      const file = await this.openai.files.create({
        file: new File([fileBuffer], fileName, { type: mimeType }),
        purpose: 'assistants'
      });
      console.log(`Fichier uploadé avec l'ID: ${file.id}`);
      return file;
    } catch (error) {
      console.error('Erreur lors de l\'upload vers OpenAI Files:', error);
      throw error;
    }
  }

  /**
   * Ajoute un fichier au Vector Store
   * @param {string} fileId - ID du fichier OpenAI
   * @returns {Promise<Object>} Fichier ajouté au Vector Store
   */
  async addFileToVectorStore(fileId) {
    try {
      if (!this.vectorStoreId) {
        throw new Error('OPENAI_VECTOR_STORE_ID non défini dans le fichier .env');
      }

      console.log(`Ajout du fichier au Vector Store...`);
      const response = await axios.post(
        `https://api.openai.com/v1/vector_stores/${this.vectorStoreId}/files`,
        { file_id: fileId },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
            'OpenAI-Beta': 'assistants=v2'
          }
        }
      );

      const vectorStoreFile = response.data;
      console.log(`Fichier ajouté au Vector Store avec l'ID: ${vectorStoreFile.id}`);
      return vectorStoreFile;
    } catch (error) {
      console.error('Erreur lors de l\'ajout au Vector Store:', error);
      if (error.response) {
        console.error('Détails de l\'erreur API:', error.response.data);
      }
      throw error;
    }
  }

  /**
   * Attend la fin de l'indexation d'un fichier dans le Vector Store
   * @param {string} vectorStoreFileId - ID du fichier dans le Vector Store
   * @param {number} maxAttempts - Nombre maximum de tentatives
   * @returns {Promise<string>} Statut final ('completed', 'failed', etc.)
   */
  async waitForIndexation(vectorStoreFileId, maxAttempts = 60) {
    try {
      console.log(`Attente de l'indexation...`);
      let status = 'in_progress';
      let attempts = 0;

      while (status === 'in_progress' && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 1000)); // Attendre 1 seconde

        const response = await axios.get(
          `https://api.openai.com/v1/vector_stores/${this.vectorStoreId}/files/${vectorStoreFileId}`,
          {
            headers: {
              'Authorization': `Bearer ${this.apiKey}`,
              'OpenAI-Beta': 'assistants=v2'
            }
          }
        );

        status = response.data.status;
        attempts++;
        console.log(`Statut d'indexation: ${status} (tentative ${attempts}/${maxAttempts})`);
      }

      if (status === 'completed') {
        console.log(`✓ Fichier indexé avec succès dans le Vector Store`);
      } else if (status === 'failed') {
        throw new Error('L\'indexation du fichier a échoué');
      } else {
        console.log(`Indexation en cours... Statut final: ${status}`);
      }

      return status;
    } catch (error) {
      console.error('Erreur lors de l\'attente de l\'indexation:', error);
      throw error;
    }
  }

  /**
   * Upload complet: fichier + ajout au Vector Store + attente indexation
   * @param {Buffer} fileBuffer - Buffer du fichier
   * @param {string} fileName - Nom du fichier
   * @returns {Promise<Object>} Résultat complet
   */
  async uploadToVectorStore(fileBuffer, fileName) {
    try {
      // Étape 1: Upload du fichier
      console.log(`Étape 1/3: Upload du fichier ${fileName} vers OpenAI Files...`);
      const file = await this.uploadFile(fileBuffer, fileName);

      // Étape 2: Ajouter au Vector Store
      console.log(`Étape 2/3: Ajout au Vector Store via API REST...`);
      const vectorStoreFile = await this.addFileToVectorStore(file.id);

      // Étape 3: Attendre l'indexation
      console.log(`Étape 3/3: Attente de l'indexation...`);
      const status = await this.waitForIndexation(vectorStoreFile.id);

      return {
        id: vectorStoreFile.id,
        file_id: file.id,
        status: status
      };
    } catch (error) {
      console.error('Erreur lors de l\'upload vers le Vector Store:', error);
      throw error;
    }
  }

  /**
   * Supprime un fichier du Vector Store
   * @param {string} vectorStoreFileId - ID du fichier dans le Vector Store
   * @returns {Promise<Object>} Résultat de la suppression
   */
  async deleteFromVectorStore(vectorStoreFileId) {
    try {
      if (!this.vectorStoreId) {
        throw new Error('OPENAI_VECTOR_STORE_ID non défini dans le fichier .env');
      }

      console.log(`Suppression du fichier ${vectorStoreFileId} du Vector Store...`);
      const response = await axios.delete(
        `https://api.openai.com/v1/vector_stores/${this.vectorStoreId}/files/${vectorStoreFileId}`,
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'OpenAI-Beta': 'assistants=v2'
          }
        }
      );

      console.log(`✓ Fichier supprimé du Vector Store`);
      return response.data;
    } catch (error) {
      console.error('Erreur lors de la suppression du Vector Store:', error);
      if (error.response) {
        console.error('Détails de l\'erreur API:', error.response.data);
      }
      throw error;
    }
  }

  /**
   * Supprime un fichier de l'API Files OpenAI
   * @param {string} fileId - ID du fichier OpenAI
   * @returns {Promise<Object>} Résultat de la suppression
   */
  async deleteFile(fileId) {
    try {
      console.log(`Suppression du fichier ${fileId} de OpenAI Files...`);
      const file = await this.openai.files.del(fileId);
      console.log(`✓ Fichier supprimé de OpenAI Files`);
      return file;
    } catch (error) {
      console.error('Erreur lors de la suppression du fichier OpenAI:', error);
      throw error;
    }
  }
}

// Export d'une instance unique (singleton)
module.exports = new OpenAIService();
