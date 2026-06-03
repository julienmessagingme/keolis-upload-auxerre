# Work in progress

(Aucun chantier actif pour le moment.)

---

## Historique récent (livré)

### 2026-06-03 : Agent horaires bus, 11 grilles (LIVRE)

Endpoint HTTP appele par un flow WhatsApp existant (SmartLink) pour repondre
"prochains passages" a partir d'un arret + une heure, dans les DEUX sens.

Decision cle : Gemini 2.5 Pro teste pour lire la grille PDF, juge inexploitable
(arrets inventes, ~moitie des courses perdues, 178s de latence). Abandonne. La
fiche horaire a une couche texte propre : on l'extrait hors runtime avec les
coordonnees (x,y) via pdfjs-dist (devDependency), ce qui est exact et instantane.

**Modele GRILLE.** Une grille = un tableau horaire precis (ligne 3 semaine et
ligne 3 samedi = 2 grilles). Le flow WhatsApp choisit la grille selon le jour et
l'envoie dans le param HTTP `grille` ; pas de calendrier de jours feries cote
serveur (`ligne` reste un alias accepte). 11 grilles committees :
`1, 1-samedi, 2, 3, 3-samedi, 4, 4-samedi, 5, dim1, dim2, navette`.

- `scripts/build-schedules.js` : driver de BUILD reproductible. MANIFEST des 11
  grilles (PDF B2, libelle, options) ; telecharge, parse, compose, ecrit les
  `ligne-<grille>.json`. `npm run build:schedules` (`--dry` pour verifier sans
  ecrire, `--only <grille>` pour une seule). `scripts/parse-schedule.js` reste
  l'outil unitaire (debug d'une fiche). Mode `single`/`--boucle` pour les lignes
  en boucle (La Navette : 1 seul sens, depart = arrivee), `renames` pour les noms
  abimes a l'extraction (DIM1 : "ème R.I." -> "4ème R.I.").
- `bus.service.js` : lookup deterministe par `grille`, comparaison en MINUTES
  depuis minuit (pas en chaine), renvoie les sens + un `message` pret a envoyer.
  Resolution du nom d'arret en 3 etapes : exact (accents/casse ignores) ->
  sous-chaine (>=3 car.) -> flou (distance d'edition en sous-chaine approximative,
  >=4 car., seuil ~1 faute / 3 car.). Tolere les fautes de frappe car tous les
  flows WhatsApp ne passent pas forcement par un selecteur. Boucle : 1 sens, pas
  de filtre faux-terminus, message "Passages :" sans "Vers".
- `GET /api/bus/next?grille=3-samedi&arret=...&heure=HH:MM&n=3` et
  `GET /api/bus/stops?grille=1`. Auth par jeton `BUS_AGENT_TOKEN` (header
  `x-api-key` ou `?token=`, compare en temps constant), rate-limit 60 req/min.

Pour regenerer : `npm run build:schedules`. Pour ajouter une grille : entree au
MANIFEST + rebuild. Toujours recouper le resume de controle avec le PDF.

### 2026-05-21 — Mode viz camembert (LIVRE)

3e mode de visualisation ajouté à `/dashboards.html` à côté de Entonnoir et
Histogramme : doughnut Chart.js qui répartit les étapes du tableau en tranches,
avec total + % base 100 en légende et tooltip. Aucun changement backend — le
`total` par step était déjà calculé côté serveur. Export PNG et CSV adaptés
(le CSV gagne une colonne `Part_base_100_pct`).

### 2026-05-04 — Mes tableaux (LIVRE)

Module « Mes tableaux » deploye en prod. Plan d'execution dans
[docs/plans/2026-05-04-auxerre-dashboards-implementation.md](docs/plans/2026-05-04-auxerre-dashboards-implementation.md).
12 tasks + un fix CRITICAL identifie en code review : atomic replace via
RPC PL/pgSQL (cf. migration 007 cote EDH/Supabase). Le meme bug existait
identique cote EDH ; le fix profite aux 2 projets simultanement.

Fonctionnel :
- API CRUD complete `/api/dashboards/*` (list, create, get, patch, delete, data)
- Page `/dashboards.html` : vue liste + builder SPA-style (toggle dans la meme page)
- Builder : palette events MessagingMe (gauche) + steps drag-and-drop SortableJS (droite)
  - Cumul multi-events par step (anti-doublon)
  - Reorder steps en drag, label editable, fallback inline = noms refs joints par '+'
  - Validation client : confirm si steps vides au save
- Viz funnel : bar chart horizontal Chart.js sur 30 derniers jours
- Sub-nav `[Custom events] [Mes tableaux]` cohérent dans stats.html et dashboards.html

Securite : `created_by = req.session.user.userUuid` hardcode cote serveur,
ownership check avec capture d'erreurs Supabase, validation cross-tenant
des `event_ns` contre `mm_events WHERE school_slug='auxerre'`.

### 2026-05-04 — Module Stats (LIVRE)

Module Stats deploye en prod. Plan d'execution dans
[docs/plans/2026-05-04-auxerre-stats-implementation.md](docs/plans/2026-05-04-auxerre-stats-implementation.md).
12 tasks, 4 bugs corriges en code review (occurred_at field mapping,
parseNumeric NaN, WebSocket Node 20, bornes UTC DST).

Fonctionnel :
- Sync nocturne MessagingMe → Supabase a 22h Europe/Paris (node-cron interne au process)
- Endpoint admin resync manuel + endpoint cron-bearer fallback
- Page `/stats.html` : filtre periode, accordeons par event, charts Chart.js journaliers
- Onglet « Stats » dans la navbar des 5 pages existantes

### 2026-05-04 — Regularisation infra (LIVRE)

Avant d'attaquer Stats, reorganise l'infra :

- Le repo GitHub `keolis-upload-auxerre` ne contenait qu'un sous-ensemble de 13 fichiers (juste la feature surveys). Le projet complet vivait sur le VPS, non versionne. Probleme : impossible d'avoir un workflow git propre.
- Rapatrie l'integralite du projet VPS dans le repo via `tar` over SSH (en excluant `.env`, `node_modules`, `data/`, fichiers Windows pourris).
- VPS transforme en repo git pointant sur GitHub (`git init` + `remote add` + `reset --hard origin/main`).
- Workflow GitHub Actions cree : push to main → SSH VPS → git pull → docker rebuild → reconnect mcp-robot_default → health check. Premier run de bout en bout reussi en 29s.
- Cle SSH dediee generee pour l'action (publique ajoutee au VPS, privee mise comme secret GitHub `SSH_PRIVATE_KEY`, locale supprimee).
- VPS nettoye : `NUL` + 2 dossiers Windows pourris (`C:Users...`) supprimes.
