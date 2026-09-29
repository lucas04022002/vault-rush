import {
  AmbientLight,
  Color,
  DirectionalLight,
  type Material,
  type Mesh,
  PerspectiveCamera,
  Scene,
  Texture,
  Vector2,
  WebGLRenderer,
} from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { createBoucle, type Tick } from "./boucle.ts";
import { NEON } from "./palette.ts";

export type { Tick } from "./boucle.ts";

export type Stage = {
  scene: Scene;
  camera: PerspectiveCamera;
  /** Une image, dès que possible (changement d'état, redimensionnement). */
  requestRender(): void;
  /** Fait tourner `tick` à chaque image tant qu'il renvoie `true`, puis s'arrête. Remplace le précédent. */
  run(tick: Tick): void;
  /** Libère tout : géométries, matériaux, textures, cibles de rendu, contexte. */
  dispose(): void;
};

/**
 * La scène commune à tous les jeux : fond violet nuit, lumières néon, halo.
 *
 * AUCUNE boucle permanente : une image n'est calculée que pendant `run` ou sur
 * `requestRender`. Au repos, la scène ne coûte rien — c'est ce qui épargne la
 * batterie d'un téléphone.
 */
export function createStage(canvas: HTMLCanvasElement): Stage {
  const renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  const scene = new Scene();
  scene.background = new Color(NEON.bg);

  const camera = new PerspectiveCamera(40, 1, 0.1, 200);

  // Lumières communes : ambiance douce, blanc de face, rehauts magenta et cyan.
  scene.add(new AmbientLight(new Color(NEON.text), 0.35));
  const face = new DirectionalLight(new Color(NEON.text), 1.6);
  face.position.set(0, 4, 10);
  scene.add(face);
  const gauche = new DirectionalLight(new Color(NEON.mag), 1.1);
  gauche.position.set(-10, 2, 4);
  scene.add(gauche);
  const droite = new DirectionalLight(new Color(NEON.cyan), 0.9);
  droite.position.set(10, 2, 4);
  scene.add(droite);

  const composer = new EffectComposer(renderer);
  const passes = [
    new RenderPass(scene, camera),
    // Halo néon : force 0,9, rayon 0,5, seuil 0,2 (seuls les objets lumineux brillent).
    new UnrealBloomPass(new Vector2(256, 256), 0.9, 0.5, 0.2),
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
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
