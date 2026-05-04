const express = require('express');
const router = express.Router();
const newsController = require('./news.controller');
const middleware = require('../../middleware');

router.post(
  '/publish',
  middleware.requireAuth,
  (req, res) => newsController.publish(req, res)
);

router.post(
  '/cancel/:id',
  middleware.requireAuth,
  (req, res) => newsController.cancel(req, res)
);

router.get(
  '/status',
  middleware.requireAuth,
  (req, res) => newsController.getStatus(req, res)
);

router.get(
  '/history',
  middleware.requireAuth,
  (req, res) => newsController.getHistory(req, res)
);

router.post(
  '/clear-slot/:slot',
  middleware.requireAuth,
  (req, res) => newsController.clearSlot(req, res)
);

module.exports = router;
