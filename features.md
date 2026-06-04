# Features — Keolis Auxerre

Vue produit des fonctionnalites de la plateforme. Pour les details techniques, voir [documentation.md](documentation.md).

## Live (en production)

### Authentification
Systeme par invitation uniquement — pas d'inscription publique. Un admin invite un utilisateur par email, qui recoit un lien pour activer son compte (definir mot de passe). Roles `admin` ou `user`. Protection brute force : apres 5 echecs login, l'IP est bloquee 15 minutes.

### Fiches horaires
Page `/index.html`. L'utilisateur uploade un PDF de fiche horaire → le fichier est stocke sur Backblaze B2, puis un webhook notifie MessagingMe pour que le chatbot WhatsApp puisse le proposer. Liste des fiches existantes + historique des uploads + suppression.

### Actualites (News)
Page `/news.html` (page d'accueil par defaut). L'utilisateur publie une actualite → un webhook envoie le contenu au chatbot MessagingMe. Historique des publications.

### Base de connaissances
Page `/knowledge.html`. L'utilisateur peut alimenter le chatbot Auxerre via 3 modes :
- Upload fichier PDF/TXT (vectorise dans OpenAI Vector Store)
- Saisie texte libre (converti en PDF puis vectorise)
- Q/R structurees (paire question + reponse)

Recherche, modification, suppression. Liste paginee.

### Enquetes qualite
Page `/surveys.html`. Recoit en webhook depuis MessagingMe les reponses 1-5 etoiles des clients via WhatsApp. Dashboard avec stats agregees (nombre de reponses, moyenne, distribution), historique paginee + filtres par date/note, export CSV.

### Administration
Page `/admin.html` (admin only). Gestion des utilisateurs : inviter, lister, changer role, supprimer. Nettoyage des invitations expirees.

### Stats
Page `/stats.html`. Volumetrie journaliere de chaque custom event MessagingMe Auxerre. Filtre periode (7j/30j/90j ou date custom), liste accordeons par event, chart bar journalier au depliement. Sync nocturne automatique a 22h + bouton resync manuel pour les admins. Hebergement DB : Supabase, projet partage avec EDH (`school_slug = "auxerre"`, isolation par construction — EDH n'a pas `auxerre` dans sa constante SCHOOLS).

### Mes tableaux
Page `/dashboards.html` (sous-onglet de Stats). Chaque utilisateur cree ses propres funnels prives en glissant des events MessagingMe depuis une palette vers des etapes ordonnees. Chaque etape peut cumuler plusieurs events (volumes sommes). Reorder en drag, label editable. 3 modes de visualisation : **Entonnoir** (SVG funnel avec drop-off %), **Histogramme** (bar chart) et **Camembert** (doughnut base 100 — tranches = étapes, % de chaque étape sur le total). Replacement atomique des steps en DB via RPC PL/pgSQL (transaction Postgres, rollback automatique si crash au milieu). Persiste sur Supabase (memes tables qu'EDH, scope `auxerre`).

### Agent horaires bus
Pas de page web : une API appelee par un flow WhatsApp (SmartLink). Le client choisit un arret et une heure dans le flow ; l'API repond les prochains passages dans les DEUX sens (vers chaque terminus), sous forme d'un message pret a afficher. Tolere les fautes de frappe sur le nom d'arret.

Couvre **11 grilles** : les 5 lignes en semaine, les variantes samedi/grandes vacances des lignes 1, 3 et 4, les services du dimanche (DIM1 et DIM2), et La Navette du centre-ville (ligne en boucle, repond "Passages" sans notion de sens). C'est le flow WhatsApp qui choisit la bonne grille selon le jour et l'envoie a l'API (pas de calendrier de jours feries cote serveur).

Donnees issues des fiches horaires officielles, extraites avec exactitude (couche texte du PDF), jamais devinees. Mise a jour quand une fiche change : relancer la generation (`npm run build:schedules`) et committer les JSON.

## En cours de developpement

(Aucune feature en cours pour le moment — voir [wip.md](wip.md).)
