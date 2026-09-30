import {
  BoxGeometry,
  Color,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  type Object3D,
  PlaneGeometry,
  Shape,
  ShapeGeometry,
} from "three";
import { MATIERES, NEON } from "../../three/palette.ts";
import type { Stage } from "../../three/stage.ts";
import type { Contenu } from "../echelle3d/logique.ts";
import { type OptionBase, PROFONDEUR, SceneEchelle, texte } from "../echelle3d/SceneEchelle.ts";

/** Opacité des vitres : assez pour qu'on voie le verre, pas au point de cacher la salle (0,42 les rendait opaques). */
const VITRE = 0.22;

/** Noms propres à Laser Grid : les tests et le débogage les retrouvent ainsi. */
export const NOMS_LASER = {
  vitre: "vitre",
  passage: "passage",
  lasers: "lasers",
} as const;

type Case = OptionBase & {
  /** La vitre qui ferme la case : elle s'enfonce dans le sol à la révélation. */
  vitre: Mesh<BoxGeometry, MeshPhysicalMaterial>;
  numero: Mesh<PlaneGeometry, MeshBasicMaterial>;
  /** Le passage libre : une lueur verte et un chevron qui monte. */
  passage: Group;
  lueurPassage: Mesh<PlaneGeometry, MeshBasicMaterial>;
  /** Deux faisceaux rouges en croix, qui se tendent à la révélation. */
  lasers: Group;
  r: number;
};

/**
 * Laser Grid en 3D : une salle quadrillée de néons cyan, et une rangée de cases fermées
 * par des vitres. Révélée, la vitre s'enfonce : derrière, un passage vert, ou deux lasers
 * rouges qui se croisent.
 */
export class LaserScene extends SceneEchelle<Case> {
  constructor(stage: Stage, nb: number, lignes: number) {
    super(stage, nb, lignes);
    this.demarrer();
  }

  protected accent(): string {
    return NEON.cyan;
  }

  protected enTete(etape: number): string {
    return `LIGNE ${etape + 1} / ${this.etapes}`;
  }

  protected decor(largeur: number, hauteur: number): Object3D {
    const salle = new Group();
    const fond = new Mesh(
      new PlaneGeometry(largeur * 1.3, hauteur * 3.2),
      new MeshStandardMaterial({
        color: new Color(NEON.bg),
        metalness: 0.6,
        roughness: 0.55,
        envMap: this.stage.studio,
        envMapIntensity: 0.25,
      }),
    );
    fond.receiveShadow = true;
    salle.add(fond);
    // Le quadrillage : un trait néon cyan entre chaque colonne, et des lignes horizontales
    // régulières qui défilent avec la salle quand on avance.
    const neon = new MeshBasicMaterial({ color: new Color(NEON.cyan), transparent: true, opacity: 0.35, toneMapped: false });
    for (let i = 0; i <= this.nb; i++) {
      const x = -largeur / 2 + (largeur / this.nb) * i;
      const trait = new Mesh(new PlaneGeometry(0.03, hauteur * 3.2), neon);
      trait.position.set(x, 0, 0.01);
      salle.add(trait);
    }
    for (let k = -6; k <= 12; k++) {
      const trait = new Mesh(new PlaneGeometry(largeur * 1.3, 0.02), neon);
      trait.position.set(0, (k * hauteur) / 4 - hauteur * 0.6, 0.01);
      salle.add(trait);
    }
    salle.position.set(0, hauteur * 0.6, -PROFONDEUR - 0.02);
    return salle;
  }

  protected option(x: number, y: number, r: number, numero: number, parent: Group): Case {
    const racine = new Group();
    racine.position.set(x, y, 0);
    parent.add(racine);
    const cote = r * 1.9;

    // Le cadre chromé de la case.
    const chrome = new MeshStandardMaterial({
      color: new Color(MATIERES.chrome),
      metalness: 1,
      roughness: 0.25,
      envMap: this.stage.studio,
      envMapIntensity: 0.6,
    });
    for (const [w, h, cx, cy] of [
      [cote + 0.1, 0.07, 0, cote / 2],
      [cote + 0.1, 0.07, 0, -cote / 2],
      [0.07, cote, -cote / 2, 0],
      [0.07, cote, cote / 2, 0],
    ] as const) {
      const barre = new Mesh(new BoxGeometry(w, h, 0.12), chrome);
      barre.position.set(cx, cy, 0.02);
      barre.castShadow = true;
      racine.add(barre);
    }

    // Le fond de la case : il s'éclaire en vert (passage) ou en rouge (laser).
    const lueurPassage = new Mesh(
      new PlaneGeometry(cote, cote),
      new MeshBasicMaterial({ color: new Color(NEON.bg), toneMapped: false }),
    );
    lueurPassage.position.z = -PROFONDEUR * 0.8;
    racine.add(lueurPassage);

    // Le passage : un chevron vert qui pointe vers la ligne suivante.
    const passage = new Group();
    passage.name = NOMS_LASER.passage;
    const chevron = new Shape();
    chevron.moveTo(-r * 0.5, -r * 0.15);
    chevron.lineTo(0, r * 0.35);
    chevron.lineTo(r * 0.5, -r * 0.15);
    chevron.lineTo(r * 0.32, -r * 0.3);
    chevron.lineTo(0, r * 0.02);
    chevron.lineTo(-r * 0.32, -r * 0.3);
    chevron.closePath();
    const fleche = new Mesh(
      new ShapeGeometry(chevron),
      new MeshBasicMaterial({ color: new Color(NEON.safe), toneMapped: false }),
    );
    fleche.position.z = -PROFONDEUR * 0.5;
    passage.add(fleche);
    passage.visible = false;
    racine.add(passage);

    // Les lasers : deux faisceaux rouges en croix, et leurs émetteurs aux coins.
    const lasers = new Group();
    lasers.name = NOMS_LASER.lasers;
    const rayon = new MeshBasicMaterial({ color: new Color(NEON.alarm), toneMapped: false });
    for (const angle of [Math.PI / 4, -Math.PI / 4]) {
      const faisceau = new Mesh(new CylinderGeometry(0.035, 0.035, cote * 1.38, 10), rayon);
      faisceau.rotation.z = angle;
      faisceau.position.z = -PROFONDEUR * 0.4;
      lasers.add(faisceau);
    }
    lasers.visible = false;
    racine.add(lasers);

    // La vitre : du verre teinté cyan, qui ferme la case tant qu'elle n'est pas révélée.
    const vitre = new Mesh(
      new BoxGeometry(cote * 0.94, cote * 0.94, 0.06),
      new MeshPhysicalMaterial({
        color: new Color(NEON.cyan),
        metalness: 0.1,
        roughness: 0.08,
        transparent: true,
        opacity: VITRE,
        envMap: this.stage.studio,
        envMapIntensity: 0.45,
        emissive: new Color(NEON.cyan),
        emissiveIntensity: 0.04,
      }),
    );
    vitre.name = NOMS_LASER.vitre;
    racine.add(vitre);
    const chiffre = new Mesh(
      new PlaneGeometry(r * 0.9, r * 0.45),
      new MeshBasicMaterial({ map: texte(String(numero), NEON.text, null), transparent: true, toneMapped: false }),
    );
    chiffre.position.z = 0.04;
    racine.add(chiffre);

    // Le trace de survol : un carré néon cyan autour de la case.
    const survol = new Group();
    const trace = new MeshBasicMaterial({ color: new Color(NEON.cyan), toneMapped: false });
    for (const [w, h, cx, cy] of [
      [cote + 0.3, 0.035, 0, cote / 2 + 0.12],
      [cote + 0.3, 0.035, 0, -cote / 2 - 0.12],
      [0.035, cote + 0.24, -cote / 2 - 0.13, 0],
      [0.035, cote + 0.24, cote / 2 + 0.13, 0],
    ] as const) {
      const trait = new Mesh(new PlaneGeometry(w, h), trace);
      trait.position.set(cx, cy, 0.09);
      survol.add(trait);
    }
    racine.add(survol);

    return { racine, survol, u: 0, anim: null, contenu: "cachee", vitre, numero: chiffre, passage, lueurPassage, lasers, r };
  }

  protected remplir(c: Case, contenu: Contenu): void {
    c.contenu = contenu;
    c.passage.visible = contenu === "sure";
    c.lasers.visible = contenu === "piege";
  }

  protected peindre(c: Case, u: number): void {
    // La vitre s'enfonce dans le sol et s'efface ; le numéro part avec elle.
    const descente = c.r * 2.1 * u * u;
    c.vitre.position.y = -descente;
    c.vitre.material.opacity = VITRE * (1 - u);
    c.numero.position.y = -descente;
    c.numero.material.opacity = 1 - u;
    // Le fond s'éclaire peu à peu de la couleur de ce qu'il cache.
    const teinte = c.contenu === "sure" ? NEON.safe : c.contenu === "piege" ? NEON.alarm : NEON.bg;
    c.lueurPassage.material.color.set(NEON.bg).lerp(new Color(teinte), 0.35 * u);
    // Les lasers se tendent du centre vers les coins.
    for (const faisceau of c.lasers.children) faisceau.scale.y = Math.max(u, 0.001);
  }

  protected ambiance(t: number, piege: Case | undefined): boolean {
    const actif = super.ambiance(t, piege);
    // Les lasers grésillent tant que l'alarme s'anime.
    if (piege) {
      const vibration = actif ? 1 + 0.25 * Math.sin(t * 0.09) : 1;
      piege.lasers.children.forEach((f) => {
        f.scale.x = vibration;
        f.scale.z = vibration;
      });
    }
    return actif;
  }
}
