const router = require('express').Router();
const ctrl = require('./dashboards.controller');
const { requireAuth } = require('../../middleware');

router.get('/', requireAuth, ctrl.listDashboards);

module.exports = router;
