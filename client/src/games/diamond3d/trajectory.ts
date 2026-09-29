import { offsetAt } from "../drop.ts";

/**
 * La géométrie de Diamond Drop en 3D, sans `three` : de simples nombres.
 *
 * Repère du plateau : 1 unité = 1 largeur de case ; `x` vers la droite depuis le
 * centre, `y` vers le haut, la rangée de clous 0 en `y = 0`. Le chemin vient du
 * serveur ; ces fonctions ne font que dire OÙ dessiner le diamant à l'instant `t`
 * (en rangées franchies, réel). Rien ici ne choisit une case.
 */

/** Écart vertical entre deux rangées de clous. */
export const ROW_GAP = 0.9;
/** Hauteur du rebond, à mi-chemin entre deux clous. */
export const HOP = 0.35;
/** Le diamant repose un peu au-dessus du clou (ou de la case) qu'il touche. */
export const GEM_LIFT = 0.28;
/** Hauteur d'une case, sous la dernière rangée. */
export const SLOT_HEIGHT = 0.7;
/** Largeur, en cases, que montre la caméra quand elle suit le diamant. */
export const FOLLOW_WIDTH = 7;

export type Point = { x: number; y: number };

/** Ce que la caméra doit montrer : un centre, une largeur et une hauteur. */
export type Focus = { x: number; y: number; width: number; height: number };

/** Hauteur où repose le diamant après `row` rangées (la dernière = sur la case). */
export function level(row: number): number {
  return -row * ROW_GAP + GEM_LIFT;
}

/**
 * Le clou `index` (de 0 à `row`) de la rangée `row`.
 * `0 - row * ROW_GAP` et non `-row * ROW_GAP` : ce dernier donne `-0` pour la
 * rangée 0, que `toEqual` distingue de `0`.
 */
export function pinPosition(row: number, index: number): Point {
  return { x: index - row / 2, y: 0 - row * ROW_GAP };
}

/** Le centre de la face haute de la case `slot`, sous `rows` rangées. */
export function slotCenter(slot: number, rows: number): Point {
  return { x: slot - rows / 2, y: 0 - rows * ROW_GAP };
}

/** Le diamant en attente, au-dessus du premier clou. */
export function restPosition(): Point {
  return { x: 0, y: level(0) + ROW_GAP };
}

/**
 * Le diamant après `t` rangées franchies. Aux valeurs entières, il est posé sur
 * un clou (ou dans sa case à la fin) ; entre deux, il glisse d'un clou au suivant
 * avec un rebond en arc, nul aux extrémités.
 */
export function gemPosition(path: boolean[], t: number): Point {
  const n = path.length;
  const borne = Math.min(Math.max(t, 0), n);
  const i = Math.floor(borne);
  if (i >= n) return { x: offsetAt(path, n), y: level(n) };
  const u = borne - i;
  const x = offsetAt(path, i) + (offsetAt(path, i + 1) - offsetAt(path, i)) * u;
  const y = level(i) + (level(i + 1) - level(i)) * u + 4 * HOP * u * (1 - u);
  return { x, y };
}

/** Largeur totale cadrée d'un plateau : ses `rows + 1` cases et une demi-case de marge de chaque côté. */
function largeurCadree(rows: number): number {
  return rows + 2;
}

/** Tout le plateau, du diamant en attente au bas des cases. */
export function overview(rows: number): Focus {
  const haut = restPosition().y + 0.5;
  const bas = -rows * ROW_GAP - SLOT_HEIGHT - 0.2;
  return { x: 0, y: (haut + bas) / 2, width: largeurCadree(rows), height: haut - bas };
}

/**
 * La caméra qui suit le diamant : plus près (17 cases dans 375 px seraient
 * illisibles), un peu en avance vers le bas, sans jamais sortir du plateau.
 */
export function follow(rows: number, gem: Point): Focus {
  const total = largeurCadree(rows);
  const width = Math.min(FOLLOW_WIDTH, total);
  const marge = total / 2 - width / 2;
  const x = Math.min(Math.max(gem.x, -marge), marge);
  return { x: x === 0 ? 0 : x, y: gem.y - ROW_GAP, width, height: 0 };
}
