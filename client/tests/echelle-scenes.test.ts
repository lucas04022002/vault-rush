// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { type Object3D, PerspectiveCamera, type PointLight, Scene } from "three";
import { BombScene, NOMS_BOMBE } from "../src/games/bomb3d/BombScene.ts";
import { VaultScene } from "../src/games/coffre3d/VaultScene.ts";
import { type Contenu, MONTEE_MS, OUVERTURE_MS } from "../src/games/echelle3d/logique.ts";
import { DANGER_MS, NOMS_ECHELLE, type SceneEchelle } from "../src/games/echelle3d/SceneEchelle.ts";
import { GetawayScene, NOMS_GETAWAY } from "../src/games/getaway3d/GetawayScene.ts";
import { LaserScene, NOMS_LASER } from "../src/games/laser3d/LaserScene.ts";
import type { Stage, Tick } from "../src/three/stage.ts";

/**
 * Le contrat commun des scènes d'échelle, vérifié sur les QUATRE jeux : ce qui marche pour les
 * portes de Vault Rush doit marcher pour les cases, les tunnels et les câbles. Sans WebGL : un
 * faux `Stage` (vraie `Scene`, vraie caméra, aucun rendu) et une boucle qu'on fait tourner à la main.
 */

type Fabrique = (stage: Stage, nb: number, etapes: number) => SceneEchelle<never>;

const SCENES: [string, Fabrique, number][] = [
  ["Vault Rush", (s, n, e) => new VaultScene(s, n, e) as never, 6],
  ["Laser Grid", (s, n, e) => new LaserScene(s, n, e) as never, 8],
  ["Getaway", (s, n, e) => new GetawayScene(s, n, e) as never, 5],
  ["Bomb Squad", (s, n, e) => new BombScene(s, n, e) as never, 4],
];

function banc(fabrique: Fabrique, nb: number, etapes: number) {
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
  const jeu = fabrique(stage, nb, etapes);
  const nommes = (nom: string) => {
    const trouves: Object3D[] = [];
    scene.traverse((o) => {
      if (o.name === nom) trouves.push(o);
    });
    return trouves;
  };
  return {
    jeu,
    nommes,
    options: () => nommes(NOMS_ECHELLE.option).slice(0, nb),
    monde: () => nommes(NOMS_ECHELLE.decor)[0]?.parent as Object3D,
    lueur: () => nommes(NOMS_ECHELLE.danger)[0] as PointLight,
    ecouler(ms: number) {
      let encore = true;
      for (let t = 0; t < ms; t += 16) {
        if (!tick) throw new Error("la scène n'a pas demandé de boucle");
        encore = tick(16);
      }
      return encore;
    },
  };
}

describe.each(SCENES)("%s en 3D", (_nom, fabrique, etapes) => {
  it.each([3, 4, 5])("dessine %i options par étape, sur deux étapes", (nb) => {
    const b = banc(fabrique, nb, etapes);
    expect(b.nommes(NOMS_ECHELLE.option)).toHaveLength(2 * nb);
    expect(b.nommes(NOMS_ECHELLE.entete)).toHaveLength(2);
    expect(b.nommes(NOMS_ECHELLE.decor)).toHaveLength(1);
  });

  it("avancer : l'option choisie se révèle, on passe à l'étape suivante, puis la boucle s'arrête", () => {
    const b = banc(fabrique, 4, etapes);
    b.jeu.montrer(["cachee", "cachee", "cachee", "cachee"], 0);
    b.jeu.jouer({ type: "avance", porte: 2 }, 1);
    b.ecouler(OUVERTURE_MS + MONTEE_MS / 2);
    expect(b.monde().position.y).toBeLessThan(0);
    const encore = b.ecouler(MONTEE_MS);
    expect(b.monde().position.y).toBe(0);
    expect(encore).toBe(false);
  });

  it("perdre : la lueur de danger s'allume, s'anime, puis reste fixe ; la boucle s'arrête", () => {
    const b = banc(fabrique, 3, etapes);
    const toutes: Contenu[] = ["cachee", "cachee", "cachee"];
    b.jeu.montrer(toutes, 1);
    b.jeu.jouer({ type: "perdu", porte: 0, contenus: ["piege", "sure", "sure"] }, 1);
    expect(b.ecouler(600)).toBe(true);
    expect(b.lueur().intensity).toBeGreaterThan(0);
    expect(b.ecouler(DANGER_MS)).toBe(false);
    expect(b.lueur().intensity).toBeGreaterThan(0);
    expect(b.monde().position.x).toBe(0);
  });

  it("encaisser : pas de lueur de danger", () => {
    const b = banc(fabrique, 3, etapes);
    b.jeu.montrer(["cachee", "cachee", "cachee"], 2);
    b.jeu.jouer({ type: "encaisse", porte: null, contenus: ["sure", "piege", "sure"] }, 2);
    b.ecouler(1500);
    expect(b.lueur().intensity).toBe(0);
  });

  it("le liseré de survol suit l'option pointée, et une seule", () => {
    const b = banc(fabrique, 4, etapes);
    b.jeu.survoler(1);
    const visibles = b.options().map((o) => o.getObjectByName(NOMS_ECHELLE.survol)?.visible);
    expect(visibles).toEqual([false, true, false, false]);
  });
});

describe("ce que chaque jeu montre derrière ses options", () => {
  const visibles = (b: ReturnType<typeof banc>, nom: string) =>
    b.options().map((o) => o.getObjectByName(nom)?.visible ?? false);

  it("Laser Grid : un passage derrière les cases sûres, des lasers derrière les autres", () => {
    const b = banc((s, n, e) => new LaserScene(s, n, e) as never, 3, 8);
    b.jeu.montrer(["sure", "piege", "cachee"], 2);
    expect(visibles(b, NOMS_LASER.passage)).toEqual([true, false, false]);
    expect(visibles(b, NOMS_LASER.lasers)).toEqual([false, true, false]);
  });

  it("Getaway : une voie libre, ou un barrage de police", () => {
    const b = banc((s, n, e) => new GetawayScene(s, n, e) as never, 3, 5);
    b.jeu.montrer(["piege", "sure", "cachee"], 1);
    expect(visibles(b, NOMS_GETAWAY.voie)).toEqual([false, true, false]);
    expect(visibles(b, NOMS_GETAWAY.barrage)).toEqual([true, false, false]);
  });

  it("Bomb Squad : le câble révélé est coupé en deux, le souffle seulement sur l'explosion", () => {
    const b = banc((s, n, e) => new BombScene(s, n, e) as never, 3, 4);
    b.jeu.montrer(["sure", "piege", "cachee"], 0);
    const [coupe, , intact] = b.options();
    const ecart = (o: Object3D) =>
      (o.getObjectByName(NOMS_BOMBE.haut)?.position.y ?? 0) - (o.getObjectByName(NOMS_BOMBE.bas)?.position.y ?? 0);
    expect(ecart(coupe)).toBeGreaterThan(0);
    expect(ecart(intact)).toBe(0);
    expect(visibles(b, NOMS_BOMBE.souffle)).toEqual([false, true, false]);
  });
});
