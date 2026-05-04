/**
 * Point d'entrée centralisé pour tous les middlewares
 */

const auth = require('./auth');
const validation = require('./validation');
const { errorHandler, notFoundHandler } = require('./errorHandler');
const { upload, handleUploadError } = require('./upload');

module.exports = {
  // Middlewares d'authentification
  requireAuth: auth.requireAuth,
  requireAdmin: auth.requireAdmin,
  preventSelfModification: auth.preventSelfModification,

  // Middlewares de validation
  validateLogin: validation.validateLogin,
  validateRegistration: validation.validateRegistration,
  validateInvitation: validation.validateInvitation,
  isValidEmail: validation.isValidEmail,
  validatePassword: validation.validatePassword,

  // Middlewares de gestion d'erreurs
  errorHandler,
  notFoundHandler,

  // Middlewares d'upload
  upload,
  handleUploadError
};
