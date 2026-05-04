const express = require('express');
const router = express.Router();
const schedulesController = require('./schedules.controller');
const middleware = require('../../middleware');

/**
 * Routes de gestion des fiches horaires
 * Préfixe: /api/schedules
 */

router.post(
  '/upload',
  middleware.requireAuth,
  middleware.upload.single('file'),
  middleware.handleUploadError,
  (req, res) => schedulesController.upload(req, res)
);

router.get(
  '/files',
  middleware.requireAuth,
  (req, res) => schedulesController.listFiles(req, res)
);

router.get(
  '/history',
  middleware.requireAuth,
  (req, res) => schedulesController.getHistory(req, res)
);

router.delete(
  '/delete/:scheduleId',
  middleware.requireAuth,
  (req, res) => schedulesController.deleteSchedule(req, res)
);

module.exports = router;
