const PDFDocument = require('pdfkit');

/**
 * Service de génération de PDF
 * Crée des PDF à partir de texte avec mise en forme Keolis
 */
class PDFService {
  /**
   * Crée un PDF à partir de texte
   * @param {string} text - Contenu textuel
   * @param {string} title - Titre du document
   * @returns {Promise<Buffer>} Buffer du PDF généré
   */
  async createFromText(text, title) {
    return new Promise((resolve, reject) => {
      try {
        const chunks = [];
        const doc = new PDFDocument({
          size: 'A4',
          margin: 50
        });

        // Capturer les chunks du PDF
        doc.on('data', chunk => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        // En-tête du document
        doc.fontSize(20)
           .fillColor('#005596')
           .text(title, { align: 'center' })
           .moveDown();

        // Date de création
        doc.fontSize(10)
           .fillColor('#666666')
           .text(`Créé le: ${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR')}`, {
             align: 'center'
           })
           .moveDown(2);

        // Contenu principal
        doc.fontSize(12)
           .fillColor('#000000')
           .text(text, {
             align: 'left',
             lineGap: 5
           });

        // Pied de page
        doc.moveDown(3)
           .fontSize(8)
           .fillColor('#999999')
           .text('Keolis Auxerre - Base de Connaissances', {
             align: 'center'
           });

        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Crée un PDF avec une structure personnalisée
   * @param {Object} options - Options de génération
   * @param {string} options.title - Titre du document
   * @param {string} options.content - Contenu principal
   * @param {string} options.footer - Texte du pied de page
   * @param {Object} options.styles - Styles personnalisés
   * @returns {Promise<Buffer>} Buffer du PDF généré
   */
  async createCustom(options) {
    const {
      title,
      content,
      footer = 'Keolis Auxerre',
      styles = {}
    } = options;

    return new Promise((resolve, reject) => {
      try {
        const chunks = [];
        const doc = new PDFDocument({
          size: 'A4',
          margin: 50
        });

        doc.on('data', chunk => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        // Titre
        doc.fontSize(styles.titleSize || 20)
           .fillColor(styles.titleColor || '#005596')
           .text(title, { align: 'center' })
           .moveDown(2);

        // Contenu
        doc.fontSize(styles.contentSize || 12)
           .fillColor(styles.contentColor || '#000000')
           .text(content, {
             align: 'left',
             lineGap: 5
           });

        // Pied de page
        doc.moveDown(3)
           .fontSize(styles.footerSize || 8)
           .fillColor(styles.footerColor || '#999999')
           .text(footer, {
             align: 'center'
           });

        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Crée un PDF formaté pour une paire Question/Réponse
   * @param {string} question - La question
   * @param {string} answer - La réponse
   * @returns {Promise<Buffer>} Buffer du PDF généré
   */
  async createFromQA(question, answer) {
    return new Promise((resolve, reject) => {
      try {
        const chunks = [];
        const doc = new PDFDocument({
          size: 'A4',
          margin: 50
        });

        doc.on('data', chunk => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        // Titre du document
        const titlePreview = question.substring(0, 50) + (question.length > 50 ? '...' : '');
        doc.fontSize(20)
           .fillColor('#005596')
           .text(`Q&A - ${titlePreview}`, { align: 'center' })
           .moveDown();

        // Date de création
        doc.fontSize(10)
           .fillColor('#666666')
           .text(`Créé le: ${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR')}`, {
             align: 'center'
           })
           .moveDown(2);

        // Section Question
        doc.fontSize(14)
           .fillColor('#005596')
           .text('Question:', { continued: false })
           .moveDown(0.5);

        doc.fontSize(12)
           .fillColor('#000000')
           .text(question, {
             align: 'left',
             lineGap: 5
           })
           .moveDown(2);

        // Section Réponse
        doc.fontSize(14)
           .fillColor('#005596')
           .text('Réponse:', { continued: false })
           .moveDown(0.5);

        doc.fontSize(12)
           .fillColor('#000000')
           .text(answer, {
             align: 'left',
             lineGap: 5
           });

        // Pied de page
        doc.moveDown(3)
           .fontSize(8)
           .fillColor('#999999')
           .text('Keolis Auxerre - Base de Connaissances', {
             align: 'center'
           });

        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Crée un fichier TXT formaté pour une paire Question/Réponse (plus léger que PDF)
   * @param {string} question - La question
   * @param {string} answer - La réponse
   * @returns {Buffer} Buffer du fichier TXT généré
   */
  createTextFromQA(question, answer) {
    const date = new Date();
    const formattedDate = date.toLocaleDateString('fr-FR');
    const formattedTime = date.toLocaleTimeString('fr-FR');

    const content = `Q&A - Keolis Auxerre
Créé le: ${formattedDate} à ${formattedTime}

═══════════════════════════════════════════════════════════════

QUESTION:
${question}

RÉPONSE:
${answer}

═══════════════════════════════════════════════════════════════
Base de Connaissances Keolis Auxerre`;

    return Buffer.from(content, 'utf-8');
  }
}

// Export d'une instance unique (singleton)
module.exports = new PDFService();
