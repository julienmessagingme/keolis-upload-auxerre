const express = require('express');
const router = express.Router();
const busController = require('./bus.controller');

// Endpoints publics (token applicatif, pas de session) appeles par le flow WhatsApp
router.get('/stops', (req, res) => busController.stops(req, res));
router.get('/next', (req, res) => busController.next(req, res));

module.exports = router;
