# Vault Rush — propositions d'amélioration et nouveaux jeux

Ce document rassemble les pistes proposées après l'audit du MVP. L'objectif est de faire évoluer Vault Rush vers une petite plateforme de jeux arcade cohérente, avec une progression commune, tout en gardant des parties rapides et une monnaie virtuelle.

## 1. Vision du projet

Vault Rush peut devenir le jeu principal d'un univers de braquage comprenant plusieurs mini-jeux. Chaque jeu doit rester facile à comprendre, rapide à lancer et utilisable sur mobile.

Les jeux partageraient :

- le même compte joueur ;
- le même solde en monnaie fictive ;
- les mêmes missions et récompenses ;
- une progression générale ;
- des statistiques et un historique communs ;
- une identité visuelle autour du braquage, des coffres et de la fuite.

## 2. Améliorations prioritaires de Vault Rush

### 2.1 Progression des étages

Afficher clairement les six étages pendant la partie :

- étage actuel ;
- étages déjà réussis ;
- prochain étage ;
- multiplicateur actuel ;
- prochain multiplicateur ;
- somme récupérable immédiatement.

Une représentation verticale ou horizontale du bâtiment permettrait au joueur de comprendre sa progression en un regard.

### 2.2 Tableau des récompenses

Avant de miser, afficher pour chaque mode :

- le nombre de portes ;
- le nombre de coffres et d'alarmes ;
- les chances de réussite ;
- les multiplicateurs des six étages ;
- le gain maximum ;
- le plafond de paiement éventuel.

Cette information doit rester accessible pendant la partie.

### 2.3 Bilan financier clair

Sur l'écran de résultat, séparer :

- la mise initiale ;
- le montant total récupéré ;
- le bénéfice ou la perte nette ;
- le nouveau solde ;
- l'étage atteint ;
- le multiplicateur final.

Tous les montants doivent être arrondis et présentés de manière uniforme, par exemple `+4,70 coins`.

### 2.4 Reprise d'une partie

Une partie active doit pouvoir être reprise après :

- une actualisation de la page ;
- la fermeture de l'onglet ;
- une perte temporaire de connexion ;
- une reconnexion au compte.

L'accueil doit proposer une action claire : `Reprendre le braquage`.

### 2.5 Tutoriel et mode démo

La première partie pourrait être guidée et gratuite :

1. choisir une mise fictive ;
2. sélectionner un mode ;
3. ouvrir une porte ;
4. comprendre la montée d'étage ;
5. choisir entre continuer et encaisser.

Le mode démo permettrait aussi de tester librement les jeux sans influencer le classement ou le solde principal.

### 2.6 Historique détaillé

Chaque partie devrait afficher :

- le jeu concerné ;
- la date ;
- la mise ;
- le mode ;
- les choix effectués ;
- l'étage atteint ;
- le résultat ;
- le montant récupéré ;
- le bénéfice net.

Il serait utile de pouvoir filtrer l'historique par jeu, mode, victoire ou défaite.

### 2.7 Statistiques du joueur

Ajouter un tableau personnel comprenant :

- nombre de parties ;
- taux de réussite ;
- bénéfice net de la session ;
- bénéfice total ;
- plus gros gain ;
- meilleur étage atteint ;
- meilleure série ;
- mode le plus joué ;
- statistiques par jeu.

### 2.8 Amélioration audiovisuelle

Renforcer l'univers du braquage avec :

- une véritable animation d'ouverture de porte ;
- une lumière dorée lors de la découverte d'un coffre ;
- une alarme plus spectaculaire lors d'une défaite ;
- une animation de montée vers l'étage suivant ;
- une animation dédiée à l'encaissement ;
- des sons courts et reconnaissables ;
- des réglages séparés pour la musique, les effets et les vibrations ;
- une option réduisant les animations.

Les emojis actuels pourraient être remplacés par des illustrations ou des éléments graphiques cohérents avec la direction artistique.

## 3. Nouvelles mécaniques pour Vault Rush

### 3.1 Choix de chemin

À certains étages, proposer deux itinéraires :

- un chemin plus sûr avec une récompense réduite ;
- un chemin plus dangereux avec un meilleur multiplicateur.

Le choix doit afficher clairement les risques et les gains possibles.

### 3.2 Bonus Scanner

Le scanner révèle une porte dangereuse avant le prochain choix. Il peut être obtenu comme récompense de mission ou trouvé rarement pendant une partie.

### 3.3 Bonus Bouclier

Le bouclier protège une seule fois contre une alarme. Son activation et sa consommation doivent être clairement visibles.

### 3.4 Double Vault

Ce bonus améliore la récompense du prochain coffre. Le multiplicateur supplémentaire doit être annoncé avant le choix de la porte.

### 3.5 Porte dorée

Une porte rare peut apparaître à certains étages. Elle accorde une récompense spéciale ou un objet cosmétique si elle est sûre.

### 3.6 Objectifs de partie

Ajouter des objectifs optionnels :

- atteindre l'étage 3 ;
- réussir deux étages consécutifs ;
- encaisser avant un étage précis ;
- terminer une partie dans un mode donné ;
- gagner avec une mise limitée.

Ces objectifs doivent offrir des récompenses fixes et compréhensibles.

## 4. Nouveaux jeux à intégrer

### 4.1 Laser Grid

Le joueur traverse une grille de sécurité ligne par ligne. À chaque ligne, il choisit une case : certaines sont sûres, les autres déclenchent les lasers.

Fonctionnement :

- plusieurs niveaux de risque ;
- multiplicateur après chaque ligne réussie ;
- choix entre continuer et encaisser ;
- grille plus large dans les modes difficiles.

Intérêt : ce jeu peut réutiliser une grande partie du moteur de Vault Rush.

### 4.2 Getaway

Le joueur organise une fuite en voiture après le braquage. À chaque étape, il choisit une route ou décide d'encaisser avant que la police ne le rattrape.

Fonctionnement :

- routes avec différents niveaux de risque ;
- jauge de poursuite ;
- multiplicateur qui augmente avec la distance ;
- obstacles et événements visuels ;
- parties très courtes.

### 4.3 Bomb Squad

Le joueur doit couper un câble parmi plusieurs. Certains câbles neutralisent une étape de la bombe, les autres déclenchent l'explosion.

Fonctionnement :

- nombre de câbles variable selon le mode ;
- compte à rebours visuel ;
- multiplicateur après chaque câble sûr ;
- possibilité d'encaisser entre deux étapes.

Le compte à rebours peut être uniquement visuel dans les modes accessibles, afin de ne pas pénaliser les joueurs qui ont besoin de plus de temps.

### 4.4 Vault Code

Le joueur tente de trouver la combinaison d'un coffre à partir d'indices.

Fonctionnement :

- propositions limitées ;
- indices du type chiffre correct, mauvaise position ou bonne position ;
- récompense calculée selon le nombre d'essais restants ;
- modes avec des codes plus longs.

Ce jeu apporte davantage de réflexion et réduit la place du hasard.

### 4.5 Diamond Drop

Le joueur lâche un diamant ou un jeton en haut d'un plateau. L'objet descend à travers des obstacles jusqu'à une zone de récompense.

Fonctionnement :

- choix de la zone de départ ;
- plateaux de différentes difficultés ;
- multiplicateurs répartis en bas ;
- animation rapide et lisible.

### 4.6 Blackjack Express

Une version courte et simplifiée du blackjack, adaptée aux parties mobiles rapides.

Fonctionnement :

- tirer ou rester ;
- règles visibles en permanence ;
- partie contre le croupier ;
- historique des cartes ;
- mode tutoriel avant toute partie classée.

### 4.7 Heist Crew

Le joueur compose une équipe de spécialistes pour réussir différentes étapes d'un braquage.

Exemples de spécialistes :

- hacker ;
- conducteur ;
- perceur de coffre ;
- éclaireur ;
- négociateur.

Chaque étape propose plusieurs choix avec des avantages, des risques et des synergies. Ce jeu serait plus narratif et pourrait accueillir des événements saisonniers.

### 4.8 Safecracker

Le joueur manipule plusieurs cadrans et doit les arrêter dans la bonne zone pour ouvrir un coffre.

Fonctionnement :

- zones de réussite visibles ;
- vitesse croissante ;
- bonus de précision ;
- difficulté progressive ;
- modes accessibles avec zones élargies ou absence de limite de temps.

Ce jeu apporte une mécanique d'adresse différente des jeux basés sur le choix et le hasard.

## 5. Ordre recommandé pour les nouveaux jeux

### Premier jeu : Laser Grid

À développer en premier parce qu'il peut partager avec Vault Rush :

- les mises ;
- les modes de risque ;
- les multiplicateurs ;
- le système d'encaissement ;
- les résultats ;
- l'historique ;
- une grande partie des règles serveur.

### Deuxième jeu : Getaway

À développer ensuite pour introduire un univers plus dynamique et une présentation différente tout en conservant une logique simple de progression et d'encaissement.

### Troisième jeu : Vault Code

À développer pour proposer une expérience plus stratégique et attirer les joueurs qui préfèrent la réflexion au hasard pur.

## 6. Progression commune

### 6.1 Niveau et expérience

Le joueur gagne de l'expérience en terminant des parties et des missions. L'expérience ne dépend pas seulement du montant gagné afin de ne pas encourager les grosses mises.

### 6.2 Succès

Exemples :

- premier encaissement ;
- atteindre le dernier étage ;
- jouer aux trois modes ;
- réussir dans plusieurs jeux ;
- compléter une série de missions ;
- réaliser une performance particulière sans bonus.

### 6.3 Missions quotidiennes et hebdomadaires

Exemples :

- jouer trois parties ;
- essayer deux jeux différents ;
- encaisser deux fois ;
- atteindre un étage précis ;
- réussir un objectif avec une petite mise.

Les missions devraient encourager la variété et la maîtrise plutôt que l'augmentation des mises.

### 6.4 Récompenses cosmétiques

Les récompenses peuvent comprendre :

- apparences de portes ;
- coffres personnalisés ;
- véhicules pour Getaway ;
- plateaux pour Laser Grid ;
- effets d'encaissement ;
- badges de profil ;
- titres ;
- thèmes d'interface.

### 6.5 Classements

Prévoir :

- un classement par jeu ;
- un classement général ;
- un classement hebdomadaire ;
- un classement entre amis si cette fonction est ajoutée ;
- un classement basé sur la maîtrise ou les objectifs, en complément du solde.

## 7. Navigation proposée

### Accueil

Contenu principal :

- solde ;
- partie à reprendre ;
- mission active ;
- raccourci vers le dernier jeu ;
- nouveautés ;
- résumé de la session.

### Arcade

Catalogue des jeux avec :

- illustration ;
- durée moyenne ;
- difficulté ;
- place du hasard et de la stratégie ;
- règles rapides ;
- bouton Jouer.

### Progression

Cette section rassemble :

- niveau ;
- expérience ;
- missions ;
- succès ;
- collections ;
- récompenses à récupérer.

### Profil

Cette section comprend :

- statistiques ;
- historique ;
- classements ;
- personnalisation ;
- réglages du son, des vibrations et des animations ;
- gestion du compte.

## 8. Principes d'expérience

Le projet devrait respecter les principes suivants :

- expliquer les probabilités, les multiplicateurs et les plafonds avant la mise ;
- toujours distinguer le montant récupéré du bénéfice net ;
- ne pas masquer une perte derrière une animation ambiguë ;
- ne pas vendre de chances supplémentaires dans une partie déjà perdue ;
- éviter les récompenses quotidiennes supprimées si le joueur ne revient pas ;
- proposer des limites de session et des rappels facultatifs ;
- permettre de couper séparément sons, musique, vibrations et animations ;
- garder une monnaie fictive clairement identifiée ;
- privilégier la progression, la maîtrise et les éléments cosmétiques pour fidéliser.

## 9. Feuille de route proposée

### Phase 1 — Fiabiliser Vault Rush

- sécuriser les sessions joueur ;
- empêcher les parties simultanées involontaires ;
- restaurer les parties actives ;
- rendre les opérations de solde atomiques ;
- corriger les arrondis ;
- gérer correctement le sixième étage ;
- afficher les erreurs réseau et serveur ;
- ajouter des tests d'intégration.

### Phase 2 — Repenser le parcours

- nouveau tutoriel ;
- tableau des gains et probabilités ;
- nouvelle sélection de mise et de mode ;
- progression visuelle des étages ;
- écran d'encaissement plus clair ;
- historique et statistiques améliorés ;
- états de chargement, erreurs et solde insuffisant.

### Phase 3 — Refonte visuelle

- nouvelle direction artistique ;
- véritables assets de portes, coffres et alarmes ;
- animations de partie ;
- interface mobile retravaillée ;
- vraie composition desktop ;
- accessibilité clavier et lecteur d'écran ;
- réduction des animations.

### Phase 4 — Progression générale

- expérience et niveaux ;
- succès ;
- missions ;
- cosmétiques ;
- nouveaux classements ;
- statistiques communes.

### Phase 5 — Laser Grid

- adaptation du moteur de risque ;
- conception de la grille ;
- règles et modes ;
- intégration au solde et à l'historique ;
- tests du parcours complet.

### Phase 6 — Getaway

- parcours de fuite ;
- routes et événements ;
- jauge de poursuite ;
- animations ;
- intégration à la progression commune.

### Phase 7 — Vault Code

- moteur d'indices ;
- niveaux de difficulté ;
- tutoriel ;
- récompenses liées aux essais restants ;
- statistiques propres au jeu.

## 10. Prochaine décision

La première maquette de refonte devrait couvrir ce parcours :

1. arrivée sur l'accueil ;
2. découverte des règles ;
3. choix de la mise et du risque ;
4. progression dans Vault Rush ;
5. choix entre continuer et encaisser ;
6. écran de résultat ;
7. historique et progression du joueur.

Cette maquette permettra de fixer la direction visuelle et la structure de navigation avant de modifier le code.
