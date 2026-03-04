const databaseService = require('../../services/database.service');

class SurveysService {
  /**
   * Enregistre une nouvelle réponse de satisfaction
   */
  addSurvey(data) {
    const { phone, rating, message, date } = data;

    if (!phone || rating === undefined || rating === null || !date) {
      return { success: false, error: 'phone, rating et date sont requis' };
    }

    const ratingInt = parseInt(rating);
    if (isNaN(ratingInt) || ratingInt < 1 || ratingInt > 5) {
      return { success: false, error: 'rating doit être un entier entre 1 et 5' };
    }

    const id = databaseService.addSurvey({
      phone,
      rating: ratingInt,
      message: message || null,
      receivedAt: date
    });

    console.log(`✓ Enquête enregistrée: ${ratingInt}★ de ****${phone.slice(-4)}`);
    return { success: true, id };
  }

  /**
   * Récupère les stats agrégées
   */
  getStats(options = {}) {
    const stats = databaseService.getSurveyStats(options);

    const satisfied = stats.distribution
      .filter(d => d.rating >= 4)
      .reduce((sum, d) => sum + d.count, 0);

    const dissatisfied = stats.distribution
      .filter(d => d.rating <= 2)
      .reduce((sum, d) => sum + d.count, 0);

    return {
      ...stats,
      satisfiedPercent: stats.total > 0 ? Math.round((satisfied / stats.total) * 100) : 0,
      dissatisfiedPercent: stats.total > 0 ? Math.round((dissatisfied / stats.total) * 100) : 0
    };
  }

  /**
   * Récupère l'historique paginé avec filtres
   */
  getHistory(options = {}) {
    const { page = 1, limit = 50, startDate, endDate, ratings } = options;
    const offset = (page - 1) * limit;

    const parsedRatings = ratings ? ratings.split(',').map(Number).filter(n => n >= 1 && n <= 5) : null;

    const items = databaseService.getSurveys({
      limit, offset,
      startDate: startDate || null,
      endDate: endDate || null,
      ratings: parsedRatings
    });

    const total = databaseService.countSurveys({
      startDate: startDate || null,
      endDate: endDate || null,
      ratings: parsedRatings
    });

    return {
      items,
      total,
      page,
      totalPages: Math.ceil(total / limit)
    };
  }

  /**
   * Génère le CSV pour export
   */
  exportCSV(options = {}) {
    const { startDate, endDate, ratings } = options;
    const parsedRatings = ratings ? ratings.split(',').map(Number).filter(n => n >= 1 && n <= 5) : null;

    const items = databaseService.getAllSurveysForExport({
      startDate: startDate || null,
      endDate: endDate || null,
      ratings: parsedRatings
    });

    const header = 'Date;Telephone;Note;Message';
    const rows = items.map(item => {
      const date = new Date(item.receivedAt).toLocaleString('fr-FR');
      const message = (item.message || '').replace(/;/g, ',').replace(/\n/g, ' ');
      return `${date};${item.phone};${item.rating};${message}`;
    });

    return [header, ...rows].join('\n');
  }
}

module.exports = new SurveysService();
