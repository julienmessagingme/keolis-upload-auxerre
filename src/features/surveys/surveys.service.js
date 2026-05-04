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

    // Validation phone (5-20 chars)
    const cleanPhone = String(phone).trim();
    if (cleanPhone.length > 20 || cleanPhone.length < 5) {
      return { success: false, error: 'phone invalide (5-20 caracteres)' };
    }

    const ratingInt = parseInt(rating);
    if (isNaN(ratingInt) || ratingInt < 1 || ratingInt > 5) {
      return { success: false, error: 'rating doit etre un entier entre 1 et 5' };
    }

    // Validation date ISO 8601
    const receivedDate = new Date(date);
    if (isNaN(receivedDate.getTime())) {
      return { success: false, error: 'date invalide (format ISO 8601 attendu)' };
    }

    // Tronquer message si trop long (2000 chars max)
    const cleanMessage = message ? String(message).substring(0, 2000) : null;

    const id = databaseService.addSurvey({
      phone: cleanPhone,
      rating: ratingInt,
      message: cleanMessage,
      receivedAt: receivedDate.toISOString()
    });

    console.log(`✓ Enquete enregistree: ${ratingInt}★ de ****${cleanPhone.slice(-4)}`);
    return { success: true, id };
  }

  /**
   * Récupère les stats agrégées
   */
  getStats(options = {}) {
    const { ratings, ...rest } = options;
    const parsedRatings = ratings ? ratings.split(',').map(Number).filter(n => n >= 1 && n <= 5) : null;
    const stats = databaseService.getSurveyStats({ ...rest, ratings: parsedRatings });

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
