import { randomInt } from "node:crypto";
import { z } from "zod";
import { MAX_BET_CENTS, MAX_PAYOUT_CENTS, MIN_BET_CENTS, payoutFor } from "../money.ts";
import {
  EngineError,
  type EngineResult,
  type GameEngine,
  type GameId,
  type LegacyRound,
  type Rng,
} from "./types.ts";

/**
 * Moteur « jeu d'échelle ».
 *
 * Un jeu = des étapes (étages, lignes…) ; à chaque étape le joueur choisit une
 * option parmi N, dont S sont sûres. Réussir monte d'une marche et augmente le
 * multiplicateur ; se tromper termine la partie. Vault Rush et Laser Grid ne
 * sont que deux jeux de paramètres : tout ce qui décide gagné/perdu/combien
 * vit ICI, côté serveur, et nulle part ailleurs.
 *
 * Ce fichier est pur (aucune base, aucun HTTP) hormis le tirage, qui est le
 * seul endroit où le hasard entre — et qui est injectable pour les tests.
 */

export type Outcome = "safe" | "danger";

export type ModeDefinition = {
  id: string;
  label: string;
  /** Nombre d'options proposées à chaque étape. */
  options: number;
  /** Nombre d'options sûres parmi elles. */
  safeOptions: number;
  /** Avantage de la maison (0,02 = 2 %). */
  houseEdge: number;
};

export type GameLabels = {
  step: string;
  option: string;
  safe: string;
  danger: string;
  cashout: string;
};

export type GameDefinition<Id extends string = string> = {
  id: Id;
  name: string;
  tagline: string;
  /** Nombre d'étapes à franchir avant l'encaissement automatique. */
  steps: number;
  /** Le format annoncé dans l'arcade, écrit à la main : « 6 étages ». */
  format: string;
  labels: GameLabels;
  modes: ModeDefinition[];
};

/** Tirage d'un entier dans [0, max[ ; `crypto.randomInt` par défaut. */
export type RandomInt = (max: number) => number;

/**
 * Tirage d'une étape ; injectable pour neutraliser le hasard en test.
 * Le troisième argument est la source d'aléa du moteur : les tirages truqués
 * des tests l'ignorent, le vrai tirage s'en sert.
 */
export type DrawFn = (options: number, safeOptions: number, random?: RandomInt) => Outcome[];

/** Arrondi au centième, identique à l'ancien `Number(x.toFixed(2))`. */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Multiplicateur par étape : `mult(n) = (1 − edge) / p^n` avec `p = sûres / options`.
 * L'avantage de la maison reste donc le même quelle que soit l'étape visée.
 */
export function buildMultipliers(
  safeOptions: number,
  options: number,
  houseEdge: number,
  steps: number,
): number[] {
  const p = safeOptions / options;
  return Array.from({ length: steps }, (_, i) => round2((1 - houseEdge) / Math.pow(p, i + 1)));
}

/**
 * Tire les options d'une étape : exactement `safeOptions` sûres, mélangées
 * (Fisher-Yates) avec un générateur cryptographique.
 */
export function drawOptions(
  options: number,
  safeOptions: number,
  random: RandomInt = randomInt,
): Outcome[] {
  const draw: Outcome[] = Array.from({ length: options }, (_, i) =>
    i < safeOptions ? "safe" : "danger",
  );
  for (let i = draw.length - 1; i > 0; i--) {
    const j = random(i + 1);
    [draw[i], draw[j]] = [draw[j], draw[i]];
  }
  return draw;
}

// Les multiplicateurs d'un mode ne changent jamais : on ne les recalcule pas
// à chaque étape jouée (le moteur reste pur, c'est un simple souvenir).
const multipliersCache = new WeakMap<ModeDefinition, Map<number, number[]>>();

/** Multiplicateurs d'un mode pour un jeu de `steps` étapes (mémorisés). */
export function multipliersOf(mode: ModeDefinition, steps: number): number[] {
  let parSteps = multipliersCache.get(mode);
  if (!parSteps) {
    parSteps = new Map();
    multipliersCache.set(mode, parSteps);
  }
  let mults = parSteps.get(steps);
  if (!mults) {
    mults = buildMultipliers(mode.safeOptions, mode.options, mode.houseEdge, steps);
    parSteps.set(steps, mults);
  }
  return mults;
}

/** Le mode demandé, ou `undefined` : chaque jeu a ses propres modes. */
export function findMode(def: GameDefinition, modeId: string): ModeDefinition | undefined {
  return def.modes.find((mode) => mode.id === modeId);
}

/** Multiplicateur atteint après `step` étapes réussies (1 avant la première). */
export function multiplierAt(mode: ModeDefinition, steps: number, step: number): number {
  if (step === 0) return 1;
  if (step < 0 || step > steps) throw new Error(`étape ${step} hors du jeu (${steps} étapes)`);
  return multipliersOf(mode, steps)[step - 1];
}

export type StepResult = {
  outcome: Outcome;
  /** Étape atteinte après le coup (inchangée si le joueur a perdu). */
  nextStep: number;
  /** Multiplicateur de la nouvelle étape, 0 si la partie est perdue. */
  multiplier: number;
  revealed: Outcome[];
};

/** Joue une étape : le tirage tombe ici, une seule fois, côté serveur. */
export function playStep(
  def: GameDefinition,
  mode: ModeDefinition,
  step: number,
  option: number,
  draw: DrawFn = drawOptions,
): StepResult {
  const revealed = draw(mode.options, mode.safeOptions);
  if (revealed[option] === "danger") {
    return { outcome: "danger", nextStep: step, multiplier: 0, revealed };
  }
  const nextStep = step + 1;
  return {
    outcome: "safe",
    nextStep,
    multiplier: multiplierAt(mode, def.steps, nextStep),
    revealed,
  };
}

/** Gain d'un encaissement : arrondi au centime, puis plafonné. */
export function cashoutCents(betCents: number, multiplier: number): number {
  return payoutFor(betCents, multiplier);
}

export type ModeConfig = {
  id: string;
  label: string;
  options: number;
  safeOptions: number;
  houseEdge: number;
  /** Probabilité de réussir une étape. */
  chancePerStep: number;
  multipliers: number[];
};

export type GameConfig = {
  id: string;
  /** Toujours « ladder » ici : ce fichier ne fabrique que des jeux d'échelle. */
  kind: "ladder";
  name: string;
  /** Toujours vrai : un jeu d'échelle laisse encaisser à chaque étape. */
  canCashout: true;
  tagline: string;
  steps: number;
  format: string;
  labels: GameLabels;
  maxPayoutCents: number;
  minBetCents: number;
  maxBetCents: number;
  modes: ModeConfig[];
};

/** Tout ce que le client doit savoir d'un jeu pour l'afficher et le jouer. */
export function configFor(def: GameDefinition): GameConfig {
  return {
    id: def.id,
    kind: "ladder",
    canCashout: true,
    name: def.name,
    tagline: def.tagline,
    steps: def.steps,
    format: def.format,
    labels: def.labels,
    maxPayoutCents: MAX_PAYOUT_CENTS,
    minBetCents: MIN_BET_CENTS,
    maxBetCents: MAX_BET_CENTS,
    modes: def.modes.map((mode) => ({
      id: mode.id,
      label: mode.label,
      options: mode.options,
      safeOptions: mode.safeOptions,
      houseEdge: mode.houseEdge,
      chancePerStep: mode.safeOptions / mode.options,
      multipliers: [...multipliersOf(mode, def.steps)],
    })),
  };
}

/* ------------------------- Le moteur, façon GameEngine ------------------------- */

/**
 * L'état secret d'une partie d'échelle. Il n'a rien de secret, justement : le
 * tirage n'a lieu qu'au moment du coup, il n'y a donc rien à cacher d'avance.
 * `mode` en fait partie pour que `act` se suffise à lui-même.
 */
export type LadderState = {
  mode: string;
  step: number;
  multiplier: number;
  /** Les options du DERNIER coup joué (déjà montrées au joueur). */
  revealed?: Outcome[];
};

export type LadderAction = { option: number };

/** `{ option }` : le champ propre au jeu d'échelle, en plus de `{ roundId, step }`. */
export const ladderActionSchema = z.object({ option: z.number().int() });

/**
 * Fabrique le moteur d'un jeu d'échelle. `draw` est le tirage : le vrai par
 * défaut, truqué dans les tests — c'est le seul endroit où le hasard entre.
 */
export function createLadderEngine(
  def: GameDefinition<GameId>,
  draw: DrawFn = drawOptions,
): GameEngine<LadderState, LadderAction> {
  /** Le mode de la partie, ou le refus : une partie héritée peut porter un mode inconnu. */
  function modeOf(state: LadderState): ModeDefinition {
    const mode = findMode(def, state.mode);
    if (!mode) {
      throw new EngineError(400, "unknown_mode", { modes: def.modes.map((m) => m.id) });
    }
    return mode;
  }

  return {
    id: def.id,
    kind: "ladder",
    name: def.name,
    tagline: def.tagline,
    canCashout: true,
    actionSchema: ladderActionSchema,

    config: () => configFor(def),

    start: (modeId: string) => ({ mode: modeId, step: 0, multiplier: 1 }),

    view: (state: LadderState) => ({
      step: state.step,
      multiplier: state.multiplier,
      revealed: state.revealed ?? null,
    }),

    act(state: LadderState, action: LadderAction, rng: Rng): EngineResult<LadderState> {
      const mode = modeOf(state);
      if (action.option < 0 || action.option >= mode.options) {
        throw new EngineError(400, "invalid_option", { options: mode.options });
      }

      const result = playStep(def, mode, state.step, action.option, (options, safeOptions) =>
        draw(options, safeOptions, (max) => rng.int(max)),
      );

      if (result.outcome === "danger") {
        // La partie s'arrête : l'étape et le multiplicateur ACQUIS ne bougent plus.
        return {
          state: { ...state, revealed: result.revealed },
          step: state.step,
          multiplier: state.multiplier,
          status: "lost",
          reveal: { revealed: result.revealed, outcome: result.outcome },
        };
      }

      const next: LadderState = {
        ...state,
        step: result.nextStep,
        multiplier: result.multiplier,
        revealed: result.revealed,
      };
      return {
        state: next,
        step: next.step,
        multiplier: next.multiplier,
        // Dernière étape franchie : la partie s'encaisse toute seule.
        status: next.step >= def.steps ? "cashed_out" : "playing",
        reveal: { revealed: result.revealed, outcome: result.outcome },
      };
    },

    cashout(state: LadderState): EngineResult<LadderState> {
      if (state.step === 0) throw new EngineError(409, "nothing_to_cashout");
      return {
        state,
        step: state.step,
        multiplier: state.multiplier,
        status: "cashed_out",
      };
    },

    nextMultiplier(state: LadderState): number | null {
      const mode = findMode(def, state.mode);
      if (!mode || state.step >= def.steps) return null;
      return multiplierAt(mode, def.steps, state.step + 1);
    },

    restore: (round: LegacyRound): LadderState => ({
      mode: round.mode,
      step: round.step,
      multiplier: round.multiplier,
    }),
  };
}
