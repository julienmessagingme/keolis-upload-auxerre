const database = require('../../config/database');

/**
 * Modèle de données pour l'authentification
 * Gère l'accès aux données utilisateurs et invitations
 */
class AuthModel {
  constructor() {
    // Initialiser la base de données si nécessaire
    database.initialize();
  }

  /**
   * Lit toutes les données (users + invitations)
   * @returns {Object} { users: Array, invitations: Array }
   */
  readData() {
    return database.read();
  }

  /**
   * Écrit les données
   * @param {Object} data - { users: Array, invitations: Array }
   * @returns {boolean} Success
   */
  writeData(data) {
    return database.write(data);
  }

  /**
   * Trouve un utilisateur par email
   * @param {string} email - Email de l'utilisateur
   * @returns {Object|null} Utilisateur ou null
   */
  findUserByEmail(email) {
    const data = this.readData();
    return data.users.find(u => u.email === email) || null;
  }

  /**
   * Trouve un utilisateur par ID
   * @param {string} userId - ID de l'utilisateur
   * @returns {Object|null} Utilisateur ou null
   */
  findUserById(userId) {
    const data = this.readData();
    return data.users.find(u => u.id === userId) || null;
  }

  /**
   * Trouve une invitation par token
   * @param {string} token - Token d'invitation
   * @returns {Object|null} Invitation ou null
   */
  findInvitationByToken(token) {
    const data = this.readData();
    return data.invitations.find(i => i.token === token) || null;
  }

  /**
   * Trouve une invitation par email
   * @param {string} email - Email de l'invitation
   * @returns {Object|null} Invitation ou null
   */
  findInvitationByEmail(email) {
    const data = this.readData();
    return data.invitations.find(
      i => i.email === email && i.status === 'pending'
    ) || null;
  }

  /**
   * Ajoute un utilisateur
   * @param {Object} user - Données utilisateur
   * @returns {boolean} Success
   */
  addUser(user) {
    const data = this.readData();
    data.users.push(user);
    return this.writeData(data);
  }

  /**
   * Met à jour un utilisateur
   * @param {string} userId - ID de l'utilisateur
   * @param {Object} updates - Modifications
   * @returns {boolean} Success
   */
  updateUser(userId, updates) {
    const data = this.readData();
    const userIndex = data.users.findIndex(u => u.id === userId);

    if (userIndex === -1) {
      return false;
    }

    data.users[userIndex] = { ...data.users[userIndex], ...updates };
    return this.writeData(data);
  }

  /**
   * Supprime un utilisateur
   * @param {string} userId - ID de l'utilisateur
   * @returns {boolean} Success
   */
  deleteUser(userId) {
    const data = this.readData();
    const userIndex = data.users.findIndex(u => u.id === userId);

    if (userIndex === -1) {
      return false;
    }

    data.users.splice(userIndex, 1);
    return this.writeData(data);
  }

  /**
   * Ajoute une invitation
   * @param {Object} invitation - Données de l'invitation
   * @returns {boolean} Success
   */
  addInvitation(invitation) {
    const data = this.readData();
    data.invitations.push(invitation);
    return this.writeData(data);
  }

  /**
   * Met à jour une invitation
   * @param {string} token - Token de l'invitation
   * @param {Object} updates - Modifications
   * @returns {boolean} Success
   */
  updateInvitation(token, updates) {
    const data = this.readData();
    const invIndex = data.invitations.findIndex(i => i.token === token);

    if (invIndex === -1) {
      return false;
    }

    data.invitations[invIndex] = { ...data.invitations[invIndex], ...updates };
    return this.writeData(data);
  }

  /**
   * Nettoie les invitations expirees et utilisees
   * Conserve les invitations pending non expirees
   * @returns {number} Nombre d'invitations supprimees
   */
  cleanInvitations() {
    const data = this.readData();
    const now = new Date();
    const before = data.invitations.length;

    // Garder uniquement les invitations pending et non expirees
    data.invitations = data.invitations.filter(inv =>
      inv.status === 'pending' && new Date(inv.expiresAt) > now
    );

    const removed = before - data.invitations.length;
    this.writeData(data);
    return removed;
  }

  /**
   * Récupère tous les utilisateurs
   * @returns {Array} Liste des utilisateurs (sans mots de passe)
   */
  getAllUsers() {
    const data = this.readData();
    return data.users.map(u => ({
      id: u.id,
      email: u.email,
      role: u.role,
      status: u.status,
      createdAt: u.createdAt,
      totpEnabled: !!u.totpEnabled
    }));
  }

  /**
   * Récupère toutes les invitations
   * @returns {Array} Liste des invitations
   */
  getAllInvitations() {
    const data = this.readData();
    return data.invitations;
  }
}

// Export d'une instance unique (singleton)
module.exports = new AuthModel();
