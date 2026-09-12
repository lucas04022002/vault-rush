import { randomInt } from "node:crypto";
import { MAX_BET_CENTS, MAX_PAYOUT_CENTS, MIN_BET_CENTS } from "../money.ts";

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
  labels: GameLabels;
  modes: ModeDefinition[];
};

/** Tirage d'un entier dans [0, max[ ; `crypto.randomInt` par défaut. */
export type RandomInt = (max: number) => number;

/** Tirage d'une étape ; injectable pour neutraliser le hasard en test. */
export type DrawFn = (options: number, safeOptions: number) => Outcome[];

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
  return Math.min(Math.round(betCents * multiplier), MAX_PAYOUT_CENTS);
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
  name: string;
  tagline: string;
  steps: number;
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
    name: def.name,
    tagline: def.tagline,
    steps: def.steps,
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
