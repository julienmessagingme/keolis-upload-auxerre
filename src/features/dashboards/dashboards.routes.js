const router = require('express').Router();
const ctrl = require('./dashboards.controller');
const { requireAuth } = require('../../middleware');

router.get('/', requireAuth, ctrl.listDashboards);
router.post('/', requireAuth, ctrl.createDashboard);
router.get('/:id', requireAuth, ctrl.getDashboard);
router.patch('/:id', requireAuth, ctrl.updateDashboard);
router.delete('/:id', requireAuth, ctrl.deleteDashboard);
router.get('/:id/data', requireAuth, ctrl.getDashboardData);

module.exports = router;
