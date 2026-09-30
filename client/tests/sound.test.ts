import { afterEach, describe, expect, it, vi } from "vitest";
import { frequenceClou, playPeg, setSoundEnabled } from "../src/lib/sound.ts";

afterEach(() => {
  setSoundEnabled(false);
  window.localStorage.clear();
});

describe("le tintement des clous de Diamond Drop", () => {
  it("monte à chaque rangée, d'un la à l'octave au-dessus", () => {
    const notes = Array.from({ length: 16 }, (_, r) => frequenceClou(r, 16));
    expect(notes[0]).toBe(880);
    expect(notes[15]).toBeCloseTo(1760, 6);
    for (let r = 1; r < notes.length; r++) expect(notes[r]).toBeGreaterThan(notes[r - 1]);
  });

  it("un plateau d'une seule rangée ne divise pas par zéro", () => {
    expect(frequenceClou(0, 1)).toBe(880);
  });

  it("son coupé : aucun contexte audio n'est créé", () => {
    const Contexte = vi.fn();
    vi.stubGlobal("AudioContext", Contexte);
    setSoundEnabled(false);
    playPeg(3, 8);
    expect(Contexte).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("son activé : un oscillateur part à la fréquence de la rangée", () => {
    const frequences: number[] = [];
    const noeud = () => ({ connect: (x: unknown) => x });
    class FauxContexte {
      state = "running";
      currentTime = 0;
      destination = {};
      createOscillator() {
        return {
          ...noeud(),
          type: "",
          frequency: { setValueAtTime: (f: number) => frequences.push(f) },
          start() {},
          stop() {},
        };
      }
      createGain() {
        return {
          ...noeud(),
          connect: () => ({ connect: () => {} }),
          gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
        };
      }
      resume() {}
    }
    vi.stubGlobal("AudioContext", FauxContexte);
    setSoundEnabled(true);
    playPeg(15, 16);
    expect(frequences[0]).toBeCloseTo(1760, 6);
    vi.unstubAllGlobals();
  });
});
