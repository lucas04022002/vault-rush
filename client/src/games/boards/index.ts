import type { ComponentType } from "react";
import { BombBoard } from "./BombBoard.tsx";
import { GetawayBoard } from "./GetawayBoard.tsx";
import { LaserBoard } from "./LaserBoard.tsx";
import type { BoardProps } from "./types.ts";
import { VaultBoard } from "./VaultBoard.tsx";

/**
 * L'identité visuelle d'un jeu, choisie par son identifiant : le plateau et
 * l'accent. Un jeu inconnu (ajouté côté serveur avant son plateau) retombe sur
 * les portes plutôt que de ne rien afficher.
 */

export type BoardAccent = "yellow" | "cyan" | "magenta" | "orange" | "ice" | "gem" | "felt";

const BOARDS: Record<string, ComponentType<BoardProps>> = {
  "vault-rush": VaultBoard,
  "laser-grid": LaserBoard,
  getaway: GetawayBoard,
  "bomb-squad": BombBoard,
};

const ACCENTS: Record<string, BoardAccent> = {
  "vault-rush": "yellow",
  "laser-grid": "cyan",
  getaway: "magenta",
  "bomb-squad": "orange",
  "vault-code": "ice",
  "diamond-drop": "gem",
  "blackjack-express": "felt",
};

export function boardFor(gameId: string): ComponentType<BoardProps> {
  return BOARDS[gameId] ?? VaultBoard;
}

/** La couleur du jeu : titre de page, tuile d'arcade et bouton d'encaissement. */
export function accentFor(gameId: string): BoardAccent {
  return ACCENTS[gameId] ?? "yellow";
}

export { BombBoard } from "./BombBoard.tsx";
export { GetawayBoard } from "./GetawayBoard.tsx";
export { LaserBoard } from "./LaserBoard.tsx";
export { VaultBoard } from "./VaultBoard.tsx";
export type { BoardProps } from "./types.ts";
