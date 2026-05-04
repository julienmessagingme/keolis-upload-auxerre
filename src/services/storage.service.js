const B2 = require('backblaze-b2');

/**
 * Service de gestion du stockage Backblaze B2
 * Abstrait toutes les opérations liées au stockage de fichiers
 */
class StorageService {
  constructor() {
    this.b2 = new B2({
      applicationKeyId: process.env.B2_APP_KEY_ID,
      applicationKey: process.env.B2_APP_KEY
    });
    this.authData = null;
    this.uploadUrl = null;
    this.uploadAuthToken = null;
  }

  /**
   * Authentifie le client B2
   * @returns {Promise<Object>} Données d'authentification
   */
  async authenticate() {
    try {
      this.authData = await this.b2.authorize();
      return this.authData;
    } catch (error) {
      console.error('Erreur d\'authentification B2:', error);
      throw error;
    }
  }

  /**
   * Obtient une URL d'upload valide
   * @returns {Promise<Object>} URL et token d'upload
   */
  async getUploadUrl() {
    try {
      const response = await this.b2.getUploadUrl({
        bucketId: process.env.B2_BUCKET_ID
      });
      this.uploadUrl = response.data.uploadUrl;
      this.uploadAuthToken = response.data.authorizationToken;
      return response.data;
    } catch (error) {
      console.error('Erreur lors de l\'obtention de l\'URL d\'upload:', error);
      throw error;
    }
  }

  /**
   * Liste tous les fichiers du bucket
   * @param {number} maxFileCount - Nombre maximum de fichiers à retourner
   * @returns {Promise<Array>} Liste des fichiers
   */
  async listFiles(maxFileCount = 10000) {
    try {
      const response = await this.b2.listFileNames({
        bucketId: process.env.B2_BUCKET_ID,
        maxFileCount
      });
      return response.data.files;
    } catch (error) {
      console.error('Erreur lors du listage des fichiers:', error);
      throw error;
    }
  }

  /**
   * Supprime un fichier du bucket
   * @param {string} fileName - Nom du fichier
   * @param {string} fileId - ID du fichier B2
   * @returns {Promise<void>}
   */
  async deleteFile(fileName, fileId) {
    try {
      await this.b2.deleteFileVersion({
        fileId: fileId,
        fileName: fileName
      });
      console.log(`Fichier supprimé: ${fileName}`);
    } catch (error) {
      console.error('Erreur lors de la suppression du fichier:', error);
      throw error;
    }
  }

  /**
   * Upload un fichier sur B2
   * @param {Buffer} fileBuffer - Buffer du fichier
   * @param {string} fileName - Nom du fichier
   * @returns {Promise<Object>} Données du fichier uploadé
   */
  async uploadFile(fileBuffer, fileName) {
    try {
      // Obtenir une nouvelle URL d'upload
      await this.getUploadUrl();

      const response = await this.b2.uploadFile({
        uploadUrl: this.uploadUrl,
        uploadAuthToken: this.uploadAuthToken,
        fileName: fileName,
        data: fileBuffer
      });

      return response.data;
    } catch (error) {
      console.error('Erreur lors de l\'upload sur B2:', error);
      throw error;
    }
  }

  /**
   * Vérifie si un fichier existe dans le bucket
   * @param {string} fileName - Nom du fichier à chercher
   * @returns {Promise<Object|null>} Fichier trouvé ou null
   */
  async findFile(fileName) {
    try {
      const files = await this.listFiles();
      return files.find(f => f.fileName === fileName) || null;
    } catch (error) {
      console.error('Erreur lors de la recherche du fichier:', error);
      throw error;
    }
  }

  /**
   * Génère l'URL publique d'un fichier
   * @param {string} fileName - Nom du fichier
   * @returns {string} URL publique
   */
  getPublicUrl(fileName) {
    const bucketName = process.env.B2_BUCKET_NAME;
    return `https://f003.backblazeb2.com/file/${bucketName}/${fileName}`;
  }
}

// Export d'une instance unique (singleton)
module.exports = new StorageService();
