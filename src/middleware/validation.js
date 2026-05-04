/**
 * Middlewares de validation des données
 */

/**
 * Valide le format d'un email
 * @param {string} email - Email à valider
 * @returns {boolean} True si valide
 */
function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Valide un mot de passe
 * Exigences: min 12 chars, 1 majuscule, 1 minuscule, 1 chiffre, 1 caractere special
 * @param {string} password - Mot de passe a valider
 * @returns {Object} { valid: boolean, error: string }
 */
function validatePassword(password) {
  if (!password || password.length < 12) {
    return {
      valid: false,
      error: 'Le mot de passe doit contenir au moins 12 caractères'
    };
  }

  if (!/[A-Z]/.test(password)) {
    return {
      valid: false,
      error: 'Le mot de passe doit contenir au moins une lettre majuscule'
    };
  }

  if (!/[a-z]/.test(password)) {
    return {
      valid: false,
      error: 'Le mot de passe doit contenir au moins une lettre minuscule'
    };
  }

  if (!/[0-9]/.test(password)) {
    return {
      valid: false,
      error: 'Le mot de passe doit contenir au moins un chiffre'
    };
  }

  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    return {
      valid: false,
      error: 'Le mot de passe doit contenir au moins un caractère spécial'
    };
  }

  return { valid: true };
}

/**
 * Middleware pour valider les données de login
 */
function validateLogin(req, res, next) {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      success: false,
      error: 'Email et mot de passe requis'
    });
  }

  if (!isValidEmail(email)) {
    return res.status(400).json({
      success: false,
      error: 'Format d\'email invalide'
    });
  }

  next();
}

/**
 * Middleware pour valider les données d'inscription
 */
function validateRegistration(req, res, next) {
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

  next();
}

/**
 * Middleware pour valider une invitation
 */
function validateInvitation(req, res, next) {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({
      success: false,
      error: 'Email requis'
    });
  }

  if (!isValidEmail(email)) {
    return res.status(400).json({
      success: false,
      error: 'Format d\'email invalide'
    });
  }

  next();
}

module.exports = {
  isValidEmail,
  validatePassword,
  validateLogin,
  validateRegistration,
  validateInvitation
};
