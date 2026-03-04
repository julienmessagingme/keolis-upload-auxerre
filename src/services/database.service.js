const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

/**
 * Service de gestion de la base de données SQLite
 * Stocke toutes les Q&A et historiques
 */
class DatabaseService {
  constructor() {
    const dataDir = path.join(__dirname, '..', '..', 'data');

    // Créer le dossier data si nécessaire
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    const dbPath = path.join(dataDir, 'knowledge.db');
    this.db = new Database(dbPath);

    // Activer les clés étrangères
    this.db.pragma('foreign_keys = ON');

    this.initialize();
    console.log('✓ Base de données SQLite initialisée:', dbPath);
  }

  /**
   * Initialise les tables de la base de données
   */
  initialize() {
    // Table pour la base de connaissances (Q&A, fichiers, textes)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS knowledge_items (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        subType TEXT NOT NULL,
        question TEXT,
        answer TEXT,
        title TEXT,
        fileName TEXT NOT NULL,
        uploadedAt TEXT NOT NULL,
        vectorStoreFileId TEXT NOT NULL,
        fileId TEXT NOT NULL,
        status TEXT NOT NULL,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Index pour améliorer les performances
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_knowledge_subType ON knowledge_items(subType);
      CREATE INDEX IF NOT EXISTS idx_knowledge_uploadedAt ON knowledge_items(uploadedAt DESC);
      CREATE INDEX IF NOT EXISTS idx_knowledge_createdAt ON knowledge_items(createdAt DESC);
    `);

    // Table pour les horaires (schedules)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS schedules (
        id TEXT PRIMARY KEY,
        fileName TEXT NOT NULL,
        lineName TEXT,
        fileUrl TEXT NOT NULL,
        uploadedAt TEXT NOT NULL,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Migration: ajouter lineName si elle n'existe pas
    try {
      this.db.exec(`ALTER TABLE schedules ADD COLUMN lineName TEXT`);
      console.log('✓ Colonne lineName ajoutée à la table schedules');
    } catch (error) {
      // La colonne existe déjà, pas grave
    }

    // Table pour les actualités (news)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS news (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        uploadedAt TEXT NOT NULL,
        expiresAt TEXT,
        status TEXT DEFAULT 'active',
        webhookSent BOOLEAN DEFAULT 0,
        slot INTEGER DEFAULT 1,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Migration: ajouter expiresAt et status si elles n'existent pas
    try {
      this.db.exec(`ALTER TABLE news ADD COLUMN expiresAt TEXT`);
      console.log('✓ Colonne expiresAt ajoutée à la table news');
    } catch (error) {
      // La colonne existe déjà
    }

    try {
      this.db.exec(`ALTER TABLE news ADD COLUMN status TEXT DEFAULT 'active'`);
      console.log('✓ Colonne status ajoutée à la table news');
    } catch (error) {
      // La colonne existe déjà
    }

    try {
      this.db.exec(`ALTER TABLE news ADD COLUMN slot INTEGER DEFAULT 1`);
      console.log('✓ Colonne slot ajoutée à la table news');
    } catch (error) {
      // La colonne existe déjà
    }

    // Table pour les enquêtes de satisfaction (surveys)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS surveys (
        id TEXT PRIMARY KEY,
        phone TEXT NOT NULL,
        rating INTEGER NOT NULL,
        message TEXT,
        receivedAt TEXT NOT NULL,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_surveys_receivedAt ON surveys(receivedAt DESC);
      CREATE INDEX IF NOT EXISTS idx_surveys_rating ON surveys(rating);
    `);
  }

  /**
   * Génère un ID unique
   */
  generateId() {
    return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // ==================== KNOWLEDGE ITEMS ====================

  /**
   * Ajoute un item à la base de connaissances
   */
  addKnowledgeItem(item) {
    const id = item.id || this.generateId();

    const stmt = this.db.prepare(`
      INSERT INTO knowledge_items (
        id, type, subType, question, answer, title,
        fileName, uploadedAt, vectorStoreFileId, fileId, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      item.type || item.subType,
      item.subType,
      item.question || null,
      item.answer || null,
      item.title || null,
      item.fileName,
      item.uploadedAt,
      item.vectorStoreFileId,
      item.fileId,
      item.status
    );

    return id;
  }

  /**
   * Récupère tous les items de la base de connaissances avec pagination
   */
  getKnowledgeItems(options = {}) {
    const {
      limit = 50,
      offset = 0,
      subType = null
    } = options;

    let query = 'SELECT * FROM knowledge_items';
    let params = [];

    if (subType) {
      query += ' WHERE subType = ?';
      params.push(subType);
    }

    query += ' ORDER BY uploadedAt DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const stmt = this.db.prepare(query);
    return stmt.all(...params);
  }

  /**
   * Compte le nombre total d'items
   */
  countKnowledgeItems(subType = null) {
    let query = 'SELECT COUNT(*) as count FROM knowledge_items';
    let params = [];

    if (subType) {
      query += ' WHERE subType = ?';
      params.push(subType);
    }

    const stmt = this.db.prepare(query);
    const result = stmt.get(...params);
    return result.count;
  }

  /**
   * Récupère un item par son ID
   */
  getKnowledgeItemById(id) {
    const stmt = this.db.prepare('SELECT * FROM knowledge_items WHERE id = ?');
    return stmt.get(id);
  }

  /**
   * Met à jour un item
   */
  updateKnowledgeItem(id, updates) {
    const fields = [];
    const values = [];

    for (const [key, value] of Object.entries(updates)) {
      fields.push(`${key} = ?`);
      values.push(value);
    }

    values.push(id);

    const stmt = this.db.prepare(`
      UPDATE knowledge_items SET ${fields.join(', ')} WHERE id = ?
    `);

    return stmt.run(...values);
  }

  /**
   * Vérifie si une Q&A avec la même question ou réponse existe déjà
   * @param {string} question
   * @param {string} answer
   * @param {string|null} excludeId - ID à exclure (pour les mises à jour)
   * @returns {Object|null} { field: 'question'|'answer', existingQuestion: string }
   */
  findDuplicateQA(question, answer, excludeId = null) {
    let query = `SELECT id, question, answer FROM knowledge_items WHERE subType = 'qa'`;
    const params = [];

    if (excludeId) {
      query += ' AND id != ?';
      params.push(excludeId);
    }

    const stmt = this.db.prepare(query);
    const items = stmt.all(...params);

    const trimmedQ = question.trim();
    const trimmedA = answer.trim();

    for (const item of items) {
      if (item.question && item.question.trim() === trimmedQ) {
        return { field: 'question', existingQuestion: item.question };
      }
      if (item.answer && item.answer.trim() === trimmedA) {
        return { field: 'answer', existingQuestion: item.question };
      }
    }

    return null;
  }

  /**
   * Supprime un item
   */
  deleteKnowledgeItem(id) {
    const stmt = this.db.prepare('DELETE FROM knowledge_items WHERE id = ?');
    return stmt.run(id);
  }

  /**
   * Compte le nombre total de résultats de recherche
   */
  countSearchKnowledgeItems(searchTerm, subType = null) {
    let query = `
      SELECT COUNT(*) as count FROM knowledge_items
      WHERE (question LIKE ? OR answer LIKE ? OR title LIKE ? OR fileName LIKE ?)
    `;
    let params = [
      `%${searchTerm}%`,
      `%${searchTerm}%`,
      `%${searchTerm}%`,
      `%${searchTerm}%`
    ];

    if (subType) {
      query += ' AND subType = ?';
      params.push(subType);
    }

    const stmt = this.db.prepare(query);
    const result = stmt.get(...params);
    return result.count;
  }

  /**
   * Recherche dans les Q&A
   */
  searchKnowledgeItems(searchTerm, options = {}) {
    const {
      limit = 50,
      offset = 0,
      subType = null
    } = options;

    let query = `
      SELECT * FROM knowledge_items
      WHERE (question LIKE ? OR answer LIKE ? OR title LIKE ? OR fileName LIKE ?)
    `;
    let params = [
      `%${searchTerm}%`,
      `%${searchTerm}%`,
      `%${searchTerm}%`,
      `%${searchTerm}%`
    ];

    if (subType) {
      query += ' AND subType = ?';
      params.push(subType);
    }

    query += ' ORDER BY uploadedAt DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const stmt = this.db.prepare(query);
    return stmt.all(...params);
  }

  // ==================== SCHEDULES ====================

  addSchedule(schedule) {
    const id = schedule.id || this.generateId();

    const stmt = this.db.prepare(`
      INSERT INTO schedules (id, fileName, lineName, fileUrl, uploadedAt)
      VALUES (?, ?, ?, ?, ?)
    `);

    stmt.run(id, schedule.fileName, schedule.lineName, schedule.fileUrl, schedule.uploadedAt);
    return id;
  }

  /**
   * Supprime un horaire par son ID
   */
  deleteSchedule(id) {
    const stmt = this.db.prepare('DELETE FROM schedules WHERE id = ?');
    return stmt.run(id);
  }

  /**
   * Récupère un horaire par son nom de fichier
   */
  getScheduleByFileName(fileName) {
    const stmt = this.db.prepare('SELECT * FROM schedules WHERE fileName = ? ORDER BY uploadedAt DESC LIMIT 1');
    return stmt.get(fileName);
  }

  getSchedules() {
    const stmt = this.db.prepare('SELECT * FROM schedules ORDER BY uploadedAt DESC');
    return stmt.all();
  }

  // ==================== NEWS ====================

  addNews(news) {
    const id = news.id || this.generateId();

    const stmt = this.db.prepare(`
      INSERT INTO news (id, title, content, uploadedAt, expiresAt, status, webhookSent, slot)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      news.title,
      news.content,
      news.uploadedAt,
      news.expiresAt || null,
      news.status || 'active',
      news.webhookSent ? 1 : 0,
      news.slot || 1
    );
    return id;
  }

  getNews(limit = 10) {
    const stmt = this.db.prepare('SELECT * FROM news ORDER BY uploadedAt DESC LIMIT ?');
    return stmt.all(limit);
  }

  /**
   * Récupère les news actives qui ont expiré
   * @returns {Array} Liste des news expirées mais encore actives
   */
  getExpiredActiveNews() {
    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      SELECT * FROM news
      WHERE status = 'active'
      AND expiresAt IS NOT NULL
      AND expiresAt < ?
    `);
    return stmt.all(now);
  }

  /**
   * Marque une news comme expirée
   * @param {string} id - ID de la news
   */
  markNewsAsExpired(id) {
    const stmt = this.db.prepare(`UPDATE news SET status = 'expired' WHERE id = ?`);
    return stmt.run(id);
  }

  /**
   * Récupère la news active actuelle (la plus récente)
   * @returns {Object|null} News active ou null
   */
  getActiveNews() {
    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      SELECT * FROM news
      WHERE status = 'active'
      AND (expiresAt IS NULL OR expiresAt > ?)
      ORDER BY uploadedAt DESC
      LIMIT 1
    `);
    return stmt.get(now);
  }

  /**
   * Récupère la news active pour un slot spécifique
   * @param {number} slot - Numéro du slot (1 ou 2)
   * @returns {Object|null} News active ou null
   */
  getActiveNewsBySlot(slot) {
    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      SELECT * FROM news
      WHERE status = 'active'
      AND slot = ?
      AND (expiresAt IS NULL OR expiresAt > ?)
      ORDER BY uploadedAt DESC
      LIMIT 1
    `);
    return stmt.get(slot, now);
  }

  /**
   * Récupère toutes les news actives (slots 1 et 2)
   * @returns {Array} Liste des news actives
   */
  getAllActiveNews() {
    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      SELECT * FROM news
      WHERE status = 'active'
      AND (expiresAt IS NULL OR expiresAt > ?)
      ORDER BY slot ASC
    `);
    return stmt.all(now);
  }

  /**
   * Annule une news (la marque comme cancelled)
   * @param {string} id - ID de la news
   */
  cancelNews(id) {
    const stmt = this.db.prepare(`UPDATE news SET status = 'cancelled' WHERE id = ?`);
    return stmt.run(id);
  }

  /**
   * Récupère une news par son ID
   * @param {string} id - ID de la news
   * @returns {Object|null} News ou null
   */
  getNewsById(id) {
    const stmt = this.db.prepare('SELECT * FROM news WHERE id = ?');
    return stmt.get(id);
  }

  /**
   * Récupère les news expirées pour un slot spécifique
   * @param {number} slot - Numéro du slot
   * @returns {Array} Liste des news expirées
   */
  getExpiredActiveNewsBySlot(slot) {
    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      SELECT * FROM news
      WHERE status = 'active'
      AND slot = ?
      AND expiresAt IS NOT NULL
      AND expiresAt < ?
    `);
    return stmt.all(slot, now);
  }

  // ==================== SURVEYS ====================

  /**
   * Ajoute une enquête de satisfaction
   */
  addSurvey(survey) {
    const id = this.generateId();

    const stmt = this.db.prepare(`
      INSERT INTO surveys (id, phone, rating, message, receivedAt)
      VALUES (?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      survey.phone,
      survey.rating,
      survey.message || null,
      survey.receivedAt
    );

    return id;
  }

  /**
   * Récupère les enquêtes avec pagination et filtres
   */
  getSurveys(options = {}) {
    const {
      limit = 50,
      offset = 0,
      startDate = null,
      endDate = null,
      ratings = null
    } = options;

    let query = 'SELECT * FROM surveys WHERE 1=1';
    let params = [];

    if (startDate) {
      query += ' AND receivedAt >= ?';
      params.push(startDate);
    }

    if (endDate) {
      query += ' AND receivedAt <= ?';
      params.push(endDate);
    }

    if (ratings && Array.isArray(ratings) && ratings.length > 0) {
      const placeholders = ratings.map(() => '?').join(',');
      query += ` AND rating IN (${placeholders})`;
      params.push(...ratings);
    }

    query += ' ORDER BY receivedAt DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const stmt = this.db.prepare(query);
    return stmt.all(...params);
  }

  /**
   * Compte le nombre total d'enquêtes avec filtres
   */
  countSurveys(options = {}) {
    const {
      startDate = null,
      endDate = null,
      ratings = null
    } = options;

    let query = 'SELECT COUNT(*) as count FROM surveys WHERE 1=1';
    let params = [];

    if (startDate) {
      query += ' AND receivedAt >= ?';
      params.push(startDate);
    }

    if (endDate) {
      query += ' AND receivedAt <= ?';
      params.push(endDate);
    }

    if (ratings && Array.isArray(ratings) && ratings.length > 0) {
      const placeholders = ratings.map(() => '?').join(',');
      query += ` AND rating IN (${placeholders})`;
      params.push(...ratings);
    }

    const stmt = this.db.prepare(query);
    const result = stmt.get(...params);
    return result.count;
  }

  /**
   * Récupère les statistiques des enquêtes
   */
  getSurveyStats(options = {}) {
    const { startDate = null, endDate = null } = options;

    let whereClause = 'WHERE 1=1';
    let params = [];

    if (startDate) {
      whereClause += ' AND receivedAt >= ?';
      params.push(startDate);
    }

    if (endDate) {
      whereClause += ' AND receivedAt <= ?';
      params.push(endDate);
    }

    // Total et moyenne
    const summaryStmt = this.db.prepare(`
      SELECT COUNT(*) as total, ROUND(AVG(rating), 1) as average
      FROM surveys ${whereClause}
    `);
    const summary = summaryStmt.get(...params);

    // Distribution par note
    const distributionStmt = this.db.prepare(`
      SELECT rating, COUNT(*) as count
      FROM surveys ${whereClause}
      GROUP BY rating
      ORDER BY rating
    `);
    const distribution = distributionStmt.all(...params);

    // Évolution par jour
    const evolutionStmt = this.db.prepare(`
      SELECT DATE(receivedAt) as date, ROUND(AVG(rating), 1) as average, COUNT(*) as count
      FROM surveys ${whereClause}
      GROUP BY DATE(receivedAt)
      ORDER BY date
    `);
    const evolution = evolutionStmt.all(...params);

    return {
      total: summary.total,
      average: summary.average,
      distribution,
      evolution
    };
  }

  /**
   * Récupère toutes les enquêtes pour export (sans pagination)
   */
  getAllSurveysForExport(options = {}) {
    const {
      startDate = null,
      endDate = null,
      ratings = null
    } = options;

    let query = 'SELECT * FROM surveys WHERE 1=1';
    let params = [];

    if (startDate) {
      query += ' AND receivedAt >= ?';
      params.push(startDate);
    }

    if (endDate) {
      query += ' AND receivedAt <= ?';
      params.push(endDate);
    }

    if (ratings && Array.isArray(ratings) && ratings.length > 0) {
      const placeholders = ratings.map(() => '?').join(',');
      query += ` AND rating IN (${placeholders})`;
      params.push(...ratings);
    }

    query += ' ORDER BY receivedAt DESC';

    const stmt = this.db.prepare(query);
    return stmt.all(...params);
  }

  // ==================== MIGRATION ====================

  /**
   * Migre les données depuis history.json vers SQLite
   */
  migrateFromHistoryJson() {
    const historyPath = path.join(__dirname, '..', '..', 'data', 'history.json');

    if (!fs.existsSync(historyPath)) {
      console.log('Aucun fichier history.json à migrer');
      return { migrated: 0 };
    }

    try {
      const historyData = JSON.parse(fs.readFileSync(historyPath, 'utf8'));
      let migrated = 0;

      // Migrer knowledge
      if (historyData.knowledge && Array.isArray(historyData.knowledge)) {
        for (const item of historyData.knowledge) {
          try {
            // Vérifier si l'item existe déjà
            const existing = this.getKnowledgeItemById(item.id);
            if (!existing) {
              this.addKnowledgeItem(item);
              migrated++;
            }
          } catch (error) {
            console.error('Erreur migration item:', error.message);
          }
        }
      }

      // Migrer schedules
      if (historyData.schedules && Array.isArray(historyData.schedules)) {
        for (const schedule of historyData.schedules) {
          try {
            this.addSchedule(schedule);
            migrated++;
          } catch (error) {
            console.error('Erreur migration schedule:', error.message);
          }
        }
      }

      // Migrer news
      if (historyData.news && Array.isArray(historyData.news)) {
        for (const newsItem of historyData.news) {
          try {
            this.addNews(newsItem);
            migrated++;
          } catch (error) {
            console.error('Erreur migration news:', error.message);
          }
        }
      }

      console.log(`✓ Migration terminée: ${migrated} items migrés`);

      // Renommer le fichier JSON en backup
      const backupPath = historyPath.replace('.json', '.backup.json');
      fs.renameSync(historyPath, backupPath);
      console.log(`✓ Ancien fichier sauvegardé: ${backupPath}`);

      return { migrated };
    } catch (error) {
      console.error('Erreur lors de la migration:', error);
      throw error;
    }
  }

  /**
   * Ferme la connexion à la base de données
   */
  close() {
    this.db.close();
  }
}

// Export d'une instance unique (singleton)
module.exports = new DatabaseService();
