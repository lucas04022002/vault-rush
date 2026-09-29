// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  BoxGeometry,
  type Material,
  Mesh,
  type MeshBasicMaterial,
  type MeshStandardMaterial,
  OctahedronGeometry,
  PerspectiveCamera,
  PlaneGeometry,
  Points,
  Scene,
} from "three";
import { DiamondScene, type DiamondState } from "../src/games/diamond3d/DiamondScene.ts";
import { gemPosition, restPosition } from "../src/games/diamond3d/trajectory.ts";
import { NEON } from "../src/three/palette.ts";
import type { Stage, Tick } from "../src/three/stage.ts";

/**
 * La scène de Diamond Drop, sans WebGL : un faux `Stage` (une vraie `Scene` et une vraie caméra,
 * mais aucun rendu) et une boucle qu'on fait tourner à la main. On observe la scène par ses objets
 * three — le diamant, les cases, les étiquettes — comme le ferait le rendu, sans champ privé.
 */

const ROWS = 8;
const DOUX = [6.03, 2.13, 1.14, 0.8, 0.72, 0.8, 1.14, 2.13, 6.03];
/** Le chemin « toujours à gauche » : case 0, ×6,03. */
const GAUCHE = Array.from({ length: ROWS }, () => false);
const ROW_MS = 140;
const REPOS: DiamondState = { path: null, row: 0, landedSlot: null };

function banc() {
  const scene = new Scene();
  let tick: Tick | null = null;
  const stage = {
    scene,
    camera: new PerspectiveCamera(40, 1, 0.1, 200),
    requestRender() {},
    run(t: Tick) {
      tick = t;
    },
    dispose() {},
  } as Stage;
  const diamant = new DiamondScene(stage, ROWS, DOUX);
  diamant.setRowMs(ROW_MS);

  // Les objets, retrouvés par leur géométrie : c'est ce que voit le rendu.
  const objets: Mesh[] = [];
  scene.traverse((o) => {
    if (o instanceof Mesh) objets.push(o);
  });
  const gem = objets.find((o) => o.geometry instanceof OctahedronGeometry) as Mesh;
  const cases = objets.filter((o) => o.geometry instanceof BoxGeometry) as Mesh<BoxGeometry, MeshStandardMaterial>[];
  // Le fond du plateau est aussi un plan, mais opaque : seules les étiquettes sont transparentes.
  const etiquettes = objets.filter(
    (o) => o.geometry instanceof PlaneGeometry && (o.material as Material).transparent,
  ) as Mesh<PlaneGeometry, MeshBasicMaterial>[];
  const eclats = () => {
    const trouves: Points[] = [];
    scene.traverse((o) => {
      if (o instanceof Points) trouves.push(o);
    });
    return trouves;
  };

  return {
    diamant,
    gem,
    cases,
    etiquettes,
    eclats,
    /** Une image de `dt` ms, comme la boucle du socle. */
    tick: (dt: number) => {
      if (!tick) throw new Error("la scène n'a pas demandé de boucle");
      return tick(dt);
    },
    /** Des images de 16 ms pendant `ms`. */
    ecouler(ms: number) {
      for (let t = 0; t < ms; t += 16) this.tick(16);
    },
  };
}

/** L'état visible d'une case : sa lueur et son intensité. */
function apparence(boite: Mesh<BoxGeometry, MeshStandardMaterial>) {
  return { lueur: boite.material.emissive.getHexString(), intensite: boite.material.emissiveIntensity };
}

describe("DiamondScene", () => {
  it("trouve ses objets : un diamant, 9 cases, 9 étiquettes", () => {
    const b = banc();
    expect(b.gem).toBeDefined();
    expect(b.cases).toHaveLength(DOUX.length);
    expect(b.etiquettes).toHaveLength(DOUX.length);
  });

  it("un lâcher neuf part du diamant en attente et atteint le premier clou en une rangée de temps", () => {
    const b = banc();
    b.diamant.update({ path: GAUCHE, row: 0, landedSlot: null });
    b.tick(0);
    expect(b.gem.position.x).toBeCloseTo(restPosition().x, 6);
    expect(b.gem.position.y).toBeCloseTo(restPosition().y, 6);

    for (let i = 0; i < 7; i++) b.tick(20); // 140 ms
    const clou = gemPosition(GAUCHE, 0);
    expect(b.gem.position.x).toBeCloseTo(clou.x, 4);
    expect(b.gem.position.y).toBeCloseTo(clou.y, 4);
  });

  it("si l'écran saute de la rangée 0 à la 6 d'un coup, une image suffit à revenir près de lui", () => {
    const b = banc();
    b.diamant.update({ path: GAUCHE, row: 0, landedSlot: null });
    b.tick(0);
    b.diamant.update({ path: GAUCHE, row: 6, landedSlot: null });
    b.tick(16);

    // Rangée affichée : 5 + 16/140, jamais plus d'une rangée de retard.
    const attendu = gemPosition(GAUCHE, 5 + 16 / ROW_MS);
    expect(b.gem.position.x).toBeCloseTo(attendu.x, 4);
    expect(b.gem.position.y).toBeCloseTo(attendu.y, 4);
    const rangee5 = gemPosition(GAUCHE, 5);
    expect(b.gem.position.x).toBeLessThanOrEqual(rangee5.x + 1e-6);
  });

  it("à l'arrivée, la case posée s'allume en améthyste et son chiffre s'assombrit", () => {
    const b = banc();
    b.diamant.update({ path: GAUCHE, row: 0, landedSlot: null });
    b.tick(0);
    b.diamant.update({ path: GAUCHE, row: ROWS, landedSlot: 0 });
    b.ecouler(400); // largement de quoi finir la dernière rangée

    expect(b.cases[0].material.emissive.getHexString()).toBe("c08bff");
    expect(NEON.gem.toLowerCase()).toBe("#c08bff");
    expect(b.cases[0].material.emissiveIntensity).toBe(0.5);
    expect(b.etiquettes[0].material.color.r).toBeCloseTo(0.2, 6);
    expect(b.etiquettes[0].material.color.g).toBeCloseTo(0.2, 6);
    // ×6,03 : ça jaillit.
    expect(b.eclats()).toHaveLength(1);
  });

  it("un nouvel état sans chemin remet chaque case et chaque étiquette comme avant la chute", () => {
    const b = banc();
    const avant = b.cases.map(apparence);

    b.diamant.update({ path: GAUCHE, row: 0, landedSlot: null });
    b.tick(0);
    b.diamant.update({ path: GAUCHE, row: ROWS, landedSlot: 0 });
    b.ecouler(400);
    expect(apparence(b.cases[0])).not.toEqual(avant[0]);

    b.diamant.update(REPOS);
    b.ecouler(16);
    expect(b.cases.map(apparence)).toEqual(avant);
    for (const texte of b.etiquettes) {
      expect(texte.material.color.r).toBe(1);
      expect(texte.material.color.g).toBe(1);
      expect(texte.material.color.b).toBe(1);
      expect(texte.scale.x).toBe(1);
      expect(texte.scale.y).toBe(1);
    }
    expect(b.eclats()).toHaveLength(0);
  });

  it("la boucle s'arrête d'elle-même une fois tout posé : tick renvoie faux après ~3 s", () => {
    const b = banc();
    b.diamant.update({ path: GAUCHE, row: 0, landedSlot: null });
    expect(b.tick(16)).toBe(true); // le diamant bouge
    b.diamant.update({ path: GAUCHE, row: ROWS, landedSlot: 0 });
    b.ecouler(3000);
    expect(b.tick(16)).toBe(false);
  });
});
