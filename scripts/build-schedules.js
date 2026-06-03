/**
 * Build de TOUTES les grilles horaires Auxerr'Mlebus (B2 -> JSON committe).
 *
 * Outil de BUILD (hors runtime). Source de verite = le MANIFEST ci-dessous :
 * une entree par grille, avec son PDF sur Backblaze B2, son identifiant `grille`
 * (la cle que le flow WhatsApp envoie dans le param HTTP `grille`), son libelle
 * affiche, et les options de parsing specifiques (boucle, renames). Relancer
 * apres tout changement de fiche :
 *
 *   npm run build:schedules            # toutes les grilles
 *   npm run build:schedules -- --dry   # parse + resume sans ecrire (verif)
 *   npm run build:schedules -- --only 3-samedi
 *
 * Pourquoi un manifest plutot que parse-schedule.js a la main, grille par
 * grille : 11 grilles a maintenir, chacune avec ses quirks (DIM1 a des noms
 * abimes, La Navette est une boucle a 1 sens). Le manifest fige ces quirks et
 * rend le build reproductible. parse-schedule.js reste l'outil unitaire (debug
 * d'une fiche isolee) ; ce driver l'orchestre pour le lot complet.
 *
 * IMPORTANT : LIRE les resumes de controle imprimes et les RECOUPER avec les
 * PDF avant de committer (cf. documentation.md). Un parsing peut etre faux sans
 * lever d'erreur si une fiche a une mise en page differente.
 */

const fs = require('fs');
const path = require('path');
const { parseSchedule, summarize } = require('./parse-schedule');

const B2_BASE = 'https://f003.backblazeb2.com/file/auxerre/';
const DATA_DIR = path.join(__dirname, '..', 'src', 'features', 'bus-agent', 'data');

/**
 * Une entree par grille.
 *   grille  : identifiant de lookup (param HTTP `grille`). Sert au nom de
 *             fichier ligne-<grille>.json et a la cle runtime.
 *   pdf     : nom du fichier sur B2 (espaces encodes en +).
 *   ligne   : numero/code de ligne affiche.
 *   libelle : texte montre a l'usager dans la reponse WhatsApp.
 *   service : a quel calendrier correspond la grille (doc/diagnostic).
 *   single  : true pour une ligne en BOUCLE (1 seul sens, pas de decoupage).
 *   renames : corrections de noms d'arret abimes a l'extraction.
 */
const MANIFEST = [
  { grille: '1', pdf: 'Ligne+1.pdf', ligne: '1', libelle: 'Ligne 1', service: 'semaine' },
  {
    grille: '1-samedi',
    pdf: 'Ligne+1+samedi+et+grandes+vacances.pdf',
    ligne: '1',
    libelle: 'Ligne 1 (samedi et grandes vacances)',
    service: 'samedi-vacances',
  },
  { grille: '2', pdf: 'Ligne+2.pdf', ligne: '2', libelle: 'Ligne 2', service: 'semaine' },
  { grille: '3', pdf: 'Ligne+3.pdf', ligne: '3', libelle: 'Ligne 3', service: 'semaine' },
  {
    grille: '3-samedi',
    pdf: 'Ligne+3+samedi+et+grandes+vacances.pdf',
    ligne: '3',
    libelle: 'Ligne 3 (samedi et grandes vacances)',
    service: 'samedi-vacances',
  },
  { grille: '4', pdf: 'Ligne+4.pdf', ligne: '4', libelle: 'Ligne 4', service: 'semaine' },
  {
    grille: '4-samedi',
    pdf: 'Ligne+4+samedi+et+grandes+vacances.pdf',
    ligne: '4',
    libelle: 'Ligne 4 (samedi et grandes vacances)',
    service: 'samedi-vacances',
  },
  { grille: '5', pdf: 'Ligne+5.pdf', ligne: '5', libelle: 'Ligne 5', service: 'semaine' },
  {
    grille: 'dim1',
    pdf: 'Ligne+DIM1.pdf',
    ligne: 'DIM1',
    libelle: 'Ligne DIM1 (dimanche et jours feries)',
    service: 'dimanche',
    // "4ème R.I." : le "4" est mange comme pastille de zone ; selon le sens
    // l'extraction laisse soit "ème R.I." soit juste "R.I.". "Dim" est une
    // annotation collee a "Gare SNCF". (renames = match EXACT, accents inclus.)
    renames: {
      'ème R.I.': '4ème R.I.',
      'eme R.I.': '4ème R.I.',
      'R.I.': '4ème R.I.',
      'Gare SNCF Dim': 'Gare SNCF',
    },
  },
  {
    grille: 'dim2',
    pdf: 'Ligne+DIM2.pdf',
    ligne: 'DIM2',
    libelle: 'Ligne DIM2 (dimanche et jours feries)',
    service: 'dimanche',
  },
  {
    grille: 'navette',
    pdf: 'La+Navette.pdf',
    ligne: 'Navette',
    libelle: 'La Navette (centre-ville)',
    service: 'tous-les-jours',
    single: true, // boucle : un seul sens, depart = arrivee
  },
];

async function fetchPdf(file) {
  const url = B2_BASE + file;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} sur ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

async function buildOne(entry, { dry }) {
  const buffer = await fetchPdf(entry.pdf);
  const parsed = await parseSchedule(buffer, {
    ligne: entry.ligne,
    single: !!entry.single,
    renames: entry.renames || null,
  });

  // Composition de l'objet final : metas d'adressage en tete, puis le parse.
  const out = {
    grille: entry.grille,
    ligne: entry.ligne,
    libelle: entry.libelle,
    service: entry.service,
    valable_des: parsed.valable_des,
    fonctionnement: parsed.fonctionnement,
    genere_le: parsed.genere_le,
    sens: parsed.sens,
  };

  const summary = summarize(parsed); // utilise _numPages encore present sur parsed
  const outPath = path.join(DATA_DIR, `ligne-${entry.grille}.json`);
  if (!dry) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(out, null, 2) + '\n');
  }
  return { entry, outPath, summary };
}

async function main() {
  const args = process.argv.slice(2);
  const dry = args.includes('--dry') || args.includes('--dry-run');
  const onlyIdx = args.indexOf('--only');
  const only = onlyIdx >= 0 ? args[onlyIdx + 1] : null;

  const entries = only ? MANIFEST.filter((e) => e.grille === only) : MANIFEST;
  if (only && entries.length === 0) {
    console.error(`Grille "${only}" absente du manifest. Connues: ${MANIFEST.map((e) => e.grille).join(', ')}`);
    process.exit(1);
  }

  const results = [];
  for (const entry of entries) {
    try {
      const r = await buildOne(entry, { dry });
      results.push(r);
      console.error(`\n=== grille ${entry.grille} (${entry.libelle}) ${dry ? '[DRY]' : '-> ' + path.basename(r.outPath)} ===`);
      console.error(r.summary);
    } catch (err) {
      console.error(`\n=== grille ${entry.grille} : ECHEC -> ${err.message}`);
      process.exitCode = 1;
    }
  }

  console.error(
    `\n${results.length}/${entries.length} grille(s) ${dry ? 'parsees (DRY, rien ecrit)' : 'ecrites'}.` +
      `\n--> RELIRE chaque resume contre le PDF avant de committer.`
  );
}

main().catch((err) => {
  console.error('Echec build:schedules:', err.message);
  process.exit(1);
});
