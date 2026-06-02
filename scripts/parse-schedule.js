/**
 * Parser de fiche horaire Auxerr'Mlebus (PDF -> JSON structure).
 *
 * Outil de BUILD (hors runtime) : pdfjs-dist est une devDependency. Le runtime
 * lit le JSON genere, jamais le PDF. A relancer quand une grille change :
 *
 *   node scripts/parse-schedule.js <chemin.pdf> <numeroLigne> [fichier-sortie.json]
 *
 * Sans fichier de sortie, ecrit le chemin par defaut
 * src/features/bus-agent/data/ligne-<n>.json. On ecrit le fichier directement
 * (pas via redirection shell) car pdfjs imprime des warnings de polyfill sur
 * stdout qui corrompraient un JSON redirige.
 *
 * Principe : on lit la couche texte du PDF avec ses coordonnees (x,y). Lire la
 * grille "a la vision" (LLM) s'est revele faux et lent ; les coordonnees, elles,
 * sont exactes. On regroupe les items par ligne (y), on aplatit les jetons
 * horaires de gauche a droite (x) -- certaines cellules de terminus sont
 * collees en un seul item "10:07 10:24 ..." -- et on separe les deux sens par
 * le grand ecart vertical qui separe les deux tableaux.
 */

const TIME_TOKENS = /\d{1,2}:\d{2}/g; // tous les horaires d'un item (gere les blobs colles)
const HAS_TIME = /\d{1,2}:\d{2}/;
const NAME_X_MAX = 190; // les noms d'arret sont dans la colonne de gauche (x < 190) ; 1er horaire a x~198
const MARKER = /^(\d+|N|Flexi|bus)$/i; // pastilles de zone / Flexibus collees au nom (mais "H2" reste un seul item)
const ROW_Y_TOLERANCE = 3; // px : regroupe les items d'une meme ligne
const MIN_TIMES_PER_ROW = 3; // en-dessous, ce n'est pas une ligne d'arret

async function extractItems(buffer) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
  }).promise;
  const page = await doc.getPage(1);
  const content = await page.getTextContent();
  const items = content.items
    .map((it) => ({
      s: (it.str || '').trim(),
      x: Math.round(it.transform[4]),
      y: Math.round(it.transform[5]),
    }))
    .filter((it) => it.s);
  const fullText = content.items.map((it) => it.str).join(' ');
  return { items, fullText };
}

function clusterRows(items) {
  const rows = [];
  for (const it of items) {
    let row = rows.find((r) => Math.abs(r.y - it.y) <= ROW_Y_TOLERANCE);
    if (!row) {
      row = { y: it.y, items: [] };
      rows.push(row);
    }
    row.items.push(it);
  }
  return rows;
}

function parseRow(row) {
  const sorted = [...row.items].sort((a, b) => a.x - b.x);
  const heures = [];
  for (const it of sorted) {
    const matches = it.s.match(TIME_TOKENS);
    if (matches) heures.push(...matches);
  }
  const nom = sorted
    .filter((i) => i.x < NAME_X_MAX && !HAS_TIME.test(i.s) && !MARKER.test(i.s))
    .map((i) => i.s)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  return { y: row.y, nom, heures };
}

/**
 * Coupe les lignes d'arret en deux tableaux la ou l'ecart vertical est le plus
 * grand (l'espace entre les deux grilles, bien superieur a l'interligne).
 */
function splitTables(dataRows) {
  const sorted = [...dataRows].sort((a, b) => b.y - a.y);
  let gapIdx = -1;
  let gapSize = -1;
  for (let i = 0; i < sorted.length - 1; i++) {
    const gap = sorted[i].y - sorted[i + 1].y;
    if (gap > gapSize) {
      gapSize = gap;
      gapIdx = i;
    }
  }
  return [sorted.slice(0, gapIdx + 1), sorted.slice(gapIdx + 1)];
}

function tableToSens(rows) {
  // rows deja triees par y decroissant = ordre du parcours (haut vers bas)
  const arrets = rows.map((r) => ({ nom: r.nom, heures: r.heures }));
  return {
    de: arrets[0].nom,
    vers: arrets[arrets.length - 1].nom,
    arrets,
  };
}

async function parseSchedule(buffer, ligne) {
  const { items, fullText } = await extractItems(buffer);
  const dataRows = clusterRows(items)
    .map(parseRow)
    .filter((r) => r.nom && r.heures.length >= MIN_TIMES_PER_ROW);

  if (dataRows.length < 4) {
    throw new Error(`Parsing suspect : seulement ${dataRows.length} lignes d'arret trouvees`);
  }

  const [tableA, tableB] = splitTables(dataRows);
  const sens = [tableToSens(tableA), tableToSens(tableB)];

  const fonctionnement = (fullText.match(/FONCTIONNE[^.]*?(?:vacances|scolaire)/i) || [])[0] || null;
  const valableDes = (fullText.match(/VALABLES?\s+D[EÈ]S\s+LE\s+([0-9].*?\d{4})/i) || [])[1] || null;

  return {
    ligne: String(ligne),
    fonctionnement: fonctionnement ? fonctionnement.replace(/\s+/g, ' ').trim() : null,
    valable_des: valableDes ? valableDes.trim() : null,
    genere_le: new Date().toISOString(),
    sens,
  };
}

module.exports = { parseSchedule };

// --- CLI ---
if (require.main === module) {
  const fs = require('fs');
  const path = require('path');
  const [pdfPath, ligne, outArg] = process.argv.slice(2);
  if (!pdfPath || !ligne) {
    console.error('Usage: node scripts/parse-schedule.js <chemin.pdf> <numeroLigne> [fichier-sortie.json]');
    process.exit(1);
  }
  const outPath =
    outArg || path.join(__dirname, '..', 'src', 'features', 'bus-agent', 'data', `ligne-${ligne}.json`);
  parseSchedule(fs.readFileSync(pdfPath), ligne)
    .then((data) => {
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      fs.writeFileSync(outPath, JSON.stringify(data, null, 2) + '\n');
      console.error(
        `Ecrit ${outPath} : ${data.sens.length} sens, ` +
          data.sens.map((s) => `${s.de}->${s.vers} (${s.arrets.length} arrets)`).join(' | ')
      );
    })
    .catch((err) => {
      console.error('Echec parsing:', err.message);
      process.exit(1);
    });
}
