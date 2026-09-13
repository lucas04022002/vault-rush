# Écrire un moteur de jeu (contrat, 13/09/2026)

Le socle est posé : la comptabilité (mise, débit, une seule partie active, reprise,
double clic, crédit plafonné, journal, historique, classement) est écrite **une
fois** dans `server/src/modules/games/games.service.ts`. Un jeu nouveau n'y touche
pas. Il écrit son moteur, l'enregistre, écrit son écran. Rien d'autre.

## 1. Ce qu'on ajoute pour un jeu

| Fichier | Ce qu'on y met |
|---|---|
| `server/src/engine/types.ts` | son identifiant, dans `GAME_IDS` (une entrée) |
| `server/src/engine/<jeu>.ts` | **son moteur** (nouveau fichier) |
| `server/src/engine/registry.ts` | une ligne dans `buildEngines()` |
| `server/tests/<jeu>.test.ts` | ses tests (nouveau fichier) |
| `client/src/games/<Jeu>Screen.tsx` | **son écran** (nouveau fichier) |
| `client/src/games/screens.ts` | une ligne dans `SCREENS` |
| `client/tests/<jeu>.test.tsx` | ses tests d'écran (nouveau fichier) |

Aucune route, aucune migration, aucun changement du service, de `api.ts`, de
`Game.tsx` ni de la base. Deux jeux écrits en parallèle ne se touchent que sur
les trois lignes d'enregistrement (`GAME_IDS`, `buildEngines`, `SCREENS`).

## 2. La signature, mot pour mot

`server/src/engine/types.ts` (ne pas la modifier) :

```ts
export type Rng = { int(maxExclusive: number): number };

export type EngineResult<S> = {
  state: S;          // nouvel état secret, sérialisé dans rounds.state_json
  step: number;      // numéro du prochain coup attendu (colonne step)
  multiplier: number;// multiplicateur acquis à cet instant (colonne multiplier)
  status: "playing" | "lost" | "cashed_out";
  reveal?: unknown;  // ce que CE coup a montré ; ajouté à plat à la réponse de play
};

export interface GameEngine<S = unknown, A = unknown> {
  readonly id: GameId;
  readonly kind: GameKind;                    // "ladder" | "code" | "drop" | "cards"
  readonly name: string;
  readonly tagline: string;
  readonly canCashout: boolean;
  readonly actionSchema: ZodType<A>;
  config(): GameConfigDTO;
  start(modeId: string, rng: Rng): S;
  view(state: S): unknown;
  act(state: S, action: A, rng: Rng): EngineResult<S>;
  cashout?(state: S): EngineResult<S>;
  nextMultiplier?(state: S): number | null;   // seul le ladder en a un
  restore?(round: LegacyRound): S;            // seules les parties d'avant 0003
}
```

`nextMultiplier` et `restore` sont **optionnels et inutiles à un jeu neuf** :
un jeu né après la migration `0003` n'a aucune partie héritée, et seul le jeu
d'échelle a un « multiplicateur de l'étape suivante ».

## 3. Les six règles

1. **L'état vit en base.** `start` le crée, `act` le renvoie, le service le
   sérialise dans `rounds.state_json`. Le client n'en reçoit jamais rien
   d'autre que `view(state)`. L'état doit être du JSON pur (pas de `Map`, pas
   de `Date`, pas de `undefined` porteur de sens).
2. **`view` ne contient JAMAIS le secret** : ni le code du coffre, ni la carte
   cachée du croupier, ni le chemin de la bille tant qu'il n'est pas lâché.
   Règle de relecture : si un joueur curieux lisant la réponse HTTP pouvait en
   déduire l'issue, c'est une fuite. Un test par jeu doit le prouver
   (`server/tests/moteurs.test.ts` montre le patron).
3. **Le hasard ne tombe que dans `start` et `act`**, et seulement par `rng.int`.
   Jamais `Math.random`. Les tests injectent leur `rng` par
   `createApp({ rng })`.
4. **`act` ne touche ni à l'argent ni à la base.** Il lit un état, renvoie un
   état. Le service écrit, débite, crédite, journalise.
5. **Un refus se lève avec `EngineError(status, code, details)`**, jamais avec
   `HttpError` : le moteur ne connaît pas Express. Le service la traduit.
6. **Pas d'encaissement ⇒ `canCashout: false` et pas de méthode `cashout`.**
   `POST /api/games/:jeu/cashout` répond alors 400 `cashout_not_allowed`, sans
   rien écrire.

## 4. Le corps d'un coup

`POST /api/games/:jeu/play` reçoit `{ roundId, step }` **plus les champs du
jeu**. L'enveloppe est validée par le contrôleur, les champs du jeu par
`engine.actionSchema` : ce qui ne passe pas est un 400 `invalid_body`.

- ladder `{ option }` · Vault Code `{ guess }` · Diamond Drop `{}` · Blackjack `{ move }`

Un coup légalement formé mais impossible dans l'état courant (option hors
bornes, essai en trop) est un `EngineError`, pas un `invalid_body`.

## 5. Un moteur minimal, complet

```ts
import { z } from "zod";
import { MAX_BET_CENTS, MAX_PAYOUT_CENTS, MIN_BET_CENTS } from "../money.ts";
import { EngineError, type EngineResult, type GameEngine, type Rng } from "./types.ts";

type PileState = { mode: string; secret: "pile" | "face"; coups: number };
type PileAction = { face: "pile" | "face" };

export function createPileEngine(): GameEngine<PileState, PileAction> {
  return {
    id: "pile-ou-face",
    kind: "code",
    name: "Pile ou face",
    tagline: "Un coup, une chance sur deux.",
    canCashout: false,                       // on trouve ou on perd
    actionSchema: z.object({ face: z.enum(["pile", "face"]) }),

    config: () => ({
      id: "pile-ou-face",
      kind: "code",
      name: "Pile ou face",
      tagline: "Un coup, une chance sur deux.",
      canCashout: false,
      steps: 1,
      maxPayoutCents: MAX_PAYOUT_CENTS,
      minBetCents: MIN_BET_CENTS,
      maxBetCents: MAX_BET_CENTS,
      modes: [{ id: "unique", label: "Unique" }],
    }),

    // Le secret est tiré ICI, côté serveur, et gardé en base.
    start: (modeId: string, rng: Rng) => ({
      mode: modeId,
      secret: rng.int(2) === 0 ? "pile" : "face",
      coups: 0,
    }),

    // Ce qui sort : le nombre de coups. JAMAIS `secret`.
    view: (state) => ({ coups: state.coups }),

    act(state, action): EngineResult<PileState> {
      if (state.coups > 0) throw new EngineError(409, "round_not_active");
      const gagne = action.face === state.secret;
      return {
        state: { ...state, coups: 1 },
        step: 1,
        multiplier: gagne ? 1.96 : 0,
        status: gagne ? "cashed_out" : "lost",
        reveal: { secret: state.secret, gagne },   // le coup est joué : on peut montrer
      };
    },
  };
}
```

Enregistrement (`registry.ts`, une ligne dans `buildEngines`) :

```ts
"pile-ou-face": createPileEngine(),
```

## 6. Ce que le service garantit en retour

La réponse d'une partie (`GET …/current`, `POST …/start`, `POST …/play`,
`POST …/cashout`) porte toujours :

```
round: { id, game, mode, status, step, maxSteps, betCents, multiplier,
         nextMultiplier, cashoutCents, payoutCents, view, createdAt, finishedAt? }
```

`view` est exactement `engine.view(state)`. `POST …/play` ajoute à plat les
champs de `reveal`. `GET …/config` renvoie `engine.config()` tel quel, `kind`
et `canCashout` compris — un jeu peut y ajouter ses propres champs (le jeu
d'échelle y met `labels` et enrichit ses modes), ils partent au client.

Côté client, `config.kind` choisit l'écran (`client/src/games/screens.ts`), et
`useRound(gameId, { config, onReset, finishedMessage })` tient déjà tout le
déroulé d'une partie : démarrage, reprise par `current`, adoption d'un 409,
verrou d'un coup en vol, fin de partie, messages français, solde. Un écran de
jeu n'écrit que sa requête de coup et la lecture de sa réponse — voir
`useLadderGame.ts`, qui tient en soixante lignes.
