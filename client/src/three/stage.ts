import {
  ACESFilmicToneMapping,
  AmbientLight,
  Color,
  DirectionalLight,
  type Material,
  type Mesh,
  PCFSoftShadowMap,
  PerspectiveCamera,
  PMREMGenerator,
  Scene,
  Texture,
  WebGLRenderer,
} from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { BokehPass } from "three/addons/postprocessing/BokehPass.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { createBoucle, type Tick } from "./boucle.ts";
import { NEON } from "./palette.ts";
import { type Qualite, qualiteRendu } from "./support.ts";

export type { Tick } from "./boucle.ts";

export type Stage = {
  scene: Scene;
  camera: PerspectiveCamera;
  /** Le niveau de finition choisi pour cet appareil (voir `qualiteRendu`). */
  qualite: Qualite;
  /** Les reflets du studio, à poser en `envMap` sur les matières brillantes (chrome, cristal, métal). */
  studio: Texture;
  /** Distance de mise au point du flou de profondeur ; sans effet en qualité normale. */
  setFocus(distance: number): void;
  /** Une image, dès que possible (changement d'état, redimensionnement). */
  requestRender(): void;
  /** Fait tourner `tick` à chaque image tant qu'il renvoie `true`, puis s'arrête. Remplace le précédent. */
  run(tick: Tick): void;
  /** Libère tout : géométries, matériaux, textures, cibles de rendu, contexte. */
  dispose(): void;
};

/**
 * La scène commune à tous les jeux : fond violet nuit, éclairage de studio pour les
 * reflets (chrome, cristal, métal), lumières néon, ombres douces, et flou de
 * profondeur sur un ordinateur.
 *
 * AUCUNE boucle permanente : une image n'est calculée que pendant `run` ou sur
 * `requestRender`. Au repos, la scène ne coûte rien — c'est ce qui épargne la
 * batterie d'un téléphone.
 */
export function createStage(canvas: HTMLCanvasElement): Stage {
  const renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  // Rendu « photo » : courbe de tons de cinéma (appliquée par l'OutputPass) et ombres douces.
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFSoftShadowMap;
  const qualite = qualiteRendu();

  const scene = new Scene();
  scene.background = new Color(NEON.bg);
  // Une salle de studio calculée sur place (aucun fichier à télécharger) : c'est elle que
  // reflètent le chrome, le cristal et le métal. Sans elle, un métal parfait paraît noir.
  // Elle n'est PAS posée sur toute la scène : en lumière d'ambiance, cette salle blanche
  // délavait le plateau et les cases (mesuré le 30/09). Chaque matière brillante la reçoit
  // en `envMap`, par `stage.studio`.
  const pmrem = new PMREMGenerator(renderer);
  const studio = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();

  const camera = new PerspectiveCamera(40, 1, 0.1, 200);

  // Lumières communes : ambiance douce, blanc de face, rehauts magenta et cyan.
  scene.add(new AmbientLight(new Color(NEON.text), 0.15));
  const face = new DirectionalLight(new Color(NEON.text), 0.9);
  face.position.set(0, 4, 10);
  scene.add(face);
  const gauche = new DirectionalLight(new Color(NEON.mag), 1.1);
  gauche.position.set(-10, 2, 4);
  scene.add(gauche);
  const droite = new DirectionalLight(new Color(NEON.cyan), 0.9);
  droite.position.set(10, 2, 4);
  scene.add(droite);

  const composer = new EffectComposer(renderer);
  // Flou de profondeur : sur un ordinateur seulement, c'est la passe la plus chère.
  const bokeh =
    qualite === "haute"
      ? new BokehPass(scene, camera, { focus: 10, aperture: 0.0018, maxblur: 0.006 })
      : null;
  const passes = [
    new RenderPass(scene, camera),
    ...(bokeh ? [bokeh] : []),
    // Pas de halo (UnrealBloomPass) depuis l'éclairage de studio : les reflets du chrome valent
    // bien plus que 1 en HDR, et le halo noyait le plateau dans un voile blanc à tous les seuils
    // essayés (0,5 → 1,2) ; placé après la courbe de tons, il réencodait les couleurs (plateau
    // gris). Mesuré le 30/09. Le chrome et le cristal brillent d'eux-mêmes.
    new OutputPass(),
  ];
  for (const passe of passes) composer.addPass(passe);

  const boucle = createBoucle(() => composer.render());

  function resize() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (w === 0 || h === 0) return;
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    // Un téléphone qu'on tourne change le cadre : la scène doit replacer sa caméra.
    boucle.relancer();
  }

  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  resize();

  return {
    scene,
    camera,
    qualite,
    studio,
    setFocus(distance) {
      if (!bokeh) return;
      (bokeh.uniforms as { focus: { value: number } }).focus.value = distance;
    },
    requestRender: boucle.requestFrame,
    run: boucle.run,
    dispose() {
      boucle.stop();
      observer.disconnect();
      scene.traverse((objet) => {
        const mesh = objet as Mesh;
        mesh.geometry?.dispose();
        const matieres: Material[] = Array.isArray(mesh.material)
          ? mesh.material
          : mesh.material
            ? [mesh.material]
            : [];
        for (const matiere of matieres) {
          for (const valeur of Object.values(matiere)) {
            if (valeur instanceof Texture) valeur.dispose();
          }
          matiere.dispose();
        }
      });
      // `EffectComposer.dispose()` ne libère pas les passes : on s'en charge.
      for (const passe of passes) passe.dispose();
      composer.dispose();
      studio.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
