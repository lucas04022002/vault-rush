// @vitest-environment node
import { describe, expect, it } from "vitest";
import { offsetAt } from "../src/games/drop.ts";
import {
  FOLLOW_WIDTH,
  follow,
  gemPosition,
  GEM_LIFT,
  HOP,
  level,
  overview,
  pinPosition,
  restPosition,
  ROW_GAP,
  slotCenter,
} from "../src/games/diamond3d/trajectory.ts";

/** Générateur à graine fixe : les mêmes chemins à chaque exécution. */
function mulberry32(graine: number) {
  let a = graine;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Des chemins de 8 à 16 rangées (tous les modes du jeu). */
function chemins(n: number): boolean[][] {
  const aleatoire = mulberry32(20260929);
  return Array.from({ length: n }, () => {
    const rangees = 8 + Math.floor(aleatoire() * 9);
    return Array.from({ length: rangees }, () => aleatoire() < 0.5);
  });
}

/** La case d'un chemin, comme le serveur la calcule : le nombre de « à droite ». */
const caseDe = (path: boolean[]) => path.filter(Boolean).length;

describe("le repère du plateau", () => {
  it("le premier clou est au centre, en haut", () => {
    expect(pinPosition(0, 0)).toEqual({ x: 0, y: 0 });
  });

  it("une rangée de clous est centrée et espacée d'une case", () => {
    expect(pinPosition(3, 0).x).toBe(-1.5);
    expect(pinPosition(3, 3).x).toBe(1.5);
    expect(pinPosition(3, 1).y).toBeCloseTo(-3 * ROW_GAP);
  });

  it("les cases d'un plateau de n rangées sont centrées, une par colonne", () => {
    expect(slotCenter(0, 8).x).toBe(-4);
    expect(slotCenter(8, 8).x).toBe(4);
    expect(slotCenter(4, 8)).toEqual({ x: 0, y: -8 * ROW_GAP });
  });

  it("le diamant repose un peu au-dessus de ce qu'il touche", () => {
    expect(level(0)).toBeCloseTo(GEM_LIFT);
    expect(level(8)).toBeCloseTo(-8 * ROW_GAP + GEM_LIFT);
  });

  it("au repos, le diamant attend au-dessus du premier clou", () => {
    expect(restPosition()).toEqual({ x: 0, y: level(0) + ROW_GAP });
  });
});

describe("la chute rejoue le chemin du serveur", () => {
  it("à chaque rangée entière, le diamant est exactement sur le clou attendu", () => {
    for (const path of chemins(200)) {
      for (let i = 0; i < path.length; i++) {
        const p = gemPosition(path, i);
        expect(p.x).toBeCloseTo(offsetAt(path, i), 12);
        expect(p.y).toBeCloseTo(level(i), 12);
        // Et ce x est bien celui d'un clou de la rangée i.
        const index = p.x + i / 2;
        expect(Number.isInteger(Math.round(index * 1e9) / 1e9)).toBe(true);
        expect(index).toBeGreaterThanOrEqual(0);
        expect(index).toBeLessThanOrEqual(i);
      }
    }
  });

  it("à la fin, le diamant est pile au-dessus de la case tirée", () => {
    for (const path of chemins(500)) {
      const fin = gemPosition(path, path.length);
      const attendu = slotCenter(caseDe(path), path.length);
      expect(fin.x).toBeCloseTo(attendu.x, 12);
      expect(fin.y).toBeCloseTo(attendu.y + GEM_LIFT, 12);
    }
  });

  it("entre deux clous, il rebondit au-dessus de la ligne droite", () => {
    const path = [true, false, true];
    const milieu = gemPosition(path, 1.5);
    const ligneDroite = (level(1) + level(2)) / 2;
    expect(milieu.y).toBeCloseTo(ligneDroite + HOP, 12);
    expect(milieu.x).toBeCloseTo((offsetAt(path, 1) + offsetAt(path, 2)) / 2, 12);
  });

  it("t est borné : avant 0 au départ, après la fin dans la case", () => {
    const path = [false, false];
    expect(gemPosition(path, -3)).toEqual(gemPosition(path, 0));
    expect(gemPosition(path, 99)).toEqual(gemPosition(path, 2));
  });
});

describe("la caméra", () => {
  it("au repos, elle cadre tout le plateau", () => {
    const vue = overview(16);
    expect(vue.x).toBe(0);
    expect(vue.width).toBe(18);
    expect(vue.height).toBeGreaterThan(16 * ROW_GAP);
  });

  it("en suivant le diamant, elle se rapproche sans sortir du plateau", () => {
    const aGauche = follow(16, { x: -8, y: -10 });
    expect(aGauche.width).toBe(FOLLOW_WIDTH);
    expect(aGauche.x).toBe(-(18 / 2 - FOLLOW_WIDTH / 2));

    const auCentre = follow(16, { x: 0.5, y: -3 });
    expect(auCentre.x).toBe(0.5);
    expect(auCentre.y).toBeCloseTo(-3 - ROW_GAP);
  });

  it("un petit plateau n'est jamais cadré plus large que lui-même", () => {
    const vue = follow(4, { x: 2, y: 0 });
    expect(vue.width).toBe(6);
    expect(vue.x).toBe(0);
  });
});
