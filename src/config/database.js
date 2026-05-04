const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

/**
 * Configuration de la base de donnees (JSON file)
 * Ecriture atomique via fichier temporaire + rename
 * Protection contre la corruption en cas de crash
 */
module.exports = {
  // Chemin vers le fichier de donnees utilisateurs
  usersFilePath: path.join(__dirname, '..', '..', 'data', 'users.json'),

  // Initialise le fichier si necessaire
  initialize() {
    const dataDir = path.join(__dirname, '..', '..', 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    if (!fs.existsSync(this.usersFilePath)) {
      this._atomicWrite(
        this.usersFilePath,
        JSON.stringify({ users: [], invitations: [] }, null, 2)
      );
    }
  },

  // Lit les donnees
  read() {
    try {
      const data = fs.readFileSync(this.usersFilePath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.error('Erreur lors de la lecture des donnees:', error);
      return { users: [], invitations: [] };
    }
  },

  // Ecrit les donnees (ecriture atomique)
  write(data) {
    try {
      this._atomicWrite(
        this.usersFilePath,
        JSON.stringify(data, null, 2)
      );
      return true;
    } catch (error) {
      console.error('Erreur lors de l\'ecriture des donnees:', error);
      return false;
    }
  },

  /**
   * Ecriture atomique : ecrit dans un fichier temporaire puis rename.
   * Empeche la corruption si le processus crash pendant l'ecriture.
   * Sur le meme filesystem, fs.renameSync est atomique.
   */
  _atomicWrite(filePath, content) {
    const dir = path.dirname(filePath);
    const tmpFile = path.join(dir, `.tmp_${crypto.randomBytes(6).toString('hex')}`);
    fs.writeFileSync(tmpFile, content, 'utf8');
    fs.renameSync(tmpFile, filePath);
  }
};
