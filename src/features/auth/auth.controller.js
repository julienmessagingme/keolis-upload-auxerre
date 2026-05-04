const authService = require('./auth.service');
const emailService = require('../../services/email.service');
const databaseService = require('../../services/database.service');
const { validatePassword } = require('../../middleware/validation');

/**
 * Controller d'authentification
 * Gere les requetes HTTP liees a l'authentification
 */
class AuthController {
  constructor() {
    // Lockout par IP (brute force classique)
    this.IP_MAX_ATTEMPTS = 5;
    this.IP_LOCKOUT_DURATION = 15; // minutes

    // Lockout par compte / email (anti-VPN / proxies rotatifs)
    this.ACCOUNT_MAX_ATTEMPTS = 8;
    this.ACCOUNT_LOCKOUT_DURATION = 30; // minutes

    // Seuil d'alerte admin (IPs distinctes sur un meme compte)
    this.ALERT_DISTINCT_IPS = 3;
  }

  _getClientIP(req) {
    return req.ip || req.connection.remoteAddress;
  }

  /**
   * Verifie si une IP est bloquee (lockout persistant en SQLite)
   */
  _isIPLocked(ip) {
    const result = databaseService.getRecentFailedAttempts(ip, this.IP_LOCKOUT_DURATION);
    return { locked: result.count >= this.IP_MAX_ATTEMPTS, ...result };
  }

  /**
   * Verifie si un COMPTE est bloque (anti-VPN : lockout par email, toutes IPs confondues)
   */
  _isAccountLocked(email) {
    const result = databaseService.getRecentFailedAttemptsByEmail(email, this.ACCOUNT_LOCKOUT_DURATION);
    return { locked: result.count >= this.ACCOUNT_MAX_ATTEMPTS, ...result };
  }

  /**
   * Enregistre une tentative de login (succes ou echec)
   * Si lockout par compte declenche depuis plusieurs IPs → alerte admin par email
   */
  async _recordAttempt(email, ip, userAgent, success, failReason = null) {
    databaseService.addLoginAudit({ email, ip, userAgent, success, failReason });

    if (!success) {
      const ipResult = databaseService.getRecentFailedAttempts(ip, this.IP_LOCKOUT_DURATION);
      const accountResult = databaseService.getRecentFailedAttemptsByEmail(email, this.ACCOUNT_LOCKOUT_DURATION);

      console.log(`⚠️ Tentative login echouee pour ${email} depuis ${ip} — IP: ${ipResult.count}/${this.IP_MAX_ATTEMPTS}, Compte: ${accountResult.count}/${this.ACCOUNT_MAX_ATTEMPTS} (${accountResult.distinctIPs} IPs distinctes)`);

      // Alerte admin si le compte vient d'etre verrouille OU attaque multi-IP detectee
      const justAccountLocked = accountResult.count === this.ACCOUNT_MAX_ATTEMPTS;
      const multiIPAttack = accountResult.distinctIPs >= this.ALERT_DISTINCT_IPS && accountResult.count >= 5;

      if (justAccountLocked || multiIPAttack) {
        this._sendSecurityAlert(email, accountResult, ip).catch(err => {
          console.error('Erreur envoi alerte securite:', err.message);
        });
      }
    }
  }

  /**
   * Envoie une alerte securite a l'admin par email
   */
  async _sendSecurityAlert(targetEmail, accountResult, lastIP) {
    const adminEmail = process.env.ADMIN_EMAIL;
    if (!adminEmail) return;

    const now = new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' });
    const reason = accountResult.distinctIPs >= this.ALERT_DISTINCT_IPS
      ? `🔴 ATTAQUE MULTI-IP DETECTEE (${accountResult.distinctIPs} IPs distinctes)`
      : `🟠 COMPTE VERROUILLE (${accountResult.count} tentatives echouees)`;

    console.log(`🚨 ALERTE SECURITE: ${reason} sur ${targetEmail}`);

    try {
      await emailService.send({
        to: adminEmail,
        subject: `🚨 Alerte Securite Keolis Auxerre — ${targetEmail}`,
        html: `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family: -apple-system, sans-serif; background: #f4f4f4; padding: 20px;">
  <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
    <div style="background: #DC2626; color: white; padding: 25px 30px; text-align: center;">
      <h1 style="margin: 0; font-size: 22px;">🚨 Alerte Securite</h1>
      <p style="margin: 8px 0 0 0; opacity: 0.9;">Plateforme Keolis Auxerre</p>
    </div>
    <div style="padding: 30px;">
      <p style="font-size: 16px; font-weight: bold; color: #DC2626;">${reason}</p>
      <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
        <tr><td style="padding: 8px 0; color: #666; border-bottom: 1px solid #eee;"><strong>Compte cible</strong></td><td style="padding: 8px 0; border-bottom: 1px solid #eee;">${targetEmail}</td></tr>
        <tr><td style="padding: 8px 0; color: #666; border-bottom: 1px solid #eee;"><strong>Tentatives echouees</strong></td><td style="padding: 8px 0; border-bottom: 1px solid #eee;">${accountResult.count} en ${this.ACCOUNT_LOCKOUT_DURATION} min</td></tr>
        <tr><td style="padding: 8px 0; color: #666; border-bottom: 1px solid #eee;"><strong>IPs distinctes</strong></td><td style="padding: 8px 0; border-bottom: 1px solid #eee;">${accountResult.distinctIPs}</td></tr>
        <tr><td style="padding: 8px 0; color: #666; border-bottom: 1px solid #eee;"><strong>Derniere IP</strong></td><td style="padding: 8px 0; border-bottom: 1px solid #eee;">${lastIP}</td></tr>
        <tr><td style="padding: 8px 0; color: #666;"><strong>Date</strong></td><td style="padding: 8px 0;">${now}</td></tr>
      </table>
      <div style="background: #FEF2F2; border-left: 4px solid #DC2626; padding: 15px; border-radius: 4px; margin-top: 20px;">
        <strong>Actions recommandees :</strong>
        <ul style="margin: 10px 0; padding-left: 20px;">
          <li>Verifiez les logs de connexion dans le panneau admin</li>
          <li>Si l'attaque persiste, envisagez de changer le mot de passe du compte</li>
          <li>Activez le 2FA sur tous les comptes si ce n'est pas deja fait</li>
        </ul>
      </div>
    </div>
    <div style="background: #f8f9fa; padding: 15px 30px; text-align: center; font-size: 12px; color: #999;">
      Email automatique — Keolis Auxerre
    </div>
  </div>
</body>
</html>`,
        text: `ALERTE SECURITE — ${reason}\nCompte: ${targetEmail}\nTentatives: ${accountResult.count}\nIPs distinctes: ${accountResult.distinctIPs}\nDerniere IP: ${lastIP}\nDate: ${now}`
      });
    } catch (error) {
      console.error('Erreur envoi alerte securite:', error.message);
    }
  }

  /**
   * POST /api/auth/login - Connexion utilisateur (avec support 2FA)
   * Double lockout : par IP (5/15min) ET par compte (8/30min, anti-VPN)
   */
  async login(req, res) {
    try {
      const { email, password, totpCode } = req.body;
      const clientIP = this._getClientIP(req);
      const userAgent = req.get('User-Agent') || null;

      // ===== LOCKOUT 1 : Verifier si l'IP est bloquee =====
      const ipCheck = this._isIPLocked(clientIP);
      if (ipCheck.locked) {
        const lastAttempt = new Date(ipCheck.lastAttempt + 'Z');
        const unlockTime = new Date(lastAttempt.getTime() + this.IP_LOCKOUT_DURATION * 60 * 1000);
        const remainingMin = Math.ceil((unlockTime - Date.now()) / 60000);
        console.log(`🔒 Login bloque pour IP ${clientIP} — encore ${remainingMin} min`);
        return res.status(429).json({
          success: false,
          error: `Trop de tentatives depuis cette adresse. Réessayez dans ${Math.max(1, remainingMin)} minute(s).`
        });
      }

      // ===== LOCKOUT 2 : Verifier si le COMPTE est bloque (anti-VPN) =====
      if (email) {
        const accountCheck = this._isAccountLocked(email);
        if (accountCheck.locked) {
          const lastAttempt = new Date(accountCheck.lastAttempt + 'Z');
          const unlockTime = new Date(lastAttempt.getTime() + this.ACCOUNT_LOCKOUT_DURATION * 60 * 1000);
          const remainingMin = Math.ceil((unlockTime - Date.now()) / 60000);
          console.log(`🔒 Login bloque pour COMPTE ${email} — ${accountCheck.count} tentatives depuis ${accountCheck.distinctIPs} IPs — encore ${remainingMin} min`);
          // Message volontairement vague pour ne pas reveler qu'on detecte le multi-IP
          return res.status(429).json({
            success: false,
            error: `Ce compte est temporairement verrouillé. Réessayez dans ${Math.max(1, remainingMin)} minute(s).`
          });
        }
      }

      // Etape 1: Verifier email + mot de passe
      const user = await authService.verifyUser(email, password);

      if (!user) {
        await this._recordAttempt(email || 'unknown', clientIP, userAgent, false, 'bad_credentials');
        return res.status(401).json({
          success: false,
          error: 'Email ou mot de passe incorrect'
        });
      }

      // Etape 2: Verifier si 2FA est active
      if (authService.has2FAEnabled(email)) {
        // Si pas de code TOTP fourni, demander au client
        if (!totpCode) {
          return res.json({
            success: true,
            requires2FA: true,
            message: 'Code d\'authentification requis'
          });
        }

        // Verifier le code TOTP (ou code de secours)
        const is2FAValid = authService.verify2FACode(email, totpCode);
        if (!is2FAValid) {
          await this._recordAttempt(email, clientIP, userAgent, false, 'bad_2fa');
          return res.status(401).json({
            success: false,
            error: 'Code d\'authentification invalide'
          });
        }
      }

      // Login reussi
      await this._recordAttempt(email, clientIP, userAgent, true);

      // Regenerer la session (protection session fixation)
      req.session.regenerate((err) => {
        if (err) {
          console.error('Erreur regeneration session:', err);
          return res.status(500).json({ success: false, error: 'Erreur serveur' });
        }

        req.session.user = {
          id: user.id,
          email: user.email,
          role: user.role
        };

        return res.json({
          success: true,
          user: {
            email: user.email,
            role: user.role
          }
        });
      });
    } catch (error) {
      console.error('Erreur lors de la connexion:', error);
      return res.status(500).json({
        success: false,
        error: 'Erreur serveur lors de la connexion'
      });
    }
  }

  /**
   * POST /api/auth/logout - Deconnexion
   */
  logout(req, res) {
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({
          success: false,
          error: 'Erreur lors de la déconnexion'
        });
      }
      res.json({ success: true });
    });
  }

  /**
   * POST /api/auth/verify-token - Verifie un token d'invitation
   */
  verifyToken(req, res) {
    try {
      const token = (req.body && req.body.token) || req.query.token;

      if (!token) {
        return res.status(400).json({
          success: false,
          error: 'Token manquant'
        });
      }

      const invitation = authService.verifyInvitationToken(token);

      if (invitation) {
        return res.json({
          success: true,
          email: invitation.email
        });
      } else {
        return res.status(400).json({
          success: false,
          error: 'Token invalide ou expiré'
        });
      }
    } catch (error) {
      console.error('Erreur lors de la verification du token:', error);
      return res.status(500).json({
        success: false,
        error: 'Erreur serveur'
      });
    }
  }

  /**
   * POST /api/auth/setup-password - Creation de compte avec token
   */
  async setupPassword(req, res) {
    try {
      const { token, password } = req.body;

      if (!token || !password) {
        return res.status(400).json({
          success: false,
          error: 'Token et mot de passe requis'
        });
      }

      const passwordValidation = validatePassword(password);
      if (!passwordValidation.valid) {
        return res.status(400).json({
          success: false,
          error: passwordValidation.error
        });
      }

      const user = await authService.activateInvitation(token, password);

      console.log(`✓ Compte cree avec succes pour: ${user.email}`);
      return res.json({
        success: true,
        message: 'Compte créé avec succès'
      });
    } catch (error) {
      console.error('Erreur lors de la creation du compte:', error);
      return res.status(400).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * POST /api/auth/invite - Inviter un nouvel utilisateur (Admin only)
   */
  async invite(req, res) {
    try {
      const { email } = req.body;
      const invitation = authService.createInvitation(email, req.session.user.email);

      try {
        await emailService.sendInvitationEmail(email, invitation.token);
        return res.json({
          success: true,
          message: 'Invitation envoyée avec succès'
        });
      } catch (emailError) {
        console.error('Erreur lors de l\'envoi de l\'email:', emailError);
        return res.status(500).json({
          success: false,
          error: 'L\'invitation a été créée mais l\'email n\'a pas pu être envoyé'
        });
      }
    } catch (error) {
      console.error('Erreur lors de la creation de l\'invitation:', error);
      return res.status(400).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * GET /api/auth/users - Liste des utilisateurs et invitations (Admin only)
   */
  getUsers(req, res) {
    try {
      const users = authService.getAllUsers();
      const invitations = authService.getAllInvitations();

      return res.json({
        success: true,
        currentUserId: req.session.user.id,
        users: users.map(u => ({
          id: u.id,
          email: u.email,
          role: u.role,
          status: u.status,
          createdAt: u.createdAt,
          totpEnabled: u.totpEnabled
        })),
        invitations: invitations.map(inv => ({
          id: inv.id,
          email: inv.email,
          status: inv.status,
          createdAt: inv.createdAt,
          expiresAt: inv.expiresAt,
          invitedBy: inv.invitedBy
        }))
      });
    } catch (error) {
      console.error('Erreur lors de la recuperation des utilisateurs:', error);
      return res.status(500).json({
        success: false,
        error: 'Erreur serveur'
      });
    }
  }

  /**
   * POST /api/auth/change-role - Change le role d'un utilisateur (Admin only)
   */
  changeRole(req, res) {
    try {
      const { userId, newRole } = req.body;

      if (!userId || !newRole) {
        return res.status(400).json({
          success: false,
          error: 'userId et newRole requis'
        });
      }

      if (!['user', 'admin'].includes(newRole)) {
        return res.status(400).json({
          success: false,
          error: 'Rôle invalide. Valeurs acceptées: user, admin'
        });
      }

      const user = authService.changeUserRole(userId, newRole);

      if (user) {
        return res.json({ success: true, message: 'Rôle modifié avec succès', user });
      } else {
        return res.status(404).json({ success: false, error: 'Utilisateur non trouvé' });
      }
    } catch (error) {
      console.error('Erreur lors du changement de role:', error);
      return res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
  }

  /**
   * DELETE /api/auth/delete-user - Supprime un utilisateur (Admin only)
   */
  deleteUser(req, res) {
    try {
      const { userId } = req.body;

      if (!userId) {
        return res.status(400).json({ success: false, error: 'userId requis' });
      }

      const success = authService.deleteUser(userId);

      if (success) {
        return res.json({ success: true, message: 'Utilisateur supprimé avec succès' });
      } else {
        return res.status(404).json({ success: false, error: 'Utilisateur non trouvé' });
      }
    } catch (error) {
      console.error('Erreur lors de la suppression de l\'utilisateur:', error);
      return res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
  }

  /**
   * POST /api/auth/clean-invitations - Nettoie les invitations expirees (Admin only)
   */
  cleanInvitations(req, res) {
    try {
      const removed = authService.cleanInvitations();
      return res.json({
        success: true,
        message: `${removed} invitation(s) supprimée(s)`,
        removedCount: removed
      });
    } catch (error) {
      console.error('Erreur lors du nettoyage des invitations:', error);
      return res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
  }

  // ==================== 2FA ENDPOINTS ====================

  /**
   * POST /api/auth/2fa/setup - Genere un secret TOTP + QR code
   */
  async setup2FA(req, res) {
    try {
      const result = await authService.setup2FA(req.session.user.id);
      return res.json({
        success: true,
        qrCode: result.qrCodeDataUrl,
        secret: result.secret
      });
    } catch (error) {
      console.error('Erreur setup 2FA:', error);
      return res.status(400).json({ success: false, error: error.message });
    }
  }

  /**
   * POST /api/auth/2fa/verify - Confirme l'activation du 2FA
   */
  verify2FA(req, res) {
    try {
      const { code } = req.body;

      if (!code || code.length !== 6) {
        return res.status(400).json({
          success: false,
          error: 'Code a 6 chiffres requis'
        });
      }

      const result = authService.verify2FASetup(req.session.user.id, code);

      return res.json({
        success: true,
        message: '2FA activé avec succès',
        backupCodes: result.backupCodes
      });
    } catch (error) {
      console.error('Erreur verification 2FA:', error);
      return res.status(400).json({ success: false, error: error.message });
    }
  }

  /**
   * POST /api/auth/2fa/disable - Desactive le 2FA
   */
  async disable2FA(req, res) {
    try {
      const { password } = req.body;

      if (!password) {
        return res.status(400).json({
          success: false,
          error: 'Mot de passe requis pour desactiver le 2FA'
        });
      }

      await authService.disable2FA(req.session.user.id, password);

      return res.json({
        success: true,
        message: '2FA désactivé avec succès'
      });
    } catch (error) {
      console.error('Erreur desactivation 2FA:', error);
      return res.status(400).json({ success: false, error: error.message });
    }
  }

  /**
   * GET /api/auth/2fa/status - Statut 2FA de l'utilisateur
   */
  get2FAStatus(req, res) {
    try {
      const status = authService.get2FAStatus(req.session.user.id);
      return res.json({ success: true, ...status });
    } catch (error) {
      console.error('Erreur statut 2FA:', error);
      return res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
  }

  // ==================== PASSWORD CHANGE ====================

  /**
   * POST /api/auth/change-password - Change le mot de passe
   */
  async changePassword(req, res) {
    try {
      const { currentPassword, newPassword } = req.body;

      if (!currentPassword || !newPassword) {
        return res.status(400).json({
          success: false,
          error: 'Mot de passe actuel et nouveau mot de passe requis'
        });
      }

      const passwordValidation = validatePassword(newPassword);
      if (!passwordValidation.valid) {
        return res.status(400).json({
          success: false,
          error: passwordValidation.error
        });
      }

      await authService.changePassword(req.session.user.id, currentPassword, newPassword);

      return res.json({
        success: true,
        message: 'Mot de passe modifié avec succès'
      });
    } catch (error) {
      console.error('Erreur changement mot de passe:', error);
      return res.status(400).json({ success: false, error: error.message });
    }
  }

  // ==================== LOGIN AUDIT ====================

  /**
   * GET /api/auth/login-audit - Historique des connexions (Admin only)
   */
  getLoginAudit(req, res) {
    try {
      const { page = 1, limit = 50, email = null } = req.query;
      const safeLimit = Math.min(Math.max(1, parseInt(limit) || 50), 200);
      const safePage = Math.max(1, parseInt(page) || 1);
      const offset = (safePage - 1) * safeLimit;

      const items = databaseService.getLoginAuditHistory({
        limit: safeLimit,
        offset,
        email: email || null
      });

      return res.json({ success: true, items, page: safePage });
    } catch (error) {
      console.error('Erreur audit login:', error);
      return res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
  }
}

// Export d'une instance unique (singleton)
module.exports = new AuthController();
