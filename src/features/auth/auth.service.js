const bcrypt = require('bcrypt');
const crypto = require('crypto');
const otplib = require('otplib');
const QRCode = require('qrcode');
const authModel = require('./auth.model');
const config = require('../../config');
const { getSupabase } = require('../../services/supabase.service');

/**
 * Service d'authentification
 * Contient toute la logique métier pour l'authentification
 */
class AuthService {
  /**
   * Créé un nouvel utilisateur
   * @param {string} email - Email de l'utilisateur
   * @param {string} password - Mot de passe en clair
   * @param {string} role - Rôle ('user' ou 'admin')
   * @returns {Promise<Object>} Utilisateur créé
   */
  async createUser(email, password, role = 'user') {
    // Vérifier si l'utilisateur existe déjà
    const existingUser = authModel.findUserByEmail(email);
    if (existingUser) {
      throw new Error('Cet email est déjà utilisé');
    }

    // Hacher le mot de passe
    const hashedPassword = await bcrypt.hash(password, 12);

    const user = {
      id: crypto.randomUUID(),
      email,
      password: hashedPassword,
      role,
      status: 'active',
      createdAt: new Date().toISOString()
    };

    authModel.addUser(user);

    return {
      id: user.id,
      email: user.email,
      role: user.role
    };
  }

  /**
   * Vérifie les identifiants d'un utilisateur (login)
   * @param {string} email - Email
   * @param {string} password - Mot de passe en clair
   * @returns {Promise<Object|null>} Utilisateur ou null si invalide
   */
  async verifyUser(email, password) {
    const user = authModel.findUserByEmail(email);

    if (!user || user.status !== 'active') {
      return null;
    }

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      return null;
    }

    return {
      id: user.id,
      email: user.email,
      role: user.role
    };
  }

  /**
   * Crée une nouvelle invitation
   * @param {string} email - Email du futur utilisateur
   * @param {string} invitedBy - ID de l'admin qui invite
   * @param {string} role - Rôle ('user' ou 'admin')
   * @returns {Object} Invitation créée
   */
  createInvitation(email, invitedBy, role = 'user') {
    // Vérifier si l'utilisateur existe déjà
    const existingUser = authModel.findUserByEmail(email);
    if (existingUser) {
      throw new Error('Cet utilisateur existe déjà');
    }

    // Vérifier si une invitation existe déjà
    const existingInvitation = authModel.findInvitationByEmail(email);
    if (existingInvitation) {
      throw new Error('Une invitation est déjà en attente pour cet email');
    }

    const token = crypto.randomBytes(32).toString('hex');

    // Durée d'expiration selon le rôle
    const expiryDays = role === 'admin'
      ? config.email.invitationExpiry.admin
      : config.email.invitationExpiry.user;

    const invitation = {
      id: crypto.randomUUID(),
      email,
      token,
      invitedBy,
      role,
      status: 'pending',
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000).toISOString()
    };

    authModel.addInvitation(invitation);

    return invitation;
  }

  /**
   * Vérifie un token d'invitation
   * @param {string} token - Token d'invitation
   * @returns {Object|null} Invitation valide ou null
   */
  verifyInvitationToken(token) {
    const invitation = authModel.findInvitationByToken(token);

    if (!invitation || invitation.status !== 'pending') {
      return null;
    }

    // Vérifier si expiré
    if (new Date(invitation.expiresAt) < new Date()) {
      return null;
    }

    return invitation;
  }

  /**
   * Active une invitation (création du compte avec mot de passe)
   * @param {string} token - Token d'invitation
   * @param {string} password - Mot de passe choisi
   * @returns {Promise<Object>} Utilisateur créé
   */
  async activateInvitation(token, password) {
    const invitation = authModel.findInvitationByToken(token);

    if (!invitation || invitation.status !== 'pending') {
      throw new Error('Invitation invalide ou expirée');
    }

    // Vérifier si expiré
    if (new Date(invitation.expiresAt) < new Date()) {
      throw new Error('Cette invitation a expiré');
    }

    // Créer l'utilisateur
    const hashedPassword = await bcrypt.hash(password, 12);

    const user = {
      id: crypto.randomUUID(),
      email: invitation.email,
      password: hashedPassword,
      role: invitation.role || 'user',
      status: 'active',
      createdAt: new Date().toISOString()
    };

    authModel.addUser(user);

    // Marquer l'invitation comme utilisée
    authModel.updateInvitation(token, {
      status: 'used',
      usedAt: new Date().toISOString()
    });

    return {
      id: user.id,
      email: user.email,
      role: user.role
    };
  }

  /**
   * Initialise le premier admin si aucun utilisateur n'existe
   * @param {string} email - Email de l'admin
   * @returns {Object|null} Invitation admin ou null si déjà des users
   */
  async initializeAdmin(email) {
    const allUsers = authModel.getAllUsers();

    // Si aucun utilisateur n'existe, créer une invitation pour l'admin
    if (allUsers.length === 0) {
      console.log(`🔐 Aucun utilisateur trouvé. Création de l'invitation admin pour ${email}...`);

      const token = crypto.randomBytes(32).toString('hex');

      const invitation = {
        id: crypto.randomUUID(),
        email,
        token,
        invitedBy: 'system',
        role: 'admin',
        status: 'pending',
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
      };

      authModel.addInvitation(invitation);

      return invitation;
    }

    return null;
  }

  /**
   * Change le rôle d'un utilisateur
   * @param {string} userId - ID de l'utilisateur
   * @param {string} newRole - Nouveau rôle ('user' ou 'admin')
   * @returns {Object|null} Utilisateur modifié ou null
   */
  changeUserRole(userId, newRole) {
    const user = authModel.findUserById(userId);

    if (!user) {
      return null;
    }

    authModel.updateUser(userId, { role: newRole });

    return {
      id: user.id,
      email: user.email,
      role: newRole
    };
  }

  /**
   * Supprime un utilisateur
   * @param {string} userId - ID de l'utilisateur
   * @returns {boolean} Success
   */
  deleteUser(userId) {
    return authModel.deleteUser(userId);
  }

  /**
   * Récupère tous les utilisateurs
   * @returns {Array} Liste des utilisateurs
   */
  getAllUsers() {
    return authModel.getAllUsers();
  }

  /**
   * Récupère toutes les invitations
   * @returns {Array} Liste des invitations
   */
  getAllInvitations() {
    return authModel.getAllInvitations();
  }

  /**
   * Supprime toutes les invitations
   * @returns {number} Nombre d'invitations supprimées
   */
  cleanInvitations() {
    return authModel.cleanInvitations();
  }

  // ==================== 2FA TOTP ====================

  /**
   * Verifie si un utilisateur a le 2FA actif
   * @param {string} email
   * @returns {boolean}
   */
  has2FAEnabled(email) {
    const user = authModel.findUserByEmail(email);
    return !!(user && user.totpEnabled);
  }

  /**
   * Genere un secret TOTP et un QR code pour l'activer
   * @param {string} userId - ID de l'utilisateur
   * @returns {Promise<{ secret: string, qrCodeDataUrl: string }>}
   */
  async setup2FA(userId) {
    const user = authModel.findUserById(userId);
    if (!user) throw new Error('Utilisateur non trouve');

    if (user.totpEnabled) {
      throw new Error('2FA deja active. Desactivez-le d\'abord.');
    }

    const secret = otplib.generateSecret();

    // Stocker le secret temporairement (pas encore confirme)
    authModel.updateUser(userId, { totpSecret: secret });

    // Generer le QR code
    const otpauth = otplib.generateURI({
      secret,
      accountName: user.email,
      issuer: 'Keolis Auxerre'
    });
    const qrCodeDataUrl = await QRCode.toDataURL(otpauth);

    return { secret, qrCodeDataUrl };
  }

  /**
   * Confirme l'activation du 2FA en verifiant un code TOTP
   * Genere aussi 10 codes de secours
   * @param {string} userId
   * @param {string} totpCode - Code a 6 chiffres
   * @returns {{ backupCodes: string[] }}
   */
  verify2FASetup(userId, totpCode) {
    const user = authModel.findUserById(userId);
    if (!user) throw new Error('Utilisateur non trouve');
    if (!user.totpSecret) throw new Error('Aucun secret 2FA en attente. Lancez le setup d\'abord.');
    if (user.totpEnabled) throw new Error('2FA deja active');

    // Verifier le code TOTP
    const result = otplib.verifySync({ token: totpCode, secret: user.totpSecret });
    const isValid = result.valid;
    if (!isValid) {
      throw new Error('Code invalide. Verifiez votre application d\'authentification.');
    }

    // Generer 10 codes de secours (8 chars chacun, hex)
    const backupCodes = [];
    const hashedBackupCodes = [];
    for (let i = 0; i < 10; i++) {
      const code = crypto.randomBytes(4).toString('hex').toUpperCase();
      backupCodes.push(code);
      // Hacher avec SHA-256 (rapide car codes haute entropie)
      hashedBackupCodes.push(
        crypto.createHash('sha256').update(code).digest('hex')
      );
    }

    // Activer le 2FA
    authModel.updateUser(userId, {
      totpEnabled: true,
      backupCodes: JSON.stringify(hashedBackupCodes)
    });

    console.log(`🔐 2FA active pour ${user.email}`);
    return { backupCodes };
  }

  /**
   * Verifie un code TOTP lors du login
   * @param {string} email
   * @param {string} code - Code TOTP ou code de secours
   * @returns {boolean}
   */
  verify2FACode(email, code) {
    const user = authModel.findUserByEmail(email);
    if (!user || !user.totpEnabled || !user.totpSecret) return false;

    // Tenter la verification TOTP standard
    const totpResult = otplib.verifySync({ token: code, secret: user.totpSecret });
    const isValidTotp = totpResult.valid;
    if (isValidTotp) return true;

    // Tenter un code de secours
    const cleanCode = code.toUpperCase().replace(/\s/g, '');
    const hashedInput = crypto.createHash('sha256').update(cleanCode).digest('hex');
    const storedCodes = JSON.parse(user.backupCodes || '[]');

    const codeIndex = storedCodes.indexOf(hashedInput);
    if (codeIndex !== -1) {
      // Supprimer le code utilise (one-time use)
      storedCodes.splice(codeIndex, 1);
      authModel.updateUser(user.id, { backupCodes: JSON.stringify(storedCodes) });
      console.log(`🔑 Code de secours utilise par ${user.email} (${storedCodes.length} restants)`);
      return true;
    }

    return false;
  }

  /**
   * Desactive le 2FA pour un utilisateur
   * @param {string} userId
   * @param {string} password - Mot de passe pour confirmer
   * @returns {Promise<boolean>}
   */
  async disable2FA(userId, password) {
    const user = authModel.findUserById(userId);
    if (!user) throw new Error('Utilisateur non trouve');
    if (!user.totpEnabled) throw new Error('2FA non active');

    // Verifier le mot de passe
    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) throw new Error('Mot de passe incorrect');

    authModel.updateUser(userId, {
      totpEnabled: false,
      totpSecret: null,
      backupCodes: null
    });

    console.log(`🔓 2FA desactive pour ${user.email}`);
    return true;
  }

  // ==================== PASSWORD CHANGE ====================

  /**
   * Change le mot de passe d'un utilisateur connecte
   * @param {string} userId
   * @param {string} currentPassword
   * @param {string} newPassword
   * @returns {Promise<boolean>}
   */
  async changePassword(userId, currentPassword, newPassword) {
    const user = authModel.findUserById(userId);
    if (!user) throw new Error('Utilisateur non trouve');

    // Verifier l'ancien mot de passe
    const isValid = await bcrypt.compare(currentPassword, user.password);
    if (!isValid) throw new Error('Mot de passe actuel incorrect');

    // Verifier que le nouveau est different
    const isSame = await bcrypt.compare(newPassword, user.password);
    if (isSame) throw new Error('Le nouveau mot de passe doit etre different de l\'ancien');

    // Hacher et sauvegarder
    const hashedPassword = await bcrypt.hash(newPassword, 12);
    authModel.updateUser(userId, {
      password: hashedPassword,
      passwordChangedAt: new Date().toISOString()
    });

    console.log(`🔑 Mot de passe change pour ${user.email}`);
    return true;
  }

  /**
   * Retourne le statut 2FA d'un utilisateur
   * @param {string} userId
   * @returns {{ totpEnabled: boolean, backupCodesRemaining: number }}
   */
  get2FAStatus(userId) {
    const user = authModel.findUserById(userId);
    if (!user) throw new Error('Utilisateur non trouve');

    const backupCodes = user.backupCodes ? JSON.parse(user.backupCodes) : [];

    return {
      totpEnabled: !!user.totpEnabled,
      backupCodesRemaining: backupCodes.length
    };
  }

  /**
   * Upsert l'user Auxerre dans la table Supabase auxerre_users (separee des
   * users EDH). Retourne le uuid stable a stocker dans la session Express,
   * utilise comme created_by dans dashboards (Plan 2 a venir).
   *
   * Tolerant aux pannes Supabase : si l'upsert echoue, log + retourne null.
   * Le login Auxerre continue a marcher.
   */
  async upsertAuxerreUser(email, name) {
    try {
      const sb = getSupabase();
      const { data, error } = await sb
        .from('auxerre_users')
        .upsert({ email, name: name ?? null }, { onConflict: 'email' })
        .select('id')
        .single();
      if (error) throw error;
      return data.id;
    } catch (err) {
      console.error(JSON.stringify({
        level: 'warn', msg: 'upsertAuxerreUser failed',
        email, err: err.message,
      }));
      return null;
    }
  }
}

// Export d'une instance unique (singleton)
module.exports = new AuthService();
