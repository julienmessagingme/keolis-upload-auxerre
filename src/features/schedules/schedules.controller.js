const schedulesService = require('./schedules.service');

/**
 * Controller de gestion des fiches horaires
 */
class SchedulesController {
  /**
   * POST /api/schedules/upload - Upload une fiche horaire
   */
  async upload(req, res) {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: 'Aucun fichier fourni'
        });
      }

      const { lineName, forceUpdate } = req.body;

      if (!lineName) {
        return res.status(400).json({
          success: false,
          error: 'Nom de la ligne requis'
        });
      }

      const result = await schedulesService.uploadFile(
        req.file.buffer,
        req.file.originalname,
        lineName,
        forceUpdate === 'true'
      );

      return res.json(result);
    } catch (error) {
      console.error('Erreur lors de l\'upload:', error);
      return res.status(500).json({
        success: false,
        error: 'Erreur serveur lors de l\'upload'
      });
    }
  }

  /**
   * GET /api/schedules/files - Liste tous les fichiers
   */
  async listFiles(req, res) {
    try {
      const files = await schedulesService.listFiles();
      return res.json({
        success: true,
        files
      });
    } catch (error) {
      console.error('Erreur lors du listage des fichiers:', error);
      return res.status(500).json({
        success: false,
        error: 'Erreur serveur'
      });
    }
  }

  /**
   * GET /api/schedules/history - Récupère l'historique des uploads
   */
  getHistory(req, res) {
    try {
      const history = schedulesService.getHistory();
      return res.json({
        success: true,
        history
      });
    } catch (error) {
      console.error('Erreur lors de la récupération de l\'historique:', error);
      return res.status(500).json({
        success: false,
        error: 'Erreur serveur'
      });
    }
  }

  /**
   * DELETE /api/schedules/delete/:scheduleId - Supprime un horaire
   */
  async deleteSchedule(req, res) {
    try {
      const { scheduleId } = req.params;

      const result = await schedulesService.deleteSchedule(scheduleId);
      return res.json(result);
    } catch (error) {
      console.error('Erreur lors de la suppression:', error);
      return res.status(500).json({
        success: false,
        error: 'Erreur serveur lors de la suppression'
      });
    }
  }
}

module.exports = new SchedulesController();
