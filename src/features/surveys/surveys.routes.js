const express = require('express');
const router = express.Router();
const surveysController = require('./surveys.controller');
const middleware = require('../../middleware');

// Webhook — PAS d'auth session (token en query string)
router.post(
  '/webhook',
  (req, res) => surveysController.webhook(req, res)
);

// Routes protégées par session
router.get(
  '/stats',
  middleware.requireAuth,
  (req, res) => surveysController.getStats(req, res)
);

router.get(
  '/history',
  middleware.requireAuth,
  (req, res) => surveysController.getHistory(req, res)
);

router.get(
  '/export',
  middleware.requireAuth,
  (req, res) => surveysController.exportCSV(req, res)
);

module.exports = router;
