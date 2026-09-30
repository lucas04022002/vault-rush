import {
  BoxGeometry,
  CatmullRomCurve3,
  Color,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  type Object3D,
  PlaneGeometry,
  SphereGeometry,
  TubeGeometry,
  Vector3,
} from "three";
import { MATIERES, NEON } from "../../three/palette.ts";
import type { Stage } from "../../three/stage.ts";
import type { Contenu } from "../echelle3d/logique.ts";
import { type OptionBase, PROFONDEUR, SceneEchelle, texte } from "../echelle3d/SceneEchelle.ts";

/**
 * La couleur des gaines suit le RANG du câble, jamais son contenu : le tirage est fait par
 * le serveur après le clic, une gaine ne peut rien trahir (même règle qu'en 2D).
 */
export const GAINES = [NEON.cyan, NEON.mag, NEON.yel, NEON.orange, NEON.gem] as const;

/** Noms propres à Bomb Squad : les tests et le débogage les retrouvent ainsi. */
export const NOMS_BOMBE = {
  haut: "cable-haut",
  bas: "cable-bas",
  voyant: "voyant",
  souffle: "souffle",
} as const;

type Cable = OptionBase & {
  /** Les deux moitiés du câble, chacune accrochée à sa borne : coupées, elles se rétractent et pendent. */
  haut: Group;
  bas: Group;
  /** Le voyant du câble : éteint, vert s'il est neutralisé, rouge s'il a déclenché. */
  voyant: Mesh<SphereGeometry, MeshBasicMaterial>;
  /** Le souffle de l'explosion : une boule orange qui enfle et s'efface. */
  souffle: Mesh<SphereGeometry, MeshBasicMaterial>;
  r: number;
};

/**
 * Bomb Squad en 3D : un boîtier de métal vissé, et une rangée de câbles gainés tendus entre
 * deux bornes. Révélé, le câble est coupé net : ses deux moitiés s'écartent, le voyant passe
 * au vert — ou le souffle orange de l'explosion envahit le boîtier.
 */
export class BombScene extends SceneEchelle<Cable> {
  private secousse = 0;

  constructor(stage: Stage, nb: number, etapes: number) {
    super(stage, nb, etapes);
    this.demarrer();
  }

  protected accent(): string {
    return NEON.orange;
  }

  protected couleurDanger(): string {
    return NEON.orange;
  }

  protected enTete(etape: number): string {
    return `ÉTAPE ${etape + 1} / ${this.etapes}`;
  }

  protected decor(largeur: number, hauteur: number): Object3D {
    const boitier = new Group();
    const plaque = new Mesh(
      new PlaneGeometry(largeur * 1.3, hauteur * 3.2),
      new MeshPhysicalMaterial({
        color: new Color(NEON.panel),
        metalness: 0.75,
        roughness: 0.45,
        anisotropy: 0.5,
        envMap: this.stage.studio,
        envMapIntensity: 0.3,
      }),
    );
    plaque.receiveShadow = true;
    boitier.add(plaque);
    // Des bandes de danger orange et des vis chromées, à chaque étape du boîtier.
    const orange = new MeshBasicMaterial({ color: new Color(NEON.orange), transparent: true, opacity: 0.6, toneMapped: false });
    const vis = new MeshStandardMaterial({
      color: new Color(MATIERES.chrome),
      metalness: 1,
      roughness: 0.3,
      envMap: this.stage.studio,
    });
    for (let k = -2; k <= 4; k++) {
      const y = k * hauteur - hauteur * 0.6;
      const bande = new Mesh(new PlaneGeometry(largeur * 1.3, 0.08), orange);
      bande.position.set(0, y + hauteur * 0.46, 0.01);
      boitier.add(bande);
      for (const x of [-largeur / 2 + 0.35, largeur / 2 - 0.35]) {
        const tete = new Mesh(new CylinderGeometry(0.12, 0.12, 0.08, 20), vis);
        tete.rotation.x = Math.PI / 2;
        tete.position.set(x, y + hauteur * 0.38, 0.05);
        boitier.add(tete);
      }
    }
    boitier.position.set(0, hauteur * 0.6, -PROFONDEUR - 0.02);
    return boitier;
  }

  protected option(x: number, y: number, r: number, numero: number, parent: Group): Cable {
    const racine = new Group();
    racine.position.set(x, y, 0);
    parent.add(racine);
    const demi = r * 1.25;

    // Deux bornes chromées : le câble est tendu entre elles.
    const chrome = new MeshStandardMaterial({
      color: new Color(MATIERES.chrome),
      metalness: 1,
      roughness: 0.25,
      envMap: this.stage.studio,
      envMapIntensity: 0.7,
    });
    for (const sens of [1, -1]) {
      const borne = new Mesh(new BoxGeometry(r * 0.5, r * 0.22, 0.2), chrome);
      borne.position.set(0, sens * (demi + r * 0.1), 0);
      borne.castShadow = true;
      racine.add(borne);
    }

    // Le câble gainé, en deux moitiés qui se rejoignent au milieu, légèrement bombé vers le joueur.
    const gaine = new MeshStandardMaterial({
      color: new Color(GAINES[(numero - 1) % GAINES.length]),
      roughness: 0.35,
      metalness: 0.1,
      envMap: this.stage.studio,
      envMapIntensity: 0.5,
    });
    // Chaque moitié part de sa borne (l'origine de son groupe) et rejoint l'autre au milieu.
    const moitie = (sens: number, nom: string) => {
      const accroche = new Group();
      accroche.name = nom;
      accroche.position.y = sens * demi;
      const tube = new Mesh(
        new TubeGeometry(
          new CatmullRomCurve3([
            new Vector3(0, 0, 0),
            new Vector3(r * 0.06, -sens * demi * 0.5, 0.12),
            new Vector3(0, -sens * demi, 0.18),
          ]),
          24,
          r * 0.1,
          10,
        ),
        gaine,
      );
      tube.castShadow = true;
      accroche.add(tube);
      racine.add(accroche);
      return accroche;
    };
    const haut = moitie(1, NOMS_BOMBE.haut);
    const bas = moitie(-1, NOMS_BOMBE.bas);

    // Le voyant et le numéro, sous la borne du bas.
    const voyant = new Mesh(
      new SphereGeometry(r * 0.09, 16, 12),
      new MeshBasicMaterial({ color: new Color(NEON.panel2), toneMapped: false }),
    );
    voyant.name = NOMS_BOMBE.voyant;
    voyant.position.set(-r * 0.32, -demi - r * 0.42, 0.12);
    racine.add(voyant);
    const chiffre = new Mesh(
      new PlaneGeometry(r * 0.8, r * 0.4),
      new MeshBasicMaterial({ map: texte(String(numero), NEON.orange, null), transparent: true, toneMapped: false }),
    );
    chiffre.position.set(r * 0.18, -demi - r * 0.42, 0.12);
    racine.add(chiffre);

    // Le souffle de l'explosion.
    const souffle = new Mesh(
      new SphereGeometry(r, 24, 16),
      new MeshBasicMaterial({ color: new Color(NEON.orange), transparent: true, opacity: 0, toneMapped: false, depthWrite: false }),
    );
    souffle.name = NOMS_BOMBE.souffle;
    souffle.visible = false;
    racine.add(souffle);

    // Le liseré de survol : un cadre néon orange autour du câble.
    const survol = new Group();
    const trace = new MeshBasicMaterial({ color: new Color(NEON.orange), toneMapped: false });
    const l = r * 0.9;
    const h = demi * 2 + r * 0.6;
    for (const [w, hh, cx, cy] of [
      [l, 0.03, 0, h / 2],
      [l, 0.03, 0, -h / 2],
      [0.03, h, -l / 2, 0],
      [0.03, h, l / 2, 0],
    ] as const) {
      const trait = new Mesh(new PlaneGeometry(w, hh), trace);
      trait.position.set(cx, cy, 0.25);
      survol.add(trait);
    }
    racine.add(survol);

    return { racine, survol, u: 0, anim: null, contenu: "cachee", haut, bas, voyant, souffle, r };
  }

  protected remplir(c: Cable, contenu: Contenu): void {
    c.contenu = contenu;
    c.souffle.visible = contenu === "piege";
    c.voyant.material.color.set(NEON.panel2);
  }

  protected peindre(c: Cable, u: number): void {
    // Coupé net : chaque moitié se rétracte vers sa borne et pend de travers.
    const k = Math.min(u * 2.5, 1);
    c.haut.scale.y = 1 - 0.3 * k;
    c.bas.scale.y = 1 - 0.3 * k;
    c.haut.rotation.z = 0.3 * k;
    c.bas.rotation.z = -0.22 * k;
    if (c.contenu === "cachee") {
      c.voyant.material.color.set(NEON.panel2);
      return;
    }
    c.voyant.material.color.set(u > 0.3 ? (c.contenu === "sure" ? NEON.safe : NEON.alarm) : NEON.panel2);
    if (c.contenu === "piege") {
      // Le souffle enfle et s'efface ; il laisse une trace roussie une fois retombé.
      c.souffle.scale.setScalar(0.2 + 2.6 * u);
      c.souffle.material.opacity = u < 1 ? 0.85 * (1 - u) : 0;
    }
  }

  protected ambiance(t: number, piege: Cable | undefined): boolean {
    const actif = super.ambiance(t, piege);
    // L'explosion : un éclair orange qui retombe, et le boîtier qui tremble une demi-seconde.
    this.lueurDanger.intensity = actif ? 14 * Math.exp(-t / 450) + 2 : 2;
    this.secousse = t < 500 ? 0.12 * (1 - t / 500) : 0;
    this.monde.position.x = this.secousse > 0 ? this.secousse * Math.sin(t * 0.11) : 0;
    return actif;
  }
}
