const knowledgeService = require('./knowledge.service');

class KnowledgeController {
  async uploadFile(req, res) {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: 'Aucun fichier fourni'
        });
      }

      const result = await knowledgeService.uploadFile(req.file.buffer, req.file.originalname);
      return res.json(result);
    } catch (error) {
      console.error('Erreur lors de l\'upload du fichier:', error);
      return res.status(500).json({
        success: false,
        error: 'Erreur serveur lors de l\'upload'
      });
    }
  }

  async uploadText(req, res) {
    try {
      const { text, title } = req.body;

      if (!text || !title) {
        return res.status(400).json({
          success: false,
          error: 'Texte et titre requis'
        });
      }

      const result = await knowledgeService.uploadText(text, title);
      return res.json(result);
    } catch (error) {
      console.error('Erreur lors de l\'upload du texte:', error);
      return res.status(500).json({
        success: false,
        error: 'Erreur serveur lors de l\'upload'
      });
    }
  }

  getHistory(req, res) {
    try {
      const { page = 1, limit = 50, subType = null } = req.query;

      const result = knowledgeService.getHistory({
        page: Math.max(1, parseInt(page) || 1),
        limit: Math.min(Math.max(1, parseInt(limit) || 50), 200),
        subType: subType || null
      });

      return res.json({
        success: true,
        ...result
      });
    } catch (error) {
      console.error('Erreur lors de la récupération de l\'historique:', error);
      return res.status(500).json({
        success: false,
        error: 'Erreur serveur'
      });
    }
  }

  search(req, res) {
    try {
      const { q, page = 1, limit = 50, subType = null } = req.query;

      if (!q || q.trim().length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Terme de recherche requis'
        });
      }

      const result = knowledgeService.search(q, {
        page: Math.max(1, parseInt(page) || 1),
        limit: Math.min(Math.max(1, parseInt(limit) || 50), 200),
        subType: subType || null
      });

      return res.json({
        success: true,
        ...result
      });
    } catch (error) {
      console.error('Erreur lors de la recherche:', error);
      return res.status(500).json({
        success: false,
        error: 'Erreur serveur'
      });
    }
  }

  async uploadQA(req, res) {
    try {
      const { question, answer } = req.body;

      if (!question || !answer) {
        return res.status(400).json({
          success: false,
          error: 'Question et réponse requises'
        });
      }

      const result = await knowledgeService.uploadQA(question, answer);
      return res.json(result);
    } catch (error) {
      console.error('Erreur lors de l\'upload Q&A:', error);
      // Propager les erreurs metier (doublons) avec un 409 et le message explicite
      const isDuplicateError = /doublon|identique/i.test(error.message || '');
      if (isDuplicateError) {
        return res.status(409).json({
          success: false,
          error: error.message
        });
      }
      return res.status(500).json({
        success: false,
        error: 'Erreur serveur lors de l\'upload'
      });
    }
  }

  async updateQA(req, res) {
    try {
      const { itemId } = req.params;
      const { question, answer } = req.body;

      if (!question || !answer) {
        return res.status(400).json({
          success: false,
          error: 'Question et réponse requises'
        });
      }

      const result = await knowledgeService.updateQA(itemId, question, answer);
      return res.json(result);
    } catch (error) {
      console.error('Erreur lors de la mise à jour Q&A:', error);
      const isDuplicateError = /doublon|identique/i.test(error.message || '');
      if (isDuplicateError) {
        return res.status(409).json({
          success: false,
          error: error.message
        });
      }
      return res.status(500).json({
        success: false,
        error: 'Erreur serveur lors de la mise à jour'
      });
    }
  }

  async importExcel(req, res) {
    try {
      const { pairs } = req.body;

      if (!Array.isArray(pairs) || pairs.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Aucune paire Q&A fournie'
        });
      }

      if (pairs.length > 500) {
        return res.status(400).json({
          success: false,
          error: 'Maximum 500 paires Q&A par import'
        });
      }

      for (let i = 0; i < pairs.length; i++) {
        const pair = pairs[i];
        if (!pair.question || !pair.answer || pair.question.trim().length === 0 || pair.answer.trim().length === 0) {
          return res.status(400).json({
            success: false,
            error: `Paire ${i + 1} invalide: question et réponse requises`
          });
        }
      }

      // Configure SSE headers
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      });

      let cancelled = false;
      req.on('close', () => {
        cancelled = true;
      });

      const onProgress = (event) => {
        if (!cancelled) {
          res.write(`data: ${JSON.stringify(event)}\n\n`);
        }
      };

      const isCancelled = () => cancelled;

      const summary = await knowledgeService.importBulkQA(pairs, onProgress, isCancelled);

      if (!cancelled) {
        res.write(`data: ${JSON.stringify({ type: 'done', ...summary })}\n\n`);
        res.end();
      }
    } catch (error) {
      console.error('Erreur lors de l\'import Excel:', error);
      try {
        res.write(`data: ${JSON.stringify({ type: 'error', message: error.message })}\n\n`);
        res.end();
      } catch (e) {
        // Connection already closed
      }
    }
  }

  async deleteQA(req, res) {
    try {
      const { itemId } = req.params;

      const result = await knowledgeService.deleteQA(itemId);
      return res.json(result);
    } catch (error) {
      console.error('Erreur lors de la suppression Q&A:', error);
      return res.status(500).json({
        success: false,
        error: 'Erreur serveur lors de la suppression'
      });
    }
  }
}

module.exports = new KnowledgeController();
