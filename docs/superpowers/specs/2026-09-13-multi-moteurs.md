# Vault Rush Arcade — socle multi-moteurs et trois jeux d'un autre genre (spec, 13/09/2026)

Lucas, 13/09/2026 : « crée les jeux ; une fois finis tu peux passer au nouveau moteur pour créer les autres jeux ».

Les quatre premiers jeux (Vault Rush, Laser Grid, Getaway, Bomb Squad) sont le **même** jeu d'échelle avec d'autres décors. Les suivants ne le sont pas : deviner un code, laisser tomber une bille, jouer au blackjack. Il faut donc un socle qui accueille plusieurs mécaniques sans dupliquer la comptabilité.

## 1. Principe

Ce qui est **commun à tout jeu d'argent fictif** reste écrit une seule fois : valider la mise, débiter dans une transaction, n'avoir qu'une partie active par joueur et par jeu, reprendre après rechargement, refuser un coup déjà joué, créditer le gain plafonné, journaliser, alimenter historique et classement.

Ce qui est **propre à un jeu** tient dans un objet `GameEngine` : ses modes, son état, la façon dont un coup fait avancer la partie, et ce que le joueur a le droit de voir.

## 2. Contrat serveur

```ts
type Rng = { int(maxExclusive: number): number };          // enveloppe de crypto.randomInt, injectable

type EngineResult<S> = {
  state: S;                                   // nouvel état secret
  step: number;                               // numéro du prochain coup attendu
  multiplier: number;                         // multiplicateur acquis à cet instant
  status: "playing" | "lost" | "cashed_out";
  reveal?: unknown;                           // ce que ce coup a montré (portes, indices, cartes)
};

interface GameEngine<S, A> {
  readonly id: GameId;
  readonly kind: "ladder" | "code" | "drop" | "cards";
  readonly name: string;
  readonly tagline: string;
  readonly canCashout: boolean;               // seul le ladder laisse encaisser en cours de partie
  readonly actionSchema: ZodType<A>;          // valide le corps d'un coup (400 sinon)
  config(): GameConfigDTO;                    // tout ce qu'il faut afficher AVANT de miser
  start(modeId: string, rng: Rng): S;
  view(state: S): unknown;                    // jamais le secret
  act(state: S, action: A, rng: Rng): EngineResult<S>;
  cashout?(state: S): EngineResult<S>;
}
```

- `GAMES` devient un registre de moteurs ; `engine/ladder.ts` en fournit un par jeu d'échelle (les quatre existants gardent exactement leurs paramètres et leurs multiplicateurs).
- **Aucune route nouvelle.** `POST /api/games/:game/play` reste la route d'un coup ; son corps est `{ roundId, step }` plus les champs du jeu, validés par `actionSchema` (ladder `{ option }`, Vault Code `{ guess }`, Diamond Drop `{}`, Blackjack `{ move }`). `POST …/cashout` répond 400 `cashout_not_allowed` quand `canCashout` est faux.
- `GET /api/games/:game/config` gagne `kind` et `canCashout` ; le reste de sa forme ne change pas pour les jeux d'échelle.
- La réponse d'une partie gagne `view` (l'état public du jeu). Les champs existants (`step`, `multiplier`, `cashoutCents`, `status`…) restent, pour que le client des jeux d'échelle ne bouge pas.

## 3. Base

Migration `0003_state_json.sql` : `ALTER TABLE rounds ADD COLUMN state_json TEXT` (SQLite accepte l'ajout de colonne sans reconstruire la table ; migration idempotente comme les autres). L'état secret y est sérialisé en JSON. Aucune autre colonne ne change : historique et classement continuent de lire `game`, `mode`, `bet_cents`, `payout_cents`, `status`, `step`, `multiplier`.

Le secret ne sort jamais du serveur : le service ne renvoie que `engine.view(state)`. Un test le vérifie pour chaque jeu (le code du coffre, la carte cachée du croupier et le chemin de la bille ne doivent jamais apparaître dans une réponse tant que la partie n'est pas finie).

## 4. Les trois jeux

### 4.1 Vault Code (`kind: "code"`)

Trouver une combinaison de chiffres **tous différents**, en un nombre d'essais limité. Après chaque essai : combien de chiffres sont **bien placés** (« verrous ») et combien sont **présents mais mal placés** (« échos »). Pas d'encaissement en cours : on trouve ou on perd.

| Mode | Chiffres | Essais |
|---|---|---|
| `initie` « Initié » | 3 | 5 |
| `perceur` « Perceur » | 4 | 5 |
| `maitre` « Maître » | 5 | 6 |

Le gain dépend du nombre d'essais utilisés : plus tôt le code est trouvé, plus le multiplicateur est élevé. **La table de gains n'est pas inventée : elle est calibrée par mesure.** Un solveur de référence (choisir au hasard une combinaison compatible avec tous les indices déjà obtenus — l'approximation raisonnable d'un joueur attentif) joue 20 000 parties par mode ; on en tire la distribution du nombre d'essais, puis la table qui donne un retour de **0,94** (6 % pour la maison) à ce joueur de référence. La mesure est rejouée en test avec une graine fixe et un intervalle de tolérance dérivé de l'écart-type, et la table figée est celle du rapport.

Les règles affichent la table, le nombre d'essais et cette phrase : le gain dépend du nombre d'essais utilisés, un joueur moins méthodique gagne moins.

### 4.2 Diamond Drop (`kind: "drop"`)

Une bille lâchée au sommet d'un plateau de clous ; à chaque rangée elle part à gauche ou à droite avec la même chance ; elle finit dans une case qui porte un multiplicateur. Une seule action par partie (« lâcher »), pas d'encaissement.

| Mode | Rangées | Volatilité (α) | Bord |
|---|---|---|---|
| `doux` « Doux » | 8 | 0,6 | 2 % |
| `nerveux` « Nerveux » | 12 | 0,8 | 4 % |
| `fou` « Fou » | 16 | 1,0 | 6 % |

Calcul **exact**, pas de simulation : `P(k) = C(R,k) / 2^R`, forme `f(k) = P(k)^(−α)`, puis `mult(k) = (1−bord) · f(k) / Σ P(i)·f(i)`, arrondi à deux décimales **vers le bas** pour que l'arrondi ne rende jamais le jeu favorable au joueur. Test : le retour exact `Σ P(k)·mult(k)` tombe dans `[1−bord−0,01 ; 1−bord]`, et le multiplicateur central est le plus faible du plateau. Plafond de gain commun : 10 000 coins.

Le chemin de la bille est tiré au démarrage (côté serveur, `crypto.randomInt`), gardé secret jusqu'au lâcher, puis renvoyé rangée par rangée pour l'animation, avec la case d'arrivée et son multiplicateur.

### 4.3 Blackjack Express (`kind: "cards"`)

Blackjack court contre le croupier, un jeu de 52 cartes mélangé à chaque manche (donc aucun comptage possible).

- Le joueur reçoit deux cartes, le croupier une visible et une cachée.
- Actions : `hit` (tirer) ou `stand` (rester). Pas de split, pas de double, pas d'assurance.
- Le croupier tire jusqu'à 17 inclus et reste à 17 (y compris 17 « souple »).
- Blackjack naturel : ×2,5. Victoire : ×2. Égalité : ×1. Défaite : ×0. Dépassement du joueur : perdu immédiatement.
- Un seul mode, `express` « Express » (le hasard des cartes fixe déjà le bord ; on ne le truque pas).

Le retour au joueur n'est pas décrété : il est **mesuré** par simulation d'une stratégie de base codée dans les tests (20 000 mains, graine fixe) et le rapport annonce la valeur obtenue. Attendu autour de 97 à 98 %. Si la mesure sortait au-dessus de 100 %, c'est une erreur de règles à corriger, pas un jeu à publier.

Les règles affichent la valeur des cartes, la règle du croupier et les gains.

## 5. Client

- `kind` choisit l'écran : `ladder` garde l'écran actuel et son plateau ; `code`, `drop` et `cards` ont chacun leur écran, construits avec les composants communs (mise, bilan, Toast, Button, jetons).
- Le socle commun du client est extrait de `useLadderGame` : `useRound` (démarrage, reprise par `current`, adoption d'un 409, coup en cours, fin, erreurs en français) ; `useLadderGame` en devient une spécialisation. Comportement inchangé pour les jeux existants, tests existants verts sans modification.
- Chaque nouveau jeu a son identité, comme les quatre premiers : Vault Code un pavé numérique et un tableau d'essais avec ses verrous et ses échos ; Diamond Drop un plateau de clous avec la bille qui tombe rangée par rangée ; Blackjack Express des cartes qui se posent. Accents : Vault Code **vert**, Diamond Drop **cyan clair**, Blackjack **jaune** (à confirmer contre les jetons existants, contraste AA vérifié).
- Arcade : sept tuiles, groupées par genre (« Monte et encaisse », « Réflexion », « Hasard pur », « Cartes »).

## 6. Hors périmètre

Safecracker (jeu d'adresse : la mesure du geste se ferait côté client, donc trichable ; à faire seulement hors classement) et Heist Crew (narratif, gros morceau). Progression commune, bonus, saisons : toujours après.

## 7. Ordre

1. Socle multi-moteurs (aucun jeu nouveau, comportement inchangé, tests existants verts).
2. Vault Code · 3. Diamond Drop · 4. Blackjack Express (en parallèle, chacun sur sa branche).
5. Revue d'ensemble, arcade à sept tuiles, README, PR.
