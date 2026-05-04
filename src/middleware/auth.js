/**
 * Middlewares d'authentification et d'autorisation
 */

/**
 * Vérifie si l'utilisateur est connecté
 * @param {Request} req - Requête Express
 * @param {Response} res - Réponse Express
 * @param {Function} next - Fonction suivante
 */
function requireAuth(req, res, next) {
  if (req.session && req.session.user) {
    return next();
  }

  // Si c'est une requête API, retourner 401
  if (req.originalUrl.startsWith('/api/') || req.path.startsWith('/api/')) {
    return res.status(401).json({
      success: false,
      error: 'Non authentifié'
    });
  }

  // Sinon, rediriger vers la page de login
  res.redirect('/login.html');
}

/**
 * Vérifie si l'utilisateur est administrateur
 * @param {Request} req - Requête Express
 * @param {Response} res - Réponse Express
 * @param {Function} next - Fonction suivante
 */
function requireAdmin(req, res, next) {
  if (req.session && req.session.user && req.session.user.role === 'admin') {
    return next();
  }

  // Si c'est une requête API, retourner 403
  if (req.originalUrl.startsWith('/api/') || req.path.startsWith('/api/')) {
    return res.status(403).json({
      success: false,
      error: 'Accès refusé - Admin uniquement'
    });
  }

  // Sinon, rediriger vers l'accueil
  res.redirect('/');
}

/**
 * Vérifie si l'utilisateur essaie de se modifier lui-même
 * Utilisé pour empêcher l'auto-suppression et l'auto-rétrogradation
 * @param {Request} req - Requête Express
 * @param {Response} res - Réponse Express
 * @param {Function} next - Fonction suivante
 */
function preventSelfModification(req, res, next) {
  const targetUserId = req.body.userId || req.params.userId;
  const currentUserId = req.session.user.id;

  if (targetUserId === currentUserId) {
    return res.status(400).json({
      success: false,
      error: 'Vous ne pouvez pas modifier votre propre compte'
    });
  }

  next();
}

module.exports = {
  requireAuth,
  requireAdmin,
  preventSelfModification
};
