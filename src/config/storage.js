/**
 * Configuration du stockage cloud
 * Backblaze B2 + OpenAI Vector Store
 */
module.exports = {
  // Backblaze B2 Configuration
  b2: {
    applicationKeyId: process.env.B2_APP_KEY_ID,
    applicationKey: process.env.B2_APP_KEY,
    bucketId: process.env.B2_BUCKET_ID,
    bucketName: process.env.B2_BUCKET_NAME || 'auxerre',
    downloadUrl: 'https://f003.backblazeb2.com/file'
  },

  // OpenAI Configuration
  openai: {
    apiKey: process.env.OPENAI_API_KEY,
    vectorStoreId: process.env.OPENAI_VECTOR_STORE_ID,
    baseUrl: 'https://api.openai.com/v1',
    // Timeout pour le polling d'indexation (en secondes)
    indexationTimeout: 60
  },

  // Multer Configuration (upload)
  upload: {
    // Taille maximale des fichiers (en bytes)
    maxFileSize: 10 * 1024 * 1024, // 10 Mo
    // Formats acceptés
    allowedFormats: ['.pdf', '.txt'],
    // Messages d'erreur
    errorMessages: {
      invalidFormat: 'Format non accepté. Formats acceptés: PDF, TXT | Taille max: 10 Mo',
      fileTooLarge: 'Fichier trop volumineux. Taille max: 10 Mo'
    }
  }
};
