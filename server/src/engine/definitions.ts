import type { GameDefinition } from "./ladder.ts";

/**
 * Catalogue des jeux. Un jeu n'est qu'un jeu de paramètres du moteur
 * (`engine/ladder.ts`) : ajouter un jeu ne demande aucune route ni aucun
 * écran supplémentaire.
 */

export const GAME_IDS = ["vault-rush", "laser-grid"] as const;

export type GameId = (typeof GAME_IDS)[number];

export const GAMES: Record<GameId, GameDefinition<GameId>> = {
  "vault-rush": {
    id: "vault-rush",
    name: "Vault Rush",
    tagline: "Monte, choisis une porte par étage, encaisse avant l'alarme.",
    steps: 6,
    labels: {
      step: "étage",
      option: "porte",
      safe: "coffre",
      danger: "alarme",
      cashout: "Encaisser",
    },
    modes: [
      { id: "safe", label: "Safe", options: 3, safeOptions: 2, houseEdge: 0.02 },
      { id: "risk", label: "Risk", options: 4, safeOptions: 2, houseEdge: 0.04 },
      { id: "insane", label: "Insane", options: 5, safeOptions: 2, houseEdge: 0.06 },
    ],
  },
  "laser-grid": {
    id: "laser-grid",
    name: "Laser Grid",
    tagline: "Traverse la grille ligne par ligne sans toucher un laser.",
    steps: 8,
    labels: {
      step: "ligne",
      option: "case",
      safe: "passage",
      danger: "laser",
      cashout: "Sortir",
    },
    modes: [
      { id: "calme", label: "Calme", options: 4, safeOptions: 3, houseEdge: 0.02 },
      { id: "tendu", label: "Tendu", options: 4, safeOptions: 2, houseEdge: 0.04 },
      { id: "mortel", label: "Mortel", options: 5, safeOptions: 2, houseEdge: 0.06 },
    ],
  },
};

/** Vrai si `value` est l'identifiant d'un jeu existant. */
export function isGameId(value: unknown): value is GameId {
  return typeof value === "string" && (GAME_IDS as readonly string[]).includes(value);
}

/** Les jeux dans l'ordre d'affichage de l'arcade. */
export function allGames(): GameDefinition<GameId>[] {
  return GAME_IDS.map((id) => GAMES[id]);
}
