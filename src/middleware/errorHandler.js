/**
 * Middleware de gestion centralisee des erreurs
 */

/**
 * Echappe les caracteres HTML pour prevenir les XSS
 */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Gestionnaire d'erreurs global
 * @param {Error} err - Erreur capturee
 * @param {Request} req - Requete Express
 * @param {Response} res - Reponse Express
 * @param {Function} next - Fonction suivante
 */
function errorHandler(err, req, res, next) {
  // Logger l'erreur
  console.error('Erreur capturee:', {
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method
  });

  // Determiner le code de statut
  const statusCode = err.statusCode || 500;

  // Message generique en production (ne pas exposer les details d'erreur)
  const isProduction = process.env.NODE_ENV === 'production';
  const message = isProduction ? 'Une erreur est survenue' : (err.message || 'Une erreur interne est survenue');

  // Si c'est une requete API
  if (req.path.startsWith('/api/')) {
    return res.status(statusCode).json({
      success: false,
      error: message,
      ...(!isProduction && { stack: err.stack })
    });
  }

  // Sinon, page HTML avec message echappe (anti-XSS)
  const safeStatusCode = escapeHtml(statusCode);
  const safeMessage = escapeHtml(message);

  res.status(statusCode).send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Erreur</title>
      <style>
        body {
          font-family: system-ui, -apple-system, sans-serif;
          display: flex;
          justify-content: center;
          align-items: center;
          height: 100vh;
          margin: 0;
          background: #f5f5f5;
        }
        .error-container {
          text-align: center;
          padding: 2rem;
          background: white;
          border-radius: 8px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }
        h1 { color: #d32f2f; }
        p { color: #666; }
        a {
          color: #005596;
          text-decoration: none;
          font-weight: bold;
        }
      </style>
    </head>
    <body>
      <div class="error-container">
        <h1>Erreur ${safeStatusCode}</h1>
        <p>${safeMessage}</p>
        <a href="/">Retour a l'accueil</a>
      </div>
    </body>
    </html>
  `);
}

/**
 * Gestionnaire pour les routes non trouvées (404)
 * @param {Request} req - Requête Express
 * @param {Response} res - Réponse Express
 */
function notFoundHandler(req, res) {
  // Si c'est une requête API
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({
      success: false,
      error: 'Route non trouvée'
    });
  }

  // Sinon, page HTML 404
  res.status(404).send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Page non trouvée</title>
      <style>
        body {
          font-family: system-ui, -apple-system, sans-serif;
          display: flex;
          justify-content: center;
          align-items: center;
          height: 100vh;
          margin: 0;
          background: #f5f5f5;
        }
        .error-container {
          text-align: center;
          padding: 2rem;
          background: white;
          border-radius: 8px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }
        h1 { color: #005596; }
        p { color: #666; }
        a {
          color: #005596;
          text-decoration: none;
          font-weight: bold;
        }
      </style>
    </head>
    <body>
      <div class="error-container">
        <h1>404 - Page non trouvée</h1>
        <p>La page que vous recherchez n'existe pas.</p>
        <a href="/">Retour à l'accueil</a>
      </div>
    </body>
    </html>
  `);
}

module.exports = {
  errorHandler,
  notFoundHandler
};
