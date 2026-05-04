/**
 * Point d'entrée de la feature Auth
 */

module.exports = {
  routes: require('./auth.routes'),
  service: require('./auth.service'),
  controller: require('./auth.controller'),
  model: require('./auth.model')
};
