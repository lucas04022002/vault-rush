import type { GameConfig, Round } from "../api.ts";

/**
 * Les formes propres au genre `drop`, côté client.
 *
 * `api.ts` décrit le socle commun d'une partie (`Round`, `GameConfig`) : il ne
 * connaît pas les rangées ni les cases d'un plateau de clous. Les deux lectures
 * ci-dessous sont les SEULS endroits où l'on affirme la forme propre à ce jeu,
 * telle que la sert `server/src/engine/drop.ts`.
 */

/** Un mode, tel qu'il arrive dans `GET /api/games/diamond-drop/config`. */
export type DropModeView = {
  id: string;
  label: string;
  /** Nombre de rangées de clous ; il y a `rows + 1` cases. */
  rows: number;
  alpha: number;
  houseEdge: number;
  /** Les multiplicateurs, de la case la plus à gauche à la plus à droite. */
  slots: number[];
  /** La chance d'arriver dans chaque case. */
  chances: number[];
};

/** L'état public d'une partie : `round.view`. */
export type DropView = {
  mode: string;
  rows: number;
  slots: number[];
  dropped: boolean;
  /** Le chemin, `null` tant que le diamant n'est pas lâché. */
  path: boolean[] | null;
  slot: number | null;
  multiplier: number | null;
};

/** Ce qu'un lâcher renvoie : le chemin d'un bloc, la case et son gain. */
export type DropDrop = { path: boolean[]; slot: number; multiplier: number };

/** Les modes du jeu, avec leurs rangées et leurs cases. */
export function dropModes(config: GameConfig): DropModeView[] {
  return config.modes as unknown as DropModeView[];
}

/** L'état public d'une partie, ou `null` si la partie n'en porte pas. */
export function viewOf(round: Round): DropView | null {
  return (round.view ?? null) as DropView | null;
}

/**
 * L'écart horizontal du diamant après `row` rangées, en largeurs de case et
 * compté depuis le centre du plateau : chaque « à droite » le décale d'une
 * demi-case vers la droite, chaque « à gauche » d'une demi-case vers la gauche.
 */
export function offsetAt(path: boolean[] | null, row: number): number {
  if (!path) return 0;
  const franchies = path.slice(0, row);
  const droites = franchies.reduce((count, right) => count + (right ? 1 : 0), 0);
  return droites - franchies.length / 2;
}
