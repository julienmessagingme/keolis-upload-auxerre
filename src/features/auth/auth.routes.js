const express = require('express');
const router = express.Router();
const authController = require('./auth.controller');
const middleware = require('../../middleware');

/**
 * Routes d'authentification
 * Prefixe: /api/auth
 */

// ==================== ROUTES PUBLIQUES ====================

router.post(
  '/login',
  middleware.validateLogin,
  (req, res) => authController.login(req, res)
);

router.post(
  '/logout',
  (req, res) => authController.logout(req, res)
);

// POST prefere (token dans le body), GET garde en retrocompat
router.post(
  '/verify-token',
  (req, res) => authController.verifyToken(req, res)
);
router.get(
  '/verify-token',
  (req, res) => authController.verifyToken(req, res)
);

router.post(
  '/setup-password',
  middleware.validateRegistration,
  (req, res) => authController.setupPassword(req, res)
);

// ==================== ROUTES AUTHENTIFIEES ====================

// User courant (pour activer/desactiver les boutons admin-only cote frontend)
router.get(
  '/me',
  middleware.requireAuth,
  (req, res) => authController.me(req, res)
);

// Changement de mot de passe (tout utilisateur connecte)
router.post(
  '/change-password',
  middleware.requireAuth,
  (req, res) => authController.changePassword(req, res)
);

// 2FA — Setup, verification, desactivation, statut
router.post(
  '/2fa/setup',
  middleware.requireAuth,
  (req, res) => authController.setup2FA(req, res)
);

router.post(
  '/2fa/verify',
  middleware.requireAuth,
  (req, res) => authController.verify2FA(req, res)
);

router.post(
  '/2fa/disable',
  middleware.requireAuth,
  (req, res) => authController.disable2FA(req, res)
);

router.get(
  '/2fa/status',
  middleware.requireAuth,
  (req, res) => authController.get2FAStatus(req, res)
);

// ==================== ROUTES ADMIN ====================

router.post(
  '/invite',
  middleware.requireAuth,
  middleware.requireAdmin,
  middleware.validateInvitation,
  (req, res) => authController.invite(req, res)
);

router.get(
  '/users',
  middleware.requireAuth,
  middleware.requireAdmin,
  (req, res) => authController.getUsers(req, res)
);

router.post(
  '/change-role',
  middleware.requireAuth,
  middleware.requireAdmin,
  middleware.preventSelfModification,
  (req, res) => authController.changeRole(req, res)
);

router.delete(
  '/delete-user',
  middleware.requireAuth,
  middleware.requireAdmin,
  middleware.preventSelfModification,
  (req, res) => authController.deleteUser(req, res)
);

router.post(
  '/clean-invitations',
  middleware.requireAuth,
  middleware.requireAdmin,
  (req, res) => authController.cleanInvitations(req, res)
);

// Audit des connexions (admin only)
router.get(
  '/login-audit',
  middleware.requireAuth,
  middleware.requireAdmin,
  (req, res) => authController.getLoginAudit(req, res)
);

module.exports = router;
