const newsService = require('./news.service');

class NewsController {
  async publish(req, res) {
    try {
      // Supporter les deux formats de noms de champs (français et anglais)
      const title = req.body.title || req.body.titre;
      const content = req.body.content || req.body.contenu;
      const duration = req.body.duration || req.body.duree_valeur;
      const durationType = req.body.durationType || req.body.duree_unite;
      const slot = req.body.slot ? parseInt(req.body.slot) : null;

      if (!title || !content || !duration || !durationType) {
        return res.status(400).json({
          success: false,
          error: 'Titre, contenu, durée et type de durée requis'
        });
      }

      const result = await newsService.publishNews(title, content, parseInt(duration), durationType, slot);

      if (!result.success) {
        return res.status(400).json(result);
      }

      return res.json(result);
    } catch (error) {
      console.error('Erreur lors de la publication:', error);
      return res.status(500).json({
        success: false,
        error: 'Erreur serveur'
      });
    }
  }

  async cancel(req, res) {
    try {
      const { id } = req.params;

      if (!id) {
        return res.status(400).json({
          success: false,
          error: 'ID de la news requis'
        });
      }

      const result = await newsService.cancelNews(id);

      if (!result.success) {
        return res.status(400).json(result);
      }

      return res.json(result);
    } catch (error) {
      console.error('Erreur lors de l\'annulation:', error);
      return res.status(500).json({
        success: false,
        error: 'Erreur serveur'
      });
    }
  }

  getStatus(req, res) {
    try {
      const status = newsService.getActiveNewsStatus();
      return res.json({
        success: true,
        ...status
      });
    } catch (error) {
      console.error('Erreur lors de la récupération du statut:', error);
      return res.status(500).json({
        success: false,
        error: 'Erreur serveur'
      });
    }
  }

  getHistory(req, res) {
    try {
      const history = newsService.getHistory();
      return res.json({
        success: true,
        history
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        error: 'Erreur serveur'
      });
    }
  }

  async clearSlot(req, res) {
    try {
      const slot = parseInt(req.params.slot);

      if (slot !== 1 && slot !== 2) {
        return res.status(400).json({
          success: false,
          error: 'Slot invalide (1 ou 2)'
        });
      }

      const result = await newsService.clearNewsField(slot);

      return res.json({
        success: result.success,
        message: `Slot ${slot} vidé`,
        slot: slot
      });
    } catch (error) {
      console.error('Erreur lors du vidage du slot:', error);
      return res.status(500).json({
        success: false,
        error: 'Erreur serveur'
      });
    }
  }
}

module.exports = new NewsController();
