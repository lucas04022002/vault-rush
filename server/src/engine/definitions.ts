import type { GameDefinition } from "./ladder.ts";

/**
 * Catalogue des jeux. Un jeu n'est qu'un jeu de paramètres du moteur
 * (`engine/ladder.ts`) : ajouter un jeu ne demande aucune route ni aucun
 * écran supplémentaire.
 */

export const GAME_IDS = ["vault-rush", "laser-grid", "getaway", "bomb-squad"] as const;

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
  getaway: {
    id: "getaway",
    name: "Getaway",
    tagline: "Choisis ta route à chaque tronçon, planque-toi avant le barrage.",
    steps: 5,
    labels: {
      step: "tronçon",
      option: "route",
      safe: "voie libre",
      danger: "barrage",
      cashout: "Se planquer",
    },
    modes: [
      { id: "tranquille", label: "Tranquille", options: 4, safeOptions: 3, houseEdge: 0.02 },
      { id: "nerveux", label: "Nerveux", options: 3, safeOptions: 2, houseEdge: 0.04 },
      { id: "cavale", label: "Cavale", options: 4, safeOptions: 2, houseEdge: 0.06 },
    ],
  },
  "bomb-squad": {
    id: "bomb-squad",
    name: "Bomb Squad",
    tagline: "Coupe un câble par étape, retire-toi avant l'explosion.",
    steps: 4,
    labels: {
      step: "étape",
      option: "câble",
      safe: "neutralisé",
      danger: "explosion",
      cashout: "Se retirer",
    },
    modes: [
      { id: "novice", label: "Novice", options: 4, safeOptions: 3, houseEdge: 0.02 },
      { id: "confirme", label: "Confirmé", options: 4, safeOptions: 2, houseEdge: 0.04 },
      { id: "demineur", label: "Démineur", options: 5, safeOptions: 2, houseEdge: 0.06 },
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
