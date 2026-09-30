// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  dureeRangee,
  estGrosGain,
  GROS_GAIN,
  MS_RANGEE_3D,
  RALENTI,
  RANGEES_AU_RALENTI,
} from "../src/games/diamond3d/rythme.ts";

describe("le rythme de la chute en 3D", () => {
  it("un gain ordinaire tombe à 140 ms par rangée, jusqu'au bout", () => {
    for (let r = 0; r < 16; r++) expect(dureeRangee(r, 16, 1.12)).toBe(MS_RANGEE_3D);
  });

  it("un gros gain ralentit les trois dernières rangées, et seulement elles", () => {
    const durees = Array.from({ length: 16 }, (_, r) => dureeRangee(r, 16, 16.67));
    expect(durees.slice(0, 16 - RANGEES_AU_RALENTI).every((d) => d === MS_RANGEE_3D)).toBe(true);
    expect(durees.slice(16 - RANGEES_AU_RALENTI)).toEqual([
      MS_RANGEE_3D * RALENTI,
      MS_RANGEE_3D * RALENTI,
      MS_RANGEE_3D * RALENTI,
    ]);
  });

  it("le seuil du gros gain est ×5, inclus", () => {
    expect(estGrosGain(GROS_GAIN)).toBe(true);
    expect(estGrosGain(4.99)).toBe(false);
    expect(dureeRangee(7, 8, 5)).toBe(MS_RANGEE_3D * RALENTI);
    expect(dureeRangee(7, 8, 4.99)).toBe(MS_RANGEE_3D);
  });

  it("la pause d'arrivée (rangée = total) suit le rythme de la dernière rangée", () => {
    expect(dureeRangee(8, 8, 6.03)).toBe(MS_RANGEE_3D * RALENTI);
    expect(dureeRangee(8, 8, 0.72)).toBe(MS_RANGEE_3D);
  });

  it("un plateau plus court que le ralenti est ralenti en entier, sans planter", () => {
    expect(dureeRangee(0, 2, 10)).toBe(MS_RANGEE_3D * RALENTI);
  });
});
