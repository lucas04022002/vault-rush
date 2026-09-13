import type { GameDefinition } from "./ladder.ts";
import type { GameId } from "./types.ts";

/**
 * Les paramètres des jeux d'ÉCHELLE. Un jeu d'échelle n'est qu'un jeu de
 * paramètres du moteur (`engine/ladder.ts`) : ajouter un décor ne demande ni
 * route, ni écran, ni moteur supplémentaire.
 *
 * Les identifiants de jeux (tous genres confondus) vivent dans `types.ts`,
 * et les moteurs sont assemblés dans `registry.ts`.
 */

// Réexportés ici pour les appelants historiques : la source reste `types.ts`.
export { GAME_IDS, isGameId } from "./types.ts";
export type { GameId } from "./types.ts";

/** Les identifiants des jeux servis par le moteur d'échelle. */
export type LadderGameId = Extract<
  GameId,
  "vault-rush" | "laser-grid" | "getaway" | "bomb-squad"
>;

export const GAMES: Record<LadderGameId, GameDefinition<LadderGameId>> = {
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

/** Les identifiants des jeux d'échelle, dans l'ordre d'affichage. */
export const LADDER_GAME_IDS = Object.keys(GAMES) as LadderGameId[];
