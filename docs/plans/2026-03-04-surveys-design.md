# Design - Suivi Enquêtes Qualité

**Date**: 2026-03-04
**Statut**: Approuvé

## Contexte

MessagingMe envoie un message WhatsApp aux clients après une conversation pour recueillir leur satisfaction (1 à 5 étoiles + message optionnel). Un webhook POST est envoyé à chaque réponse. Cette feature compile ces données dans un dashboard de suivi.

## Architecture

Nouvelle feature `surveys/` suivant le pattern existant (controller, service, routes, index.js).

## Base de données

### Table `surveys` (SQLite)

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | TEXT PK | ID auto-généré (`Date.now()_random`) |
| `phone` | TEXT NOT NULL | Numéro complet (stocké en clair pour export CSV) |
| `rating` | INTEGER NOT NULL | 1 à 5 |
| `message` | TEXT | Message optionnel du client |
| `receivedAt` | TEXT NOT NULL | Date ISO reçue dans le webhook |
| `createdAt` | DATETIME | Auto, insertion en BDD |

Index sur `receivedAt DESC` et `rating`.

## Endpoints API

| Route | Méthode | Auth | Description |
|-------|---------|------|-------------|
| `POST /api/surveys/webhook?token=xxx` | POST | Token secret | Réception webhook MessagingMe |
| `GET /api/surveys/stats` | GET | Session | Stats agrégées (moyenne, répartition, évolution) |
| `GET /api/surveys/history` | GET | Session | Liste paginée + filtres (période, note) |
| `GET /api/surveys/export` | GET | Session | Export CSV des données filtrées |

### Sécurité webhook

Token secret en query string, stocké dans `.env` (`SURVEY_WEBHOOK_TOKEN=xxx`). Requêtes sans token valide -> 401.

### Payload webhook attendu

```json
{
  "phone": "+33612345678",
  "rating": 4,
  "message": "Très bien, merci !",
  "date": "2026-03-04T14:30:00Z"
}
```

## Frontend (surveys.html)

### Navigation
Nouvel onglet "Enquêtes Qualité" dans la navbar (icône étoile), entre Base de Connaissances et Administration.

### Layout

1. **Barre de filtres** (sticky) : boutons période (7j/30j/90j + date picker custom), filtre par note (toggle 1-5 étoiles), bouton Export CSV
2. **4 cartes stats** : Note moyenne (+ tendance), Total réponses, % satisfaits (4-5 étoiles), % insatisfaits (1-2 étoiles)
3. **Graphique répartition** : Barres horizontales 1-5 étoiles, couleurs rouge -> vert
4. **Graphique évolution** : Courbe note moyenne par jour/semaine (Chart.js CDN)
5. **Liste réponses** : Tableau paginé (50/page) — Date, Note (étoiles visuelles), Téléphone masqué (•••• XX XX), Message. Fond rouge léger pour 1-2 étoiles.

### Affichage téléphone
Partiellement masqué à l'écran (•••• 56 78), complet dans l'export CSV.

### Librairie graphique
Chart.js via CDN (léger, pas de build).

## Fichiers à créer

```
src/features/surveys/
  ├── surveys.controller.js
  ├── surveys.service.js
  ├── surveys.routes.js
  └── index.js
public/
  └── surveys.html
```

## Fichiers à modifier

- `src/app.js` — Enregistrement des routes `/api/surveys`
- `src/services/database.service.js` — Création table `surveys` + méthodes CRUD/stats
- `public/*.html` — Ajout lien navbar "Enquêtes Qualité" sur toutes les pages
- `.env` — Ajout `SURVEY_WEBHOOK_TOKEN`
