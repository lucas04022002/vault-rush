// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  type BoxGeometry,
  Color,
  type InstancedMesh,
  Matrix4,
  Mesh,
  type MeshBasicMaterial,
  type MeshStandardMaterial,
  PerspectiveCamera,
  type PlaneGeometry,
  Points,
  type PointsMaterial,
  Scene,
  Vector3,
} from "three";
import {
  CASE_ALLUMEE,
  CLOU_MS,
  DiamondScene,
  type DiamondState,
  NOMS,
} from "../src/games/diamond3d/DiamondScene.ts";
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

function banc(slots: number[] = DOUX) {
  const scene = new Scene();
  let tick: Tick | null = null;
  const focales: number[] = [];
  const stage = {
    scene,
    camera: new PerspectiveCamera(40, 1, 0.1, 200),
    qualite: "normale",
    setFocus(distance: number) {
      focales.push(distance);
    },
    requestRender() {},
    run(t: Tick) {
      tick = t;
    },
    dispose() {},
  } as Stage;
  const diamant = new DiamondScene(stage, ROWS, slots);
  diamant.setRowMs(ROW_MS);

  // Les objets, retrouvés par leur géométrie : c'est ce que voit le rendu.
  const objets: Mesh[] = [];
  scene.traverse((o) => {
    if (o instanceof Mesh) objets.push(o);
  });
  const gem = objets.find((o) => o.name === NOMS.diamant) as Mesh;
  const cases = objets.filter((o) => o.name === NOMS.case) as Mesh<BoxGeometry, MeshStandardMaterial>[];
  const etiquettes = objets.filter((o) => o.name === NOMS.etiquette) as Mesh<
    PlaneGeometry,
    MeshBasicMaterial
  >[];
  const clous = objets.find((o) => o.name === NOMS.clous) as InstancedMesh;
  const eclats = () => {
    const trouves: Points[] = [];
    scene.traverse((o) => {
      if (o instanceof Points) trouves.push(o);
    });
    return trouves;
  };

  return {
    diamant,
    stage,
    focales,
    gem,
    cases,
    etiquettes,
    clous,
    /** L'échelle du clou n° `instance`, lue dans sa matrice comme le ferait le rendu. */
    echelleClou(instance: number) {
      const m = new Matrix4();
      clous.getMatrixAt(instance, m);
      return new Vector3().setFromMatrixScale(m).x;
    },
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
    expect(b.cases[0].material.emissiveIntensity).toBe(CASE_ALLUMEE);
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

  it("les éclats sont de la couleur de la case allumée, même sur une case froide", () => {
    // Une case du centre (« froide ») à ×3 : rare, mais c'est ce qui rend l'éclat visible ou non.
    const centre = [6.03, 2.13, 1.14, 0.8, 3, 0.8, 1.14, 2.13, 6.03];
    const alterne = [true, false, true, false, true, false, true, false]; // case 4
    const b = banc(centre);
    b.diamant.update({ path: alterne, row: 0, landedSlot: null });
    b.tick(0);
    b.diamant.update({ path: alterne, row: ROWS, landedSlot: 4 });
    b.ecouler(400);

    const [eclats] = b.eclats();
    expect(eclats).toBeDefined();
    expect((eclats.material as PointsMaterial).color.getHexString()).toBe("c08bff");
  });

  it("un plateau remonté après l'arrivée allume la case sans rejouer la fête", () => {
    const b = banc();
    // Reprise : le chemin arrive déjà terminé, avec sa case d'arrivée.
    b.diamant.update({ path: GAUCHE, row: ROWS, landedSlot: 0 });
    b.ecouler(400);

    expect(b.cases[0].material.emissive.getHexString()).toBe("c08bff");
    expect(b.cases[0].material.emissiveIntensity).toBe(CASE_ALLUMEE);
    expect(b.etiquettes[0].material.color.r).toBeCloseTo(0.2, 6);
    // Ni gerbe d'éclats, ni pulsation de l'étiquette.
    expect(b.eclats()).toHaveLength(0);
    expect(b.etiquettes[0].scale.x).toBe(1);
  });
});

describe("DiamondScene — chrome, caméra de cinéma", () => {
  /** Droite, gauche, droite, puis toujours à gauche : case 2. */
  const ZIGZAG = [true, false, true, false, false, false, false, false];
  /** Le clou touché à la rangée r : indice = nombre de « à droite » déjà faits. */
  const clouTouche = (path: boolean[], r: number) =>
    (r * (r + 1)) / 2 + path.slice(0, r).filter(Boolean).length;

  it("le diamant fait vibrer exactement les clous de son chemin, et aucun autre", () => {
    const b = banc();
    b.diamant.update({ path: ZIGZAG, row: 0, landedSlot: null });
    b.tick(0);
    // L'écran est déjà à la rangée 4 : le diamant rattrape et touche les rangées 0 à 3.
    b.diamant.update({ path: ZIGZAG, row: 4, landedSlot: null });
    b.tick(16);

    const touches = [0, 1, 2, 3].map((r) => clouTouche(ZIGZAG, r));
    expect(touches).toEqual([0, 2, 4, 8]);
    for (const instance of touches) expect(b.echelleClou(instance)).toBeGreaterThan(1);
    // Les voisins n'ont pas bougé.
    for (const instance of [1, 3, 5, 6, 7, 9]) expect(b.echelleClou(instance)).toBe(1);
  });

  it("un clou touché s'éclaire en améthyste puis revient au chrome, à sa taille", () => {
    const b = banc();
    b.diamant.update({ path: ZIGZAG, row: 0, landedSlot: null });
    b.tick(0);
    b.diamant.update({ path: ZIGZAG, row: 1, landedSlot: null });
    b.ecouler(ROW_MS); // le diamant atteint le premier clou

    const couleur = new Color();
    b.clous.getColorAt(0, couleur);
    expect(couleur.getHexString()).not.toBe("e4ddf2");

    b.ecouler(CLOU_MS + 50);
    b.clous.getColorAt(0, couleur);
    expect(couleur.getHexString()).toBe("e4ddf2");
    expect(b.echelleClou(0)).toBeCloseTo(1, 6);
  });

  it("une reprise en pleine chute ne refait pas tinter les clous déjà passés", () => {
    const b = banc();
    b.diamant.update({ path: ZIGZAG, row: 5, landedSlot: null });
    b.tick(16);
    for (let r = 0; r < 5; r++) expect(b.echelleClou(clouTouche(ZIGZAG, r))).toBe(1);
  });

  /** La distance caméra → diamant au cœur du ralenti, pour un chemin donné. */
  function distanceAuRalenti(path: boolean[], slots = DOUX) {
    const b = banc(slots);
    b.diamant.update({ path, row: 0, landedSlot: null });
    b.tick(0);
    b.diamant.update({ path, row: ROWS - 1, landedSlot: null });
    b.ecouler(1500);
    return b.stage.camera.position.distanceTo(b.gem.getWorldPosition(new Vector3()));
  }

  it("sur un gros gain, la caméra se resserre pendant le ralenti ; pas sur un petit", () => {
    const gros = distanceAuRalenti(GAUCHE); // case 0 : ×6,03
    const petit = distanceAuRalenti([true, false, true, false, true, false, true, false]); // ×0,72
    expect(gros).toBeLessThan(petit * 0.8);
  });

  it("la mise au point suit le diamant", () => {
    const b = banc();
    b.diamant.update({ path: GAUCHE, row: 0, landedSlot: null });
    b.tick(0);
    b.diamant.update({ path: GAUCHE, row: 3, landedSlot: null });
    b.ecouler(600);
    const attendu = b.stage.camera.position.distanceTo(b.gem.getWorldPosition(new Vector3()));
    expect(b.focales.at(-1)).toBeCloseTo(attendu, 6);
  });

  it("un gros gain fait trembler la caméra à l'arrivée, puis elle se pose", () => {
    const b = banc();
    b.diamant.update({ path: GAUCHE, row: 0, landedSlot: null });
    b.tick(0);
    b.diamant.update({ path: GAUCHE, row: ROWS, landedSlot: 0 });
    // Le diamant arrive, la caméra glisse : on la laisse se poser, puis on observe sa position.
    const positions: number[] = [];
    for (let t = 0; t < 3000; t += 16) {
      b.tick(16);
      positions.push(b.stage.camera.position.x);
    }
    // Des allers-retours (la secousse) puis l'immobilité : les dernières images ne bougent plus.
    const fin = positions.slice(-20);
    expect(Math.max(...fin) - Math.min(...fin)).toBeLessThan(1e-6);
    expect(b.tick(16)).toBe(false);
  });
});
