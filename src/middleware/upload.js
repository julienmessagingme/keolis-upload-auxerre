const multer = require('multer');
const path = require('path');
const config = require('../config');

/**
 * Configuration de Multer pour l'upload de fichiers
 * Stockage en mémoire (pas de fichiers sur disque)
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: config.storage.upload.maxFileSize
  },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const allowedFormats = config.storage.upload.allowedFormats;

    if (!allowedFormats.includes(ext)) {
      return cb(new Error(config.storage.upload.errorMessages.invalidFormat));
    }

    cb(null, true);
  }
});

/**
 * Middleware pour gérer les erreurs d'upload Multer
 * @param {Error} err - Erreur Multer
 * @param {Request} req - Requête Express
 * @param {Response} res - Réponse Express
 * @param {Function} next - Fonction suivante
 */
function handleUploadError(err, req, res, next) {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        error: config.storage.upload.errorMessages.fileTooLarge
      });
    }

    return res.status(400).json({
      success: false,
      error: `Erreur d'upload: ${err.message}`
    });
  }

  if (err) {
    return res.status(400).json({
      success: false,
      error: err.message
    });
  }

  next();
}

module.exports = {
  upload,
  handleUploadError
};
