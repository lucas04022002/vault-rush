import {
  BackSide,
  BoxGeometry,
  CircleGeometry,
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
  TorusGeometry,
} from "three";
import { MATIERES, NEON } from "../../three/palette.ts";
import type { Stage } from "../../three/stage.ts";
import type { Contenu } from "../echelle3d/logique.ts";
import {
  DANGER_MS,
  NOMS_ECHELLE,
  type OptionBase,
  PROFONDEUR,
  SceneEchelle,
  sortie,
  texte,
} from "../echelle3d/SceneEchelle.ts";

/** Angle d'un battant ouvert : à angle droit, on le voit par la tranche (grand ouvert, il masquait la porte voisine). */
export const ANGLE_OUVERT = -1.5;
/** Durée pendant laquelle le gyrophare clignote, avant de rester allumé fixe, en ms. */
export const ALARME_MS = DANGER_MS;
/** Épaisseur d'un battant. */
const EPAISSEUR = 0.28;

/** Noms des objets : les communs, et ceux propres aux coffres. */
export const NOMS_COFFRE = {
  mur: NOMS_ECHELLE.decor,
  porte: NOMS_ECHELLE.option,
  survol: NOMS_ECHELLE.survol,
  plaque: NOMS_ECHELLE.entete,
  gyrophare: NOMS_ECHELLE.danger,
  battant: "battant",
  or: "lingots",
  alarme: "gyrophare-balise",
} as const;

type Porte = OptionBase & {
  pivot: Group;
  volant: Group;
  or: Group;
  alarme: Group;
  /** Le fond de la niche : il s'éclaire d'or chaud ou de rouge selon ce qu'elle cache. */
  fond: Mesh<CircleGeometry, MeshStandardMaterial>;
};

/**
 * Vault Rush en 3D : un mur d'acier brossé et une rangée de portes de coffre rondes. Une
 * porte révélée pivote sur ses gonds et découvre des lingots ou un gyrophare.
 */
export class VaultScene extends SceneEchelle<Porte> {
  constructor(stage: Stage, nb: number, etages: number) {
    super(stage, nb, etages);
    this.demarrer();
  }

  protected accent(): string {
    return NEON.yel;
  }

  protected enTete(etape: number): string {
    return `ÉTAGE ${etape + 1}`;
  }

  protected decor(largeur: number, hauteur: number): Object3D {
    const mur = new Mesh(
      new PlaneGeometry(largeur * 1.3, hauteur * 3.2),
      new MeshPhysicalMaterial({
        color: new Color(NEON.panel2),
        metalness: 0.7,
        roughness: 0.5,
        anisotropy: 0.6,
        envMap: this.stage.studio,
        envMapIntensity: 0.3,
      }),
    );
    mur.position.set(0, hauteur * 0.6, -PROFONDEUR - 0.02);
    mur.receiveShadow = true;
    return mur;
  }

  protected option(x: number, y: number, r: number, numero: number, parent: Group): Porte {
    const racine = new Group();
    racine.position.set(x, y, 0);
    parent.add(racine);

    const chrome = new MeshStandardMaterial({
      color: new Color(MATIERES.chrome),
      metalness: 1,
      roughness: 0.28,
      envMap: this.stage.studio,
      envMapIntensity: 0.65,
    });
    const acier = new MeshStandardMaterial({
      color: new Color(MATIERES.acier),
      metalness: 1,
      roughness: 0.45,
      envMap: this.stage.studio,
      envMapIntensity: 0.45,
    });

    // La niche : un tube sombre, ouvert vers le joueur, et son fond.
    const niche = new Mesh(
      new CylinderGeometry(r * 0.9, r * 0.9, PROFONDEUR, 40, 1, true),
      new MeshStandardMaterial({ color: new Color(NEON.bg), roughness: 0.9, side: BackSide }),
    );
    niche.rotation.x = Math.PI / 2;
    niche.position.z = -PROFONDEUR / 2;
    racine.add(niche);
    const fond = new Mesh(
      new CircleGeometry(r * 0.9, 40),
      new MeshStandardMaterial({ color: new Color(NEON.bg), roughness: 1 }),
    );
    fond.position.z = -PROFONDEUR + 0.01;
    racine.add(fond);

    // Le cadre : un anneau chromé épais autour de la niche.
    const cadre = new Mesh(new TorusGeometry(r * 0.96, r * 0.09, 16, 56), chrome);
    cadre.castShadow = true;
    racine.add(cadre);

    // Le liseré néon jaune de la porte survolée.
    const survol = new Mesh(
      new TorusGeometry(r * 1.1, 0.025, 8, 64),
      new MeshBasicMaterial({ color: new Color(NEON.yel), toneMapped: false }),
    );
    racine.add(survol);

    // Ce qu'il y a dedans : des lingots, ou un gyrophare.
    const or = this.lingots(r);
    racine.add(or);
    const alarme = this.balise(r);
    racine.add(alarme);

    // Le battant : il pivote autour de son gond, au bord gauche de la niche.
    const pivot = new Group();
    pivot.position.set(-r * 0.9, 0, EPAISSEUR / 2);
    racine.add(pivot);
    const battant = new Mesh(new CylinderGeometry(r * 0.88, r * 0.88, EPAISSEUR, 56), acier);
    battant.name = NOMS_COFFRE.battant;
    battant.rotation.x = Math.PI / 2;
    battant.position.x = r * 0.9;
    battant.castShadow = true;
    pivot.add(battant);

    // Huit pênes sur le pourtour, un volant à quatre rayons, et le numéro gravé.
    const face = new Group();
    face.position.set(r * 0.9, 0, EPAISSEUR / 2 + 0.01);
    pivot.add(face);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      const pene = new Mesh(new CylinderGeometry(r * 0.06, r * 0.06, 0.06, 16), chrome);
      pene.rotation.x = Math.PI / 2;
      pene.position.set(Math.cos(a) * r * 0.72, Math.sin(a) * r * 0.72, 0.02);
      face.add(pene);
    }
    const volant = new Group();
    face.add(volant);
    volant.add(new Mesh(new TorusGeometry(r * 0.34, r * 0.04, 12, 40), chrome));
    const moyeu = new Mesh(new CylinderGeometry(r * 0.1, r * 0.1, 0.1, 24), chrome);
    moyeu.rotation.x = Math.PI / 2;
    volant.add(moyeu);
    for (let k = 0; k < 4; k++) {
      const rayon = new Mesh(new BoxGeometry(r * 0.68, r * 0.05, r * 0.05), chrome);
      rayon.rotation.z = (k * Math.PI) / 4;
      volant.add(rayon);
    }
    volant.position.z = 0.06;
    const gravure = new Mesh(
      new PlaneGeometry(r * 0.7, r * 0.35),
      new MeshBasicMaterial({ map: texte(String(numero), NEON.yel, null), transparent: true, toneMapped: false }),
    );
    gravure.position.set(0, -r * 0.56, 0.035);
    face.add(gravure);

    return { racine, survol, u: 0, anim: null, contenu: "cachee", pivot, volant, or, alarme, fond };
  }

  protected remplir(p: Porte, c: Contenu): void {
    p.contenu = c;
    // Une niche ouverte s'éclaire : or chaud derrière les lingots, rouge vif derrière l'alarme.
    p.fond.material.emissive.set(c === "piege" ? NEON.alarm : c === "sure" ? NEON.yel : NEON.bg);
    p.fond.material.emissiveIntensity = c === "piege" ? 0.55 : c === "sure" ? 0.18 : 0;
    p.or.visible = c === "sure";
    p.alarme.visible = c === "piege";
  }

  protected peindre(p: Porte, u: number): void {
    // Le volant tourne pendant le premier tiers (on déverrouille), puis le battant pivote.
    p.volant.rotation.z = -Math.min(u / 0.35, 1) * Math.PI;
    const v = Math.min(Math.max((u - 0.25) / 0.75, 0), 1);
    // `0 +` : fermé, l'angle vaut 0 et non -0 (que les tests distinguent).
    p.pivot.rotation.y = u >= 1 ? ANGLE_OUVERT : 0 + ANGLE_OUVERT * sortie(v);
  }

  protected ambiance(t: number, piege: Porte | undefined): boolean {
    const actif = super.ambiance(t, piege);
    if (actif && piege) piege.alarme.rotation.z = t * 0.008;
    return actif;
  }

  /** Une pile de lingots d'or au fond de la niche. */
  private lingots(r: number): Group {
    const groupe = new Group();
    groupe.name = NOMS_COFFRE.or;
    const or = new MeshStandardMaterial({
      color: new Color(NEON.yel),
      metalness: 1,
      roughness: 0.22,
      envMap: this.stage.studio,
      envMapIntensity: 1.4,
      emissive: new Color(NEON.yel),
      emissiveIntensity: 0.12,
    });
    const l = r * 0.5;
    const pile = [
      [-l * 0.55, 0],
      [l * 0.55, 0],
      [0, 1],
    ] as const;
    for (const [x, etage] of pile) {
      const lingot = new Mesh(new BoxGeometry(l, r * 0.2, r * 0.36), or);
      lingot.position.set(x, -r * 0.5 + etage * r * 0.21, -PROFONDEUR * 0.55);
      groupe.add(lingot);
    }
    groupe.visible = false;
    return groupe;
  }

  /** Un gyrophare rouge au fond de la niche. */
  private balise(r: number): Group {
    const groupe = new Group();
    groupe.name = NOMS_COFFRE.alarme;
    const dome = new Mesh(
      new SphereGeometry(r * 0.3, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2),
      new MeshStandardMaterial({
        color: new Color(NEON.alarm),
        emissive: new Color(NEON.alarm),
        emissiveIntensity: 1.5,
        roughness: 0.3,
      }),
    );
    dome.rotation.x = Math.PI / 2;
    dome.position.z = -PROFONDEUR + 0.02;
    groupe.add(dome);
    groupe.visible = false;
    return groupe;
  }
}
