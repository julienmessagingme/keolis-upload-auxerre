const router = require('express').Router();
const ctrl = require('./stats.controller');
const { requireAuth, requireAdmin } = require('../../middleware');

// GET routes — session auth
router.get('/custom-events', requireAuth, ctrl.listCustomEvents);
router.get('/custom-events/:event_ns/daily', requireAuth, ctrl.dailyCustomEvent);

// POST resync manuel — admin only
router.post('/admin/sync', requireAuth, requireAdmin, ctrl.adminSync);

// POST cron fallback — bearer auth dans le controller (pas de middleware)
router.post('/cron/sync', ctrl.cronSync);

module.exports = router;
