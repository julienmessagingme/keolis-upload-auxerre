const crypto = require('crypto');
const busService = require('./bus.service');

/**
 * Endpoint appele en serveur-a-serveur par le flow WhatsApp (pas de session).
 * Auth par jeton partage : header `x-api-key` ou query `?token=`, compare en
 * temps constant. Si BUS_AGENT_TOKEN n'est pas defini, l'API est fermee.
 */
function checkToken(req) {
  const provided = req.get('x-api-key') || req.query.token || '';
  const expected = process.env.BUS_AGENT_TOKEN || '';
  if (!expected) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

class BusController {
  /** GET /api/bus/stops?ligne=1 */
  stops(req, res) {
    if (!checkToken(req)) {
      return res.status(401).json({ success: false, error: 'Non autorise' });
    }
    try {
      const result = busService.listStops({ ligne: req.query.ligne || '1' });
      return res.status(result.success ? 200 : 404).json(result);
    } catch (error) {
      console.error('Erreur bus/stops:', error);
      return res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
  }

  /** GET /api/bus/next?ligne=1&arret=Gare%20SNCF&heure=14:30&n=3 */
  next(req, res) {
    if (!checkToken(req)) {
      return res.status(401).json({ success: false, error: 'Non autorise' });
    }
    try {
      const { ligne = '1', arret, heure, n } = req.query;
      const result = busService.nextDepartures({ ligne, arret, heure, n });
      return res.status(result.success ? 200 : 400).json(result);
    } catch (error) {
      console.error('Erreur bus/next:', error);
      return res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
  }
}

module.exports = new BusController();
