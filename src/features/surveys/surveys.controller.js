const surveysService = require('./surveys.service');

class SurveysController {
  /**
   * POST /api/surveys/webhook?token=xxx
   */
  webhook(req, res) {
    try {
      const token = req.query.token;
      const expectedToken = process.env.SURVEY_WEBHOOK_TOKEN;

      if (!expectedToken || token !== expectedToken) {
        return res.status(401).json({ success: false, error: 'Token invalide' });
      }

      const result = surveysService.addSurvey(req.body);

      if (!result.success) {
        return res.status(400).json(result);
      }

      return res.json(result);
    } catch (error) {
      console.error('Erreur webhook survey:', error);
      return res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
  }

  /**
   * GET /api/surveys/stats?startDate=xxx&endDate=xxx
   */
  getStats(req, res) {
    try {
      const { startDate, endDate } = req.query;
      const stats = surveysService.getStats({ startDate, endDate });
      return res.json({ success: true, ...stats });
    } catch (error) {
      console.error('Erreur stats surveys:', error);
      return res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
  }

  /**
   * GET /api/surveys/history?page=1&limit=50&startDate=xxx&endDate=xxx&ratings=1,2
   */
  getHistory(req, res) {
    try {
      const { page = 1, limit = 50, startDate, endDate, ratings } = req.query;
      const result = surveysService.getHistory({
        page: parseInt(page),
        limit: parseInt(limit),
        startDate, endDate, ratings
      });
      return res.json({ success: true, ...result });
    } catch (error) {
      console.error('Erreur history surveys:', error);
      return res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
  }

  /**
   * GET /api/surveys/export?startDate=xxx&endDate=xxx&ratings=1,2
   */
  exportCSV(req, res) {
    try {
      const { startDate, endDate, ratings } = req.query;
      const csv = surveysService.exportCSV({ startDate, endDate, ratings });

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename=enquetes-qualite.csv');
      return res.send('\uFEFF' + csv);
    } catch (error) {
      console.error('Erreur export surveys:', error);
      return res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
  }
}

module.exports = new SurveysController();
