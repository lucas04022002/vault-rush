// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { type Group, type Mesh, type Object3D, PerspectiveCamera, type PointLight, Scene } from "three";
import { MONTEE_MS, OUVERTURE_MS, type Contenu } from "../src/games/coffre3d/portes.ts";
import {
  ALARME_MS,
  ANGLE_OUVERT,
  NOMS_COFFRE,
  VaultScene,
} from "../src/games/coffre3d/VaultScene.ts";
import type { Stage, Tick } from "../src/three/stage.ts";

/**
 * La scène de Vault Rush sans WebGL : un faux `Stage` (vraie `Scene`, vraie caméra, aucun rendu)
 * et une boucle qu'on fait tourner à la main. On observe les objets three par leur nom.
 */

function banc(nb = 3) {
  const scene = new Scene();
  let tick: Tick | null = null;
  const stage = {
    scene,
    camera: new PerspectiveCamera(40, 1.5, 0.1, 200),
    qualite: "normale",
    studio: null,
    setFocus() {},
    requestRender() {},
    run(t: Tick) {
      tick = t;
    },
    dispose() {},
  } as unknown as Stage;
  const coffre = new VaultScene(stage, nb, 6);

  const nommes = (nom: string) => {
    const trouves: Object3D[] = [];
    scene.traverse((o) => {
      if (o.name === nom) trouves.push(o);
    });
    return trouves;
  };
  // Les portes de l'étage courant : les `nb` premières (la rangée du dessus vient ensuite).
  const portes = () => nommes(NOMS_COFFRE.porte).slice(0, nb) as Group[];
  const dans = (porte: Group, nom: string) => porte.getObjectByName(nom) as Object3D;
  const angle = (porte: Group) => (dans(porte, NOMS_COFFRE.battant) as Mesh).parent?.rotation.y ?? NaN;

  return {
    coffre,
    scene,
    portes,
    angle,
    dans,
    gyrophare: () => nommes(NOMS_COFFRE.gyrophare)[0] as PointLight,
    monde: () => (nommes(NOMS_COFFRE.mur)[0] as Mesh).parent as Group,
    tick: (dt: number) => {
      if (!tick) throw new Error("la scène n'a pas demandé de boucle");
      return tick(dt);
    },
    ecouler(ms: number) {
      let encore = true;
      for (let t = 0; t < ms; t += 16) encore = this.tick(16);
      return encore;
    },
  };
}

describe("VaultScene", () => {
  it.each([3, 4, 5])("dessine %i portes par étage, sur deux étages (le courant et le suivant)", (nb) => {
    const b = banc(nb);
    const toutes: Object3D[] = [];
    b.scene.traverse((o) => {
      if (o.name === NOMS_COFFRE.porte) toutes.push(o);
    });
    expect(toutes).toHaveLength(2 * nb);
  });

  it("montre un état sans l'animer : battants ouverts sur ce que le serveur a révélé", () => {
    const b = banc(3);
    const etat: Contenu[] = ["or", "fermee", "alarme"];
    b.coffre.montrer(etat, 2);
    const [p1, p2, p3] = b.portes();
    expect(b.angle(p1)).toBeCloseTo(ANGLE_OUVERT, 6);
    expect(b.angle(p2)).toBe(0);
    expect(b.angle(p3)).toBeCloseTo(ANGLE_OUVERT, 6);
    expect(b.dans(p1, NOMS_COFFRE.or).visible).toBe(true);
    expect(b.dans(p3, NOMS_COFFRE.alarme).visible).toBe(true);
    expect(b.dans(p2, NOMS_COFFRE.or).visible).toBe(false);
  });

  it("étage franchi : la porte choisie s'ouvre sur l'or, on monte, puis l'étage suivant est fermé", () => {
    const b = banc(3);
    b.coffre.montrer(["fermee", "fermee", "fermee"], 0);
    b.coffre.jouer({ type: "montee", porte: 1 }, 1);

    b.ecouler(OUVERTURE_MS);
    const p2 = b.portes()[1];
    expect(b.angle(p2)).toBeCloseTo(ANGLE_OUVERT, 6);
    expect(b.dans(p2, NOMS_COFFRE.or).visible).toBe(true);
    // Seule la porte choisie s'est ouverte.
    expect(b.angle(b.portes()[0])).toBe(0);

    b.ecouler(MONTEE_MS / 2);
    expect(b.monde().position.y).toBeLessThan(0); // la rangée descend : on monte

    const encore = b.ecouler(MONTEE_MS);
    expect(b.monde().position.y).toBe(0);
    for (const p of b.portes()) {
      expect(b.angle(p)).toBe(0);
      expect(b.dans(p, NOMS_COFFRE.or).visible).toBe(false);
    }
    expect(encore).toBe(false); // puis la boucle s'arrête
  });

  it("alarme : la porte choisie s'ouvre sur le gyrophare, puis les autres montrent leur contenu", () => {
    const b = banc(4);
    b.coffre.montrer(["fermee", "fermee", "fermee", "fermee"], 3);
    b.coffre.jouer({ type: "alarme", porte: 2, contenus: ["or", "or", "alarme", "alarme"] }, 3);

    b.ecouler(OUVERTURE_MS);
    const [p1, , p3, p4] = b.portes();
    expect(b.angle(p3)).toBeCloseTo(ANGLE_OUVERT, 6);
    expect(b.dans(p3, NOMS_COFFRE.alarme).visible).toBe(true);
    expect(b.gyrophare().intensity).toBeGreaterThan(0);

    b.ecouler(1000);
    expect(b.angle(p1)).toBeCloseTo(ANGLE_OUVERT, 6);
    expect(b.angle(p4)).toBeCloseTo(ANGLE_OUVERT, 6);
    expect(b.dans(p1, NOMS_COFFRE.or).visible).toBe(true);
    expect(b.dans(p4, NOMS_COFFRE.alarme).visible).toBe(true);
  });

  it("le gyrophare clignote quelques secondes puis reste fixe : la boucle s'arrête", () => {
    const b = banc(3);
    b.coffre.montrer(["fermee", "fermee", "fermee"], 1);
    b.coffre.jouer({ type: "alarme", porte: 0, contenus: ["alarme", "or", "or"] }, 1);
    expect(b.ecouler(1000)).toBe(true);
    expect(b.ecouler(ALARME_MS)).toBe(false);
    expect(b.gyrophare().intensity).toBeGreaterThan(0);
  });

  it("encaissement : toutes les portes s'ouvrent, sans gyrophare", () => {
    const b = banc(3);
    b.coffre.montrer(["fermee", "fermee", "fermee"], 4);
    b.coffre.jouer({ type: "encaisse", porte: null, contenus: ["or", "alarme", "or"] }, 4);
    b.ecouler(1500);
    for (const p of b.portes()) expect(b.angle(p)).toBeCloseTo(ANGLE_OUVERT, 6);
    expect(b.gyrophare().intensity).toBe(0);
  });

  it("le liseré néon suit la porte survolée, et une seule", () => {
    const b = banc(4);
    b.coffre.survoler(2);
    const visibles = b.portes().map((p) => b.dans(p, NOMS_COFFRE.survol).visible);
    expect(visibles).toEqual([false, false, true, false]);
    b.coffre.survoler(null);
    expect(b.portes().some((p) => b.dans(p, NOMS_COFFRE.survol).visible)).toBe(false);
  });
});
