import type { GameMode } from "./api.ts";

/** Infos d'affichage des modes (le calcul réel reste côté backend). */
export type ModeInfo = {
  id: GameMode;
  label: string;
  doors: number;
  safe: number;
  alarm: number;
  maxFloor: number;
  risk: string;
  color: string;
};

export const MODES: ModeInfo[] = [
  { id: "safe", label: "Safe", doors: 3, safe: 2, alarm: 1, maxFloor: 6, risk: "Faible", color: "#22d3ee" },
  { id: "risk", label: "Risk", doors: 4, safe: 2, alarm: 2, maxFloor: 6, risk: "Moyen", color: "#facc15" },
  { id: "insane", label: "Insane", doors: 5, safe: 2, alarm: 3, maxFloor: 6, risk: "Élevé", color: "#ef4444" },
];

export function modeInfo(id: GameMode): ModeInfo {
  return MODES.find((m) => m.id === id)!;
}

export const QUICK_BETS = [1, 5, 10, 25, 50, 100];
