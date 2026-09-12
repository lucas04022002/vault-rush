import { randomInt } from "node:crypto";

/**
 * Vault Rush — logique de jeu pure.
 *
 * Règle d'or : tout ce qui décide gagné/perdu/combien vit ICI, côté serveur.
 * Le frontend ne fait qu'afficher le résultat renvoyé par ces fonctions.
 */

export type GameMode = "safe" | "risk" | "insane";

export type ModeConfig = {
  doors: number; // nombre total de portes
  safeDoors: number; // portes "coffre"
  alarmDoors: number; // portes "alarme"
  maxFloor: number; // nombre d'étages
  houseEdge: number; // avantage de la maison (0.02 = 2%)
  multipliers: number[]; // multiplicateur par étage (index 0 = étage 1)
};

/** Plafond de gain par partie (protège l'économie virtuelle des gros pics). */
export const MAX_PAYOUT = 10000;

/**
 * Génère les multiplicateurs pour garantir un house edge constant à chaque étage.
 * Formule : mult(n) = (1 - edge) / p^n   où p = safeDoors / totalDoors.
 */
export function buildMultipliers(
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

function makeMode(
  doors: number,
  safeDoors: number,
  maxFloor: number,
  houseEdge: number,
): ModeConfig {
  const alarmDoors = doors - safeDoors;
  return {
    doors,
    safeDoors,
    alarmDoors,
    maxFloor,
    houseEdge,
    multipliers: buildMultipliers(safeDoors, doors, houseEdge, maxFloor),
  };
}

export const GAME_MODES: Record<GameMode, ModeConfig> = {
  safe: makeMode(3, 2, 6, 0.02),
  risk: makeMode(4, 2, 6, 0.04),
  insane: makeMode(5, 2, 6, 0.06),
};

/** Mélange un tableau (Fisher-Yates) avec un RNG cryptographique sûr. */
export function shuffleArray<T>(array: T[]): T[] {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = randomInt(i + 1); // entier aléatoire sûr dans [0, i]
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** Génère les portes d'un étage (mélangées). */
export function generateDoors(mode: GameMode): ("safe" | "alarm")[] {
  const config = GAME_MODES[mode];
  const doors: ("safe" | "alarm")[] = [];
  for (let i = 0; i < config.safeDoors; i++) doors.push("safe");
  for (let i = 0; i < config.alarmDoors; i++) doors.push("alarm");
  return shuffleArray(doors);
}

/** Multiplicateur pour un étage donné (floor commence à 1). */
export function getMultiplier(mode: GameMode, floor: number): number {
  const config = GAME_MODES[mode];
  const multiplier = config.multipliers[floor - 1];
  if (multiplier === undefined) {
    throw new Error(`Invalid floor ${floor} for mode ${mode}`);
  }
  return multiplier;
}

export type PlayResult =
  | {
      status: "playing";
      result: "safe";
      nextFloor: number;
      multiplier: number;
      doors: ("safe" | "alarm")[];
    }
  | {
      status: "lost";
      result: "alarm";
      nextFloor: number;
      multiplier: 0;
      doors: ("safe" | "alarm")[];
    };

/**
 * Joue un étage : le joueur a choisi une porte.
 * C'est ici que le hasard décide (le résultat des portes est tiré côté serveur).
 */
export function playFloor(
  mode: GameMode,
  selectedDoorIndex: number,
  currentFloor: number,
): PlayResult {
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
    return { status: "lost", result: "alarm", nextFloor: currentFloor, multiplier: 0, doors };
  }

  const nextFloor = currentFloor + 1;
  return {
    status: "playing",
    result: "safe",
    nextFloor,
    multiplier: getMultiplier(mode, nextFloor),
    doors,
  };
}

/** Calcule le gain d'un cash-out, plafonné par MAX_PAYOUT. */
export function calculateCashOut(betAmount: number, multiplier: number): number {
  const raw = betAmount * multiplier;
  const capped = Math.min(raw, MAX_PAYOUT);
  return Number(capped.toFixed(2));
}
