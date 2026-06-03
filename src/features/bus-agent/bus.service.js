const fs = require('fs');
const path = require('path');

/**
 * Agent horaires bus : lookup deterministe des prochains passages.
 *
 * Les grilles sont des JSON verifies generes hors runtime par
 * scripts/parse-schedule.js (couche texte du PDF + coordonnees). Le runtime ne
 * lit jamais un PDF : il charge les ligne-<grille>.json au demarrage et compare
 * les heures en MINUTES depuis minuit (jamais en chaine : "6:40" > "14:00" en
 * lexicographique). On renvoie toujours les DEUX sens (le flow WhatsApp ne sait
 * pas dans quel sens va l'usager).
 *
 * GRILLE vs LIGNE. Une "grille" est un tableau horaire precis (ex. la ligne 3
 * en semaine, ou la ligne 3 le samedi : deux grilles distinctes). Le flow
 * WhatsApp choisit la bonne grille selon le jour et envoie son identifiant dans
 * le parametre `grille` (ex. "3", "3-samedi", "dim1", "navette"). C'est cet id
 * qui sert de cle de lookup ; `ligne` reste un alias accepte pour compat.
 */

const DATA_DIR = path.join(__dirname, 'data');

function normalize(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function timeToMin(hhmm) {
  const [h, m] = String(hhmm).split(':').map(Number);
  return h * 60 + m;
}

function padTime(hhmm) {
  const [h, m] = String(hhmm).split(':');
  return `${String(h).padStart(2, '0')}:${m}`;
}

/** Accepte "14:30", "14h30", "14h", "1430", "9:05". Renvoie minutes ou null. */
function parseHeure(input) {
  const raw = String(input || '').trim();
  let m = raw.match(/^(\d{1,2})\s*[:hH]\s*(\d{2})$/) || raw.match(/^(\d{1,2})[hH]$/) || raw.match(/^(\d{3,4})$/);
  if (!m) return null;
  let h;
  let min;
  if (m[0].match(/^\d{3,4}$/)) {
    const digits = m[1];
    h = parseInt(digits.slice(0, digits.length - 2), 10);
    min = parseInt(digits.slice(-2), 10);
  } else {
    h = parseInt(m[1], 10);
    min = m[2] ? parseInt(m[2], 10) : 0;
  }
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

// --- Chargement des grilles au demarrage (cache memoire) ---

function loadLignes() {
  const map = new Map();
  let files = [];
  try {
    files = fs.readdirSync(DATA_DIR).filter((f) => /^ligne-.+\.json$/.test(f));
  } catch (err) {
    console.error('[bus] Repertoire data introuvable:', DATA_DIR, err.message);
    return map;
  }
  for (const file of files) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), 'utf8'));
      // Cle de lookup = grille si presente, sinon ligne (compat anciens JSON)
      data._key = String(data.grille != null ? data.grille : data.ligne);
      // Libelle affiche a l'usager (ex. "Ligne 3 (samedi)", "La Navette")
      data._libelle = data.libelle || `Ligne ${data.ligne != null ? data.ligne : data._key}`;
      // index normalise des arrets par sens, pour un lookup O(1). Sur une ligne
      // en boucle un arret peut apparaitre plusieurs fois : on garde la 1re
      // occurrence (l'ordre du parcours, donc les premiers passages).
      data._index = data.sens.map((sens) => {
        const byStop = new Map();
        for (const arret of sens.arrets) {
          const key = normalize(arret.nom);
          if (!byStop.has(key)) byStop.set(key, arret);
        }
        return byStop;
      });
      // union des arrets (sans doublon) avec leur forme normalisee, pour la
      // resolution d'un nom saisi (exact / sous-chaine / flou) et le selecteur
      const seen = new Set();
      data._allStops = [];
      for (const sens of data.sens) {
        for (const a of sens.arrets) {
          const norm = normalize(a.nom);
          if (!seen.has(norm)) {
            seen.add(norm);
            data._allStops.push({ nom: a.nom, norm });
          }
        }
      }
      map.set(data._key, data);
    } catch (err) {
      console.error('[bus] Grille illisible:', file, err.message);
    }
  }
  return map;
}

const LIGNES = loadLignes();

/** Resout une grille par son identifiant (`grille` ou alias `ligne`). */
function getGrille(grille) {
  return LIGNES.get(String(grille).trim());
}

/**
 * Distance d'edition minimale pour retrouver `needle` comme sous-chaine
 * APPROXIMATIVE de `hay` (le match peut commencer n'importe ou dans hay : la
 * 1re ligne de la matrice est a 0). Tolere une faute de frappe n'importe ou
 * dans le fragment saisi, pas seulement en fin. Levenshtein classique sinon.
 */
function fuzzyContainsDistance(needle, hay) {
  const n = needle.length;
  const m = hay.length;
  if (n === 0) return 0;
  let prev = new Array(m + 1).fill(0); // depart possible a toute position de hay
  for (let i = 1; i <= n; i++) {
    const cur = new Array(m + 1);
    cur[0] = i;
    for (let j = 1; j <= m; j++) {
      const cost = needle[i - 1] === hay[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = cur;
  }
  return Math.min(...prev);
}

/**
 * Resout un nom saisi vers le nom canonique d'un arret de la ligne.
 * Ordre : exact normalise -> sous-chaine -> flou (distance d'edition). Le flou
 * n'est tente que pour une saisie d'au moins 4 caracteres et sous un seuil
 * proportionnel a sa longueur (~1 faute par 3 caracteres), pour eviter les
 * faux positifs. Renvoie le nom canonique ou null.
 */
function resolveStopName(allStops, normQuery) {
  if (!normQuery) return null;
  const exact = allStops.find((s) => s.norm === normQuery);
  if (exact) return exact.nom;
  // sous-chaine : a partir de 3 caracteres (en deca, trop ambigu -> on rejette)
  const subs = normQuery.length >= 3 ? allStops.filter((s) => s.norm.includes(normQuery)) : [];
  if (subs.length) {
    subs.sort((a, b) => a.norm.length - b.norm.length); // match le plus serre
    return subs[0].nom;
  }
  if (normQuery.length < 4) return null;
  const maxDist = Math.max(1, Math.floor(normQuery.length / 3));
  let best = null;
  let bestDist = Infinity;
  for (const s of allStops) {
    const d = fuzzyContainsDistance(normQuery, s.norm);
    if (d < bestDist) {
      bestDist = d;
      best = s;
    }
  }
  return bestDist <= maxDist ? best.nom : null;
}

class BusService {
  /** Liste des grilles chargees (pour diagnostic / flow). */
  listLignes() {
    return [...LIGNES.keys()].sort();
  }

  /**
   * Arrets d'une grille (union des sens, sans doublon, ordre du parcours).
   * Sert au selecteur du flow WhatsApp.
   */
  listStops({ grille }) {
    const data = getGrille(grille);
    if (!data) return { success: false, error: `Grille ${grille} inconnue`, grilles: this.listLignes() };
    return { success: true, grille: data._key, ligne: data._libelle, arrets: data._allStops.map((s) => s.nom) };
  }

  /**
   * Prochains passages a un arret, pour les DEUX sens, a partir d'une heure.
   * @returns objet structure + un champ `message` pret a renvoyer au flow.
   */
  nextDepartures({ grille, arret, heure, n }) {
    const data = getGrille(grille);
    if (!data) {
      return { success: false, error: `Grille ${grille} inconnue`, grilles: this.listLignes() };
    }
    if (!arret || !String(arret).trim()) {
      return { success: false, error: 'arret requis' };
    }
    const minNow = parseHeure(heure);
    if (minNow === null) {
      return { success: false, error: `heure invalide: "${heure}" (attendu HH:MM)` };
    }
    const count = Math.min(Math.max(parseInt(n, 10) || 3, 1), 10);
    const normArret = normalize(arret);

    const canonNom = resolveStopName(data._allStops, normArret);
    if (!canonNom) {
      return {
        success: false,
        error: `Arret "${arret}" introuvable sur ${data._libelle}`,
        arrets: data._allStops.map((s) => s.nom),
      };
    }
    const normCanon = normalize(canonNom);

    const sensResults = [];
    data.sens.forEach((sens, i) => {
      const arretObj = data._index[i].get(normCanon);
      if (!arretObj) return; // ce sens ne dessert pas cet arret
      // A un terminus, le sens "vers cet arret" est l'horaire d'arrivee des bus
      // qui y terminent : inutile pour un passager (on ne prend pas un bus vers
      // l'arret ou l'on est deja). On ne garde que les vrais departs. Exception :
      // une ligne en boucle (depart = arrivee) n'a pas de "faux terminus".
      if (!sens.boucle && normalize(sens.vers) === normCanon) return;
      const prochains = arretObj.heures.filter((h) => timeToMin(h) >= minNow).slice(0, count);
      sensResults.push({ de: sens.de, vers: sens.vers, boucle: !!sens.boucle, prochains });
    });

    // Cas degenere (ligne a sens unique dont c'est le terminus) : pas de depart utile
    if (sensResults.length === 0) {
      return {
        success: true,
        grille: data._key,
        ligne: data._libelle,
        arret: canonNom,
        sens: [],
        message: `${data._libelle}, arret ${canonNom} : terminus, aucun depart a afficher.`,
      };
    }

    return {
      success: true,
      grille: data._key,
      ligne: data._libelle,
      arret: canonNom,
      heure: `${String(Math.floor(minNow / 60)).padStart(2, '0')}:${String(minNow % 60).padStart(2, '0')}`,
      sens: sensResults,
      message: this._formatMessage(data._libelle, canonNom, minNow, sensResults),
    };
  }

  _formatMessage(libelle, arret, minNow, sensResults) {
    const hh = `${String(Math.floor(minNow / 60)).padStart(2, '0')}:${String(minNow % 60).padStart(2, '0')}`;
    const lines = [`${libelle}, arret ${arret}, prochains passages a partir de ${hh} :`];
    for (const s of sensResults) {
      // Ligne en boucle : un seul sens, pas de "Vers X" (depart = arrivee).
      const prefix = s.boucle ? 'Passages' : `Vers ${s.vers}`;
      if (s.prochains.length > 0) {
        lines.push(`${prefix} : ${s.prochains.map(padTime).join(', ')}`);
      } else {
        lines.push(`${prefix} : plus de passage aujourd'hui`);
      }
    }
    return lines.join('\n');
  }
}

module.exports = new BusService();
module.exports.normalize = normalize;
module.exports.parseHeure = parseHeure;
