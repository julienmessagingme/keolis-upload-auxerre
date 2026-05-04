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

## En cours de developpement

### Mes tableaux
Inspire de la plateforme EDH. Chaque utilisateur cree ses propres funnels, drag-and-drop d'events MessagingMe vers des etapes ordonnees. Chaque etape peut cumuler plusieurs events (volumes sommes). Persiste, prive par user (mappe via `auxerre_users` Supabase), viz bar chart. Pas d'URLs trackees comme EDH, uniquement custom events MessagingMe. Plan d'implementation a rediger.

Voir [wip.md](wip.md) pour l'etat d'avancement.
