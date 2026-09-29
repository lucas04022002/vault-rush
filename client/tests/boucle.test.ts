import { describe, expect, it, vi } from "vitest";
import { createBoucle, type Tick } from "../src/three/boucle.ts";

/** Un `requestAnimationFrame` à la main : une file de rappels que `flush` exécute. */
function banc() {
  let prochain = 1;
  const file = new Map<number, FrameRequestCallback>();
  const raf = vi.fn((cb: FrameRequestCallback) => {
    const id = prochain++;
    file.set(id, cb);
    return id;
  });
  const caf = vi.fn((id: number) => {
    file.delete(id);
  });
  const draw = vi.fn();
  const boucle = createBoucle(draw, raf, caf);
  return {
    boucle,
    draw,
    raf,
    caf,
    /** Nombre d'images actuellement en attente. */
    enAttente: () => file.size,
    /** Exécute les rappels en attente à cet instant (ceux planifiés pendant l'exécution attendent le prochain `flush`). */
    flush(now: number) {
      const courants = [...file.values()];
      file.clear();
      for (const cb of courants) cb(now);
    },
  };
}

describe("boucle d'affichage", () => {
  it("s'arrête d'elle-même quand le tick renvoie false", () => {
    const { boucle, draw, flush, enAttente } = banc();
    const tick = vi.fn<Tick>(() => false);
    boucle.run(tick);
    expect(enAttente()).toBe(1);
    flush(100);
    expect(tick).toHaveBeenCalledTimes(1);
    expect(draw).toHaveBeenCalledTimes(1);
    expect(enAttente()).toBe(0);
    flush(116);
    expect(tick).toHaveBeenCalledTimes(1);
    expect(draw).toHaveBeenCalledTimes(1);
  });

  it("continue tant que le tick renvoie true", () => {
    const { boucle, draw, flush, enAttente } = banc();
    let restant = 2;
    boucle.run(() => --restant > 0);
    flush(100);
    expect(enAttente()).toBe(1);
    flush(116);
    expect(enAttente()).toBe(0);
    expect(draw).toHaveBeenCalledTimes(2);
  });

  it("requestFrame dessine exactement une image, sans tick", () => {
    const { boucle, draw, flush, enAttente } = banc();
    boucle.requestFrame();
    boucle.requestFrame();
    expect(enAttente()).toBe(1);
    flush(100);
    expect(draw).toHaveBeenCalledTimes(1);
    expect(enAttente()).toBe(0);
    flush(116);
    expect(draw).toHaveBeenCalledTimes(1);
  });

  it("donne 16 ms à la première image puis plafonne l'écart à 64 ms", () => {
    const { boucle, flush } = banc();
    const dts: number[] = [];
    boucle.run((dt) => {
      dts.push(dt);
      return dts.length < 4;
    });
    flush(5000);
    flush(5020);
    flush(9000); // onglet resté en arrière-plan
    flush(9010);
    expect(dts).toEqual([16, 20, 64, 10]);
  });

  it("repart à 16 ms après un arrêt complet", () => {
    const { boucle, flush } = banc();
    const dts: number[] = [];
    boucle.run((dt) => {
      dts.push(dt);
      return false;
    });
    flush(1000);
    boucle.run((dt) => {
      dts.push(dt);
      return false;
    });
    flush(9000);
    expect(dts).toEqual([16, 16]);
  });

  describe("run(suivant) appelé depuis un tick", () => {
    for (const ancien of [false, true]) {
      it(`laisse UNE seule image en attente et appelle suivant ensuite (l'ancien renvoie ${ancien})`, () => {
        const { boucle, draw, flush, enAttente } = banc();
        const suivant = vi.fn<Tick>(() => false);
        const premier = vi.fn<Tick>(() => {
          boucle.run(suivant);
          return ancien;
        });
        boucle.run(premier);
        flush(100);
        expect(enAttente()).toBe(1);
        expect(suivant).not.toHaveBeenCalled();
        flush(116);
        expect(premier).toHaveBeenCalledTimes(1);
        expect(suivant).toHaveBeenCalledTimes(1);
        expect(draw).toHaveBeenCalledTimes(2);
        expect(enAttente()).toBe(0);
      });
    }

    it("requestFrame dans un tick qui continue ne double pas l'image", () => {
      const { boucle, raf, flush, enAttente } = banc();
      let appels = 0;
      const tick = vi.fn<Tick>(() => ++appels < 3);
      boucle.run((dt) => {
        boucle.requestFrame();
        return tick(dt);
      });
      flush(100);
      expect(enAttente()).toBe(1);
      flush(116);
      expect(enAttente()).toBe(1);
      // Le 3e tick s'arrête mais avait demandé une image : elle dessine, sans tick.
      flush(132);
      expect(enAttente()).toBe(1);
      flush(148);
      expect(enAttente()).toBe(0);
      expect(tick).toHaveBeenCalledTimes(3);
      expect(raf).toHaveBeenCalledTimes(4);
    });
  });

  it("relancer après un arrêt rappelle le dernier tick", () => {
    const { boucle, flush, enAttente } = banc();
    const tick = vi.fn<Tick>(() => false);
    boucle.run(tick);
    flush(100);
    expect(enAttente()).toBe(0);
    boucle.relancer();
    expect(enAttente()).toBe(1);
    flush(116);
    expect(tick).toHaveBeenCalledTimes(2);
  });

  it("relancer ne remplace pas un tick encore actif", () => {
    const { boucle, flush, enAttente } = banc();
    const tick = vi.fn<Tick>(() => true);
    boucle.run(tick);
    boucle.relancer();
    expect(enAttente()).toBe(1);
    flush(100);
    expect(tick).toHaveBeenCalledTimes(1);
  });

  it("relancer sans aucun tick dessine seulement une image", () => {
    const { boucle, draw, flush, enAttente } = banc();
    boucle.relancer();
    flush(100);
    expect(draw).toHaveBeenCalledTimes(1);
    expect(enAttente()).toBe(0);
  });

  it("stop annule l'image en attente et oublie les ticks", () => {
    const { boucle, draw, caf, flush, enAttente } = banc();
    const tick = vi.fn<Tick>(() => true);
    boucle.run(tick);
    boucle.stop();
    expect(caf).toHaveBeenCalledTimes(1);
    expect(enAttente()).toBe(0);
    flush(100);
    expect(tick).not.toHaveBeenCalled();
    expect(draw).not.toHaveBeenCalled();
    // Le dernier tick est oublié aussi : relancer ne le rappelle pas.
    boucle.relancer();
    flush(116);
    expect(tick).not.toHaveBeenCalled();
  });
});
