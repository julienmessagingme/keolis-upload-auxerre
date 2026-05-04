const storageService = require('../../services/storage.service');
const webhookService = require('../../services/webhook.service');
const databaseService = require('../../services/database.service');

/**
 * Service de gestion des fiches horaires
 */
class SchedulesService {

  /**
   * Upload une fiche horaire vers B2
   * @param {Buffer} fileBuffer - Buffer du fichier
   * @param {string} originalName - Nom original du fichier
   * @param {string} lineName - Nom de la ligne (Ligne-1, Ligne-2, etc.)
   * @param {boolean} forceUpdate - Force le remplacement si existe
   * @returns {Promise<Object>} Résultat de l'upload
   */
  async uploadFile(fileBuffer, originalName, lineName, forceUpdate = false) {
    try {
      // Formater le nom de fichier
      const fileName = `${lineName}.pdf`;

      console.log(`Upload demandé pour: ${fileName}`);

      // Vérifier si le fichier existe déjà
      const existingFile = await storageService.findFile(fileName);

      if (existingFile) {
        console.log(`Fichier déjà existant: ${fileName}`);

        if (!forceUpdate) {
          return {
            success: false,
            error: 'Un fichier avec ce nom existe déjà',
            existingFile: {
              name: existingFile.fileName,
              url: storageService.getPublicUrl(existingFile.fileName)
            }
          };
        }

        // Supprimer l'ancien fichier
        console.log(`Suppression de l'ancien fichier: ${fileName}`);
        await storageService.deleteFile(existingFile.fileName, existingFile.fileId);
      }

      // Upload du fichier
      console.log(`Upload du fichier: ${fileName}`);
      const uploadResult = await storageService.uploadFile(fileBuffer, fileName);

      const fileUrl = storageService.getPublicUrl(fileName);
      console.log(`Upload réussi: ${fileUrl}`);

      // Envoyer le webhook
      await webhookService.notifyFileUpdate(lineName, fileUrl);

      // Ajouter à la base de données
      databaseService.addSchedule({
        fileName,
        lineName,
        fileUrl: fileUrl,
        uploadedAt: new Date().toISOString()
      });

      return {
        success: true,
        file: {
          name: fileName,
          url: fileUrl,
          size: uploadResult.contentLength
        }
      };
    } catch (error) {
      console.error('Erreur lors de l\'upload:', error);
      throw error;
    }
  }

  /**
   * Liste tous les fichiers du bucket
   * @returns {Promise<Array>} Liste des fichiers
   */
  async listFiles() {
    try {
      const files = await storageService.listFiles();
      return files.map(f => ({
        name: f.fileName,
        size: f.contentLength,
        uploadedAt: f.uploadTimestamp,
        url: storageService.getPublicUrl(f.fileName)
      }));
    } catch (error) {
      console.error('Erreur lors du listage des fichiers:', error);
      throw error;
    }
  }

  /**
   * Récupère l'historique des uploads
   * @returns {Array} Historique
   */
  getHistory() {
    return databaseService.getSchedules();
  }

  /**
   * Supprime un fichier du bucket et de l'historique
   * @param {string} scheduleId - ID de l'horaire à supprimer
   * @returns {Promise<Object>} Résultat
   */
  async deleteSchedule(scheduleId) {
    try {
      // Récupérer l'horaire
      const schedule = databaseService.getSchedules(100).find(s => s.id === scheduleId);

      if (!schedule) {
        throw new Error('Horaire non trouvé');
      }

      // Supprimer du bucket B2
      const file = await storageService.findFile(schedule.fileName);
      if (file) {
        await storageService.deleteFile(file.fileName, file.fileId);
      }

      // Supprimer de la base de données
      databaseService.deleteSchedule(scheduleId);

      return {
        success: true
      };
    } catch (error) {
      console.error('Erreur lors de la suppression:', error);
      throw error;
    }
  }
}

module.exports = new SchedulesService();
