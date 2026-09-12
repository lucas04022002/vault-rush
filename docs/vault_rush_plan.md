# Vault Rush — Plan complet de création

## 1. Concept du jeu

**Vault Rush** est un mini-jeu casino arcade en mobile-first.

Le joueur mise une somme en monnaie virtuelle, puis il entre dans un bâtiment rempli de coffres.  
À chaque étage, il doit choisir une porte.

Derrière chaque porte, il peut trouver :

- un **coffre** : le joueur passe à l'étage suivant ;
- une **alarme** : le joueur perd sa mise ;
- un **bonus** : option spéciale à ajouter dans une future version.

Le joueur peut faire **Cash Out** à tout moment pour sécuriser son gain.

> Version recommandée au départ : monnaie virtuelle uniquement.

---

## 2. Objectif du MVP

Créer une première version simple, propre et jouable :

- interface mobile-first ;
- choix de la mise ;
- choix du mode de difficulté ;
- portes cliquables ;
- résultat aléatoire côté backend ;
- système de cash-out ;
- solde fictif ;
- historique des parties ;
- responsive PC ensuite.

---

## 3. Boucle de gameplay

```txt
1. Le joueur arrive sur la page d'accueil.
2. Il choisit une mise.
3. Il choisit un mode : Safe, Risk ou Insane.
4. Il lance la partie.
5. Le backend retire la mise du solde.
6. Le joueur arrive à l'étage 1.
7. Il choisit une porte.
8. Si coffre : il monte à l'étage suivant.
9. Si alarme : il perd la partie.
10. À chaque étage réussi, il peut faire Cash Out.
11. S'il Cash Out, il récupère sa mise multipliée par le multiplicateur actuel.
12. La partie est enregistrée dans l'historique.
```

---

## 4. Règles principales

### Début de partie

Le joueur doit avoir un solde suffisant pour miser.

Exemple :

```txt
Balance : 1000 coins
Mise : 10 coins
Balance après lancement : 990 coins
```

### Choix de porte

À chaque étage, les portes sont générées côté serveur.

Exemple mode Safe :

```txt
3 portes :
- 2 coffres
- 1 alarme
```

Le joueur choisit une porte sans savoir ce qu'il y a derrière.

### Résultat

Si la porte choisie contient un coffre :

```txt
Résultat : coffre
Étage suivant : oui
Multiplicateur : augmente
```

Si la porte choisie contient une alarme :

```txt
Résultat : alarme
Partie : perdue
Payout : 0
```

### Cash-out

Le joueur peut quitter la partie après avoir réussi au moins un étage.

```txt
Gain = mise × multiplicateur actuel
```

Exemple :

```txt
Mise : 10 coins
Multiplicateur : x3.20
Gain : 32 coins
```

---

## 5. Modes de difficulté

### Mode Safe

Mode simple pour les débutants.

```txt
Nombre de portes : 3
Coffres : 2
Alarmes : 1
Nombre max d'étages : 6
House edge : 2%
Risque : faible
```

### Mode Risk

Mode intermédiaire.

```txt
Nombre de portes : 4
Coffres : 2
Alarmes : 2
Nombre max d'étages : 6
House edge : 4%
Risque : moyen
```

### Mode Insane

Mode très risqué.

```txt
Nombre de portes : 5
Coffres : 2
Alarmes : 3
Nombre max d'étages : 6
House edge : 6%
Risque : élevé
```

---

## 6. Multiplicateurs proposés

Ces multiplicateurs sont **calculés** pour garantir un house edge fixe à chaque
étage, avec la formule : `mult(n) = (1 - edge) / p^n`
où `p = coffres / portes` (probabilité de survie par étage).

Tous les modes sont sur **6 étages**.

### Mode Safe — edge 2% (p = 2/3, RTP 98%)

```txt
Étage 1 : x1.47
Étage 2 : x2.21
Étage 3 : x3.31
Étage 4 : x4.96
Étage 5 : x7.44
Étage 6 : x11.16
```

### Mode Risk — edge 4% (p = 1/2, RTP 96%)

```txt
Étage 1 : x1.92
Étage 2 : x3.84
Étage 3 : x7.68
Étage 4 : x15.36
Étage 5 : x30.72
Étage 6 : x61.44
```

### Mode Insane — edge 6% (p = 2/5, RTP 94%)

```txt
Étage 1 : x2.35
Étage 2 : x5.87
Étage 3 : x14.69
Étage 4 : x36.72
Étage 5 : x91.80
Étage 6 : x229.49
```

### Probabilité d'atteindre chaque étage (pour info)

```txt
            Safe      Risk      Insane
Étage 1     66.7%     50.0%     40.0%
Étage 2     44.4%     25.0%     16.0%
Étage 3     29.6%     12.5%      6.4%
Étage 4     19.8%      6.3%      2.6%
Étage 5     13.2%      3.1%      1.0%
Étage 6      8.8%      1.6%      0.4%
```

---

## 7. Structure mobile-first

### Écran Home

```txt
VAULT RUSH

Balance : 1000 coins

[ Jouer ]

Derniers gains :
- Player1 : x4.00
- Player2 : x9.00
- Player3 : x2.80
```

### Écran choix de mise

```txt
Choisis ta mise

[ - ] 10 coins [ + ]

Boutons rapides :
[ 1 ] [ 5 ] [ 10 ] [ 25 ] [ 50 ] [ 100 ]

Mode :
[ Safe ] [ Risk ] [ Insane ]

[ Lancer le braquage ]
```

### Écran de jeu

```txt
Étage 4

Multiplicateur actuel :
x2.80

Gain potentiel :
28 coins

[ Porte 1 ]
[ Porte 2 ]
[ Porte 3 ]

[ CASH OUT ]
```

### Écran résultat gagné

```txt
Braquage réussi !

Mise : 10 coins
Multiplicateur : x2.80
Gain : 28 coins

[ Rejouer ]
[ Retour accueil ]
```

### Écran résultat perdu

```txt
ALARME ACTIVÉE

Mise perdue : 10 coins
Gain : 0 coin

[ Rejouer ]
[ Retour accueil ]
```

---

## 8. Adaptation PC

Sur PC, on garde le même jeu mais avec une disposition horizontale.

```txt
--------------------------------------------------
| Balance / Mise / Mode |      Zone de jeu       |
|                       |                         |
| Balance : 1000        |      Étage 4           |
| Mise : 10             |      x2.80             |
| Mode : Safe           |                         |
|                       | [Porte] [Porte] [Porte] |
| Historique            |                         |
|                       |      [Cash Out]        |
--------------------------------------------------
```

Mobile :

- layout vertical ;
- gros boutons ;
- une colonne ;
- actions rapides.

PC :

- layout en deux colonnes ;
- historique visible ;
- statistiques sur le côté ;
- zone de jeu au centre.

---

## 9. Architecture technique

Stack simple recommandée :

```txt
Frontend : React ou Next.js
Backend : Node.js + Express
Database : MySQL ou PostgreSQL
Auth : pseudo simple au début
Mode : monnaie virtuelle
```

Structure possible :

```txt
vault-rush/
│
├── client/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Home.tsx
│   │   │   ├── Game.tsx
│   │   │   └── History.tsx
│   │   │
│   │   ├── components/
│   │   │   ├── BetSelector.tsx
│   │   │   ├── ModeSelector.tsx
│   │   │   ├── DoorCard.tsx
│   │   │   ├── CashOutButton.tsx
│   │   │   ├── GameHeader.tsx
│   │   │   └── ResultModal.tsx
│   │   │
│   │   ├── hooks/
│   │   │   └── useGame.ts
│   │   │
│   │   └── styles/
│
├── server/
│   ├── src/
│   │   ├── modules/
│   │   │   ├── game/
│   │   │   │   ├── game.controller.ts
│   │   │   │   ├── game.service.ts
│   │   │   │   └── game.algorithm.ts
│   │   │   │
│   │   │   ├── user/
│   │   │   │   ├── user.controller.ts
│   │   │   │   └── user.repository.ts
│   │   │   │
│   │   │   └── wallet/
│   │   │       ├── wallet.service.ts
│   │   │       └── wallet.repository.ts
│   │   │
│   │   ├── database/
│   │   ├── router.ts
│   │   └── app.ts
```

---

## 10. Base de données

### Table `user`

```sql
CREATE TABLE user (
  id INT PRIMARY KEY AUTO_INCREMENT,
  username VARCHAR(100) NOT NULL,
  balance DECIMAL(10,2) DEFAULT 1000,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Table `game_round`

```sql
CREATE TABLE game_round (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL,
  bet_amount DECIMAL(10,2) NOT NULL,
  mode VARCHAR(50) NOT NULL,
  current_floor INT DEFAULT 0,
  multiplier DECIMAL(10,2) DEFAULT 1.00,
  status VARCHAR(50) DEFAULT 'playing',
  result VARCHAR(50),
  payout DECIMAL(10,2) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Table `game_step`

```sql
CREATE TABLE game_step (
  id INT PRIMARY KEY AUTO_INCREMENT,
  round_id INT NOT NULL,
  floor_number INT NOT NULL,
  selected_door INT NOT NULL,
  result VARCHAR(50) NOT NULL,
  multiplier DECIMAL(10,2) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Table `transaction`

```sql
CREATE TABLE transaction (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL,
  round_id INT,
  type VARCHAR(50) NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  balance_after DECIMAL(10,2) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

Types possibles pour `transaction.type` :

```txt
bet
win
loss
bonus
refund
```

---

## 11. API backend

### Créer une partie

```http
POST /api/game/start
```

Body :

```json
{
  "userId": 1,
  "betAmount": 10,
  "mode": "safe"
}
```

Réponse :

```json
{
  "roundId": 123,
  "balance": 990,
  "currentFloor": 0,
  "multiplier": 1,
  "status": "playing"
}
```

---

### Jouer une porte

```http
POST /api/game/play
```

Body :

```json
{
  "roundId": 123,
  "selectedDoor": 2
}
```

Réponse si coffre :

```json
{
  "status": "playing",
  "result": "safe",
  "currentFloor": 1,
  "multiplier": 1.2,
  "potentialWin": 12
}
```

Réponse si alarme :

```json
{
  "status": "lost",
  "result": "alarm",
  "payout": 0
}
```

---

### Cash-out

```http
POST /api/game/cashout
```

Body :

```json
{
  "roundId": 123
}
```

Réponse :

```json
{
  "status": "cashed_out",
  "payout": 28,
  "newBalance": 1018
}
```

---

### Récupérer l'historique

```http
GET /api/game/history/:userId
```

Réponse :

```json
[
  {
    "id": 123,
    "betAmount": 10,
    "mode": "safe",
    "result": "cashed_out",
    "payout": 28,
    "createdAt": "2026-06-26T18:00:00.000Z"
  }
]
```

---

## 12. Algorithme du jeu

### Configuration des modes

```ts
type GameMode = "safe" | "risk" | "insane";

const GAME_MODES = {
  safe: {
    doors: 3,
    safeDoors: 2,
    alarmDoors: 1,
    maxFloor: 6,
    houseEdge: 0.02,
    multipliers: [1.47, 2.21, 3.31, 4.96, 7.44, 11.16],
  },
  risk: {
    doors: 4,
    safeDoors: 2,
    alarmDoors: 2,
    maxFloor: 6,
    houseEdge: 0.04,
    multipliers: [1.92, 3.84, 7.68, 15.36, 30.72, 61.44],
  },
  insane: {
    doors: 5,
    safeDoors: 2,
    alarmDoors: 3,
    maxFloor: 6,
    houseEdge: 0.06,
    multipliers: [2.35, 5.87, 14.69, 36.72, 91.8, 229.49],
  },
};
```

### Générer les multiplicateurs par formule (recommandé)

Plutôt que de coder les valeurs en dur, on peut les calculer. Ça permet de
changer l'edge ou le nombre d'étages sans recalculer à la main :

```ts
function buildMultipliers(
  safeDoors: number,
  totalDoors: number,
  edge: number,
  maxFloor: number,
): number[] {
  const p = safeDoors / totalDoors;
  return Array.from({ length: maxFloor }, (_, i) =>
    Number(((1 - edge) / Math.pow(p, i + 1)).toFixed(2)),
  );
}

// buildMultipliers(2, 3, 0.02, 6) -> [1.47, 2.21, 3.31, 4.96, 7.44, 11.16]
```

---

### Mélanger un tableau

```ts
function shuffleArray<T>(array: T[]): T[] {
  const copy = [...array];

  for (let i = copy.length - 1; i > 0; i--) {
    const randomIndex = Math.floor(Math.random() * (i + 1));

    [copy[i], copy[randomIndex]] = [copy[randomIndex], copy[i]];
  }

  return copy;
}
```

---

### Générer les portes

```ts
function generateDoors(mode: GameMode): string[] {
  const config = GAME_MODES[mode];

  const doors: string[] = [];

  for (let i = 0; i < config.safeDoors; i++) {
    doors.push("safe");
  }

  for (let i = 0; i < config.alarmDoors; i++) {
    doors.push("alarm");
  }

  return shuffleArray(doors);
}
```

---

### Récupérer le multiplicateur

```ts
function getMultiplier(mode: GameMode, floor: number): number {
  const config = GAME_MODES[mode];

  const multiplier = config.multipliers[floor - 1];

  if (!multiplier) {
    throw new Error("Invalid floor");
  }

  return multiplier;
}
```

---

### Jouer un étage

```ts
function playFloor(
  mode: GameMode,
  selectedDoorIndex: number,
  currentFloor: number,
) {
  const config = GAME_MODES[mode];

  if (selectedDoorIndex < 0 || selectedDoorIndex >= config.doors) {
    throw new Error("Invalid door selected");
  }

  if (currentFloor >= config.maxFloor) {
    throw new Error("Max floor already reached");
  }

  const doors = generateDoors(mode);

  const selectedResult = doors[selectedDoorIndex];

  if (selectedResult === "alarm") {
    return {
      status: "lost",
      result: "alarm",
      nextFloor: currentFloor,
      multiplier: 0,
      doors,
    };
  }

  const nextFloor = currentFloor + 1;
  const multiplier = getMultiplier(mode, nextFloor);

  return {
    status: "playing",
    result: "safe",
    nextFloor,
    multiplier,
    doors,
  };
}
```

---

### Calculer le cash-out

```ts
function calculateCashOut(betAmount: number, multiplier: number): number {
  const payout = betAmount * multiplier;

  return Number(payout.toFixed(2));
}
```

---

### Exemple complet en TypeScript

```ts
type RoundStatus = "playing" | "lost" | "cashed_out";

type GameRound = {
  id: number;
  userId: number;
  betAmount: number;
  mode: GameMode;
  currentFloor: number;
  multiplier: number;
  status: RoundStatus;
  payout: number;
};

function startRound(userId: number, betAmount: number, mode: GameMode): GameRound {
  if (betAmount <= 0) {
    throw new Error("Bet amount must be greater than 0");
  }

  return {
    id: Date.now(),
    userId,
    betAmount,
    mode,
    currentFloor: 0,
    multiplier: 1,
    status: "playing",
    payout: 0,
  };
}

function handlePlay(round: GameRound, selectedDoorIndex: number): GameRound {
  if (round.status !== "playing") {
    throw new Error("Round is not active");
  }

  const result = playFloor(round.mode, selectedDoorIndex, round.currentFloor);

  if (result.status === "lost") {
    return {
      ...round,
      status: "lost",
      payout: 0,
    };
  }

  return {
    ...round,
    currentFloor: result.nextFloor,
    multiplier: result.multiplier,
  };
}

function handleCashOut(round: GameRound): GameRound {
  if (round.status !== "playing") {
    throw new Error("Round is not active");
  }

  if (round.currentFloor === 0) {
    throw new Error("Cannot cash out before first successful floor");
  }

  const payout = calculateCashOut(round.betAmount, round.multiplier);

  return {
    ...round,
    status: "cashed_out",
    payout,
  };
}
```

---

## 13. Logique backend importante

Le backend doit gérer :

- la vérification du solde ;
- le retrait de la mise ;
- la génération du résultat ;
- la mise à jour de l'étage ;
- la mise à jour du multiplicateur ;
- le cash-out ;
- l'ajout des gains au solde ;
- l'historique des parties.

Le frontend ne doit jamais décider :

- si le joueur gagne ;
- si le joueur perd ;
- combien il gagne ;
- quel est son vrai solde.

---

## 14. Sécurité anti-triche

À faire côté serveur :

```txt
- Vérifier que la partie existe.
- Vérifier que la partie appartient bien au joueur.
- Vérifier que la partie est encore en statut "playing".
- Empêcher de rejouer une porte après une perte.
- Empêcher de cash-out après une perte.
- Empêcher de cash-out deux fois.
- Empêcher une mise supérieure au solde.
- Empêcher une mise négative.
- Empêcher une porte inexistante.
- Ne jamais faire confiance au frontend.
```

---

## 15. Design mobile

### Couleurs

```txt
Background : #080B16
Card : #111827
Accent principal : #FACC15
Accent secondaire : #22D3EE
Danger : #EF4444
Texte : #F9FAFB
Texte secondaire : #9CA3AF
```

### Style visuel

```txt
Thème : braquage / coffre-fort / néon
Boutons : gros, arrondis, faciles à cliquer
Portes : grandes cartes verticales
Animations : rapides
Feedback : clair et immédiat
```

### Animations

```txt
Porte coffre :
- porte qui s'ouvre
- lumière dorée
- son de coffre
- multiplicateur qui pulse

Porte alarme :
- flash rouge
- vibration mobile
- sirène
- écran résultat perdu

Cash-out :
- pièces qui tombent
- gain qui monte
- bouton doré
```

---

## 16. Composants frontend

### `BetSelector`

Responsabilités :

- choisir une mise ;
- augmenter / diminuer la mise ;
- boutons rapides ;
- vérifier visuellement si la mise est possible.

### `ModeSelector`

Responsabilités :

- choisir Safe, Risk ou Insane ;
- afficher le niveau de risque ;
- afficher le nombre de portes.

### `DoorCard`

Responsabilités :

- afficher une porte fermée ;
- gérer le clic ;
- montrer l'animation d'ouverture ;
- afficher coffre ou alarme après réponse serveur.

### `GameHeader`

Responsabilités :

- afficher l'étage actuel ;
- afficher le multiplicateur ;
- afficher le gain potentiel ;
- afficher la balance.

### `CashOutButton`

Responsabilités :

- afficher le gain récupérable ;
- désactiver le bouton si étage 0 ;
- envoyer la requête cash-out.

### `ResultModal`

Responsabilités :

- afficher gagné ou perdu ;
- afficher mise, multiplicateur, gain ;
- bouton rejouer ;
- bouton retour accueil.

---

## 17. États frontend

Exemple d'état React :

```ts
type GameState = {
  roundId: number | null;
  balance: number;
  betAmount: number;
  mode: "safe" | "risk" | "insane";
  currentFloor: number;
  multiplier: number;
  potentialWin: number;
  status: "idle" | "playing" | "lost" | "cashed_out";
  isLoading: boolean;
  lastResult: "safe" | "alarm" | null;
};
```

---

## 18. Hook `useGame`

Fonctions principales :

```ts
function useGame() {
  return {
    gameState,
    setBetAmount,
    setMode,
    startGame,
    selectDoor,
    cashOut,
    resetGame,
  };
}
```

---

## 19. Bonus à ajouter plus tard

### Bonus Scanner

Révèle une porte dangereuse à l'étage suivant.

```txt
Effet :
Une porte avec alarme est affichée en rouge avant le choix.
```

### Bonus Shield

Protège une fois contre une alarme.

```txt
Effet :
Si le joueur tombe sur une alarme, il ne perd pas.
Le shield disparaît.
```

### Bonus Double Vault

Augmente le prochain multiplicateur.

```txt
Effet :
Le prochain étage donne un bonus de multiplicateur.
```

### Bonus Golden Door

Ajoute une porte spéciale.

```txt
Effet :
Si le joueur choisit la Golden Door, il gagne un multiplicateur bonus.
```

---

## 20. Roadmap de développement

### Version 1 — MVP jouable

```txt
- Création du frontend mobile-first
- Page Home
- Page Game
- Choix de mise
- Choix du mode
- Portes cliquables
- Backend start game
- Backend play floor
- Backend cash-out
- Balance fictive
- Historique simple
```

### Version 2 — UI propre

```txt
- Design coffre-fort
- Animations portes
- Animation alarme
- Animation gain
- Responsive PC
- Historique des derniers gains
```

### Version 3 — Compte joueur

```txt
- Création de compte
- Connexion
- Sauvegarde de balance
- Historique par joueur
- Leaderboard
```

### Version 4 — Bonus

```txt
- Scanner
- Shield
- Double Vault
- Golden Door
- Missions journalières
```

### Version 5 — Qualité production

```txt
- Logs serveur
- Tests unitaires
- Anti-spam requêtes
- Protection API
- Validation des données
- Gestion des erreurs
- Dashboard admin
```

---

## 21. Priorité de développement

Ordre conseillé :

```txt
1. Créer les maquettes mobile.
2. Créer le composant DoorCard.
3. Créer l'état de jeu côté frontend.
4. Créer le backend start game.
5. Créer le backend play floor.
6. Créer le backend cash-out.
7. Brancher frontend et backend.
8. Ajouter la balance.
9. Ajouter l'historique.
10. Ajouter le responsive PC.
11. Ajouter les animations.
12. Ajouter les bonus.
```

---

## 22. Résumé du projet

**Vault Rush** est un jeu casino arcade mobile-first basé sur une mécanique simple :

```txt
Miser
Choisir une porte
Trouver un coffre
Monter les étages
Faire Cash Out
Éviter l'alarme
```

Le jeu doit être :

- rapide ;
- simple ;
- visuel ;
- jouable sur mobile ;
- sécurisé côté backend ;
- basé sur une monnaie virtuelle dans la première version.

L'objectif du MVP est de créer une expérience fluide, fun et addictive sans complexifier le concept dès le départ.
