import {
  BoxGeometry,
  Color,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  type Object3D,
  PlaneGeometry,
  Shape,
  ShapeGeometry,
  SphereGeometry,
  TorusGeometry,
} from "three";
import { MATIERES, NEON } from "../../three/palette.ts";
import type { Stage } from "../../three/stage.ts";
import type { Contenu } from "../echelle3d/logique.ts";
import { type OptionBase, PROFONDEUR, SceneEchelle, sortie, texte } from "../echelle3d/SceneEchelle.ts";

/** Noms propres à Getaway : les tests et le débogage les retrouvent ainsi. */
export const NOMS_GETAWAY = {
  voie: "voie-libre",
  barrage: "barrage",
} as const;

type Tunnel = OptionBase & {
  /** L'intérieur du tunnel : noir tant qu'on n'y voit rien, éclairé quand la voie est libre. */
  interieur: Mesh<ShapeGeometry, MeshBasicMaterial>;
  /** La voie libre : des bandes blanches qui filent dans le tunnel. */
  voie: Group;
  /** Le barrage : une barrière rayée qui tombe, et deux gyrophares de police. */
  barrage: Group;
  gyros: Mesh<SphereGeometry, MeshBasicMaterial>[];
  r: number;
};

/**
 * Getaway en 3D : un mur de béton de nuit, et une rangée d'entrées de tunnel, chacune sous
 * son panneau de route. Révélé, le tunnel s'allume sur une voie libre — ou une barrière de
 * police tombe devant lui, gyrophares bleu et rouge.
 */
export class GetawayScene extends SceneEchelle<Tunnel> {
  constructor(stage: Stage, nb: number, troncons: number) {
    super(stage, nb, troncons);
    this.demarrer();
  }

  protected accent(): string {
    return NEON.mag;
  }

  protected enTete(etape: number): string {
    return `TRONÇON ${etape + 1} / ${this.etapes}`;
  }

  protected decor(largeur: number, hauteur: number): Object3D {
    const nuit = new Group();
    const beton = new Mesh(
      new PlaneGeometry(largeur * 1.3, hauteur * 3.2),
      // Un béton violet-gris : assez clair pour qu'on le voie de nuit (en `panel`, il était noir).
      new MeshStandardMaterial({ color: new Color(MATIERES.acier), roughness: 0.92, metalness: 0.05 }),
    );
    beton.receiveShadow = true;
    nuit.add(beton);
    // Une bande néon magenta en bas de chaque tronçon : la vitesse se voit quand elle défile.
    const neon = new MeshBasicMaterial({ color: new Color(NEON.mag), transparent: true, opacity: 0.55, toneMapped: false });
    for (let k = -2; k <= 4; k++) {
      const bande = new Mesh(new PlaneGeometry(largeur * 1.3, 0.05), neon);
      bande.position.set(0, k * hauteur - hauteur * 0.6 - hauteur * 0.38, 0.01);
      nuit.add(bande);
    }
    nuit.position.set(0, hauteur * 0.6, -PROFONDEUR - 0.02);
    return nuit;
  }

  protected option(x: number, y: number, r: number, numero: number, parent: Group): Tunnel {
    const racine = new Group();
    racine.position.set(x, y, 0);
    parent.add(racine);

    const beton = new MeshStandardMaterial({
      color: new Color(MATIERES.acier),
      roughness: 0.7,
      metalness: 0.2,
      envMap: this.stage.studio,
      envMapIntensity: 0.3,
    });

    // L'intérieur : la bouche du tunnel, noire, qui s'éclaire (une voûte sur deux murs droits).
    const bas = -r * 0.62;
    const bouche = new Shape();
    bouche.moveTo(-r * 0.86, bas);
    bouche.lineTo(r * 0.86, bas);
    bouche.lineTo(r * 0.86, 0);
    bouche.absarc(0, 0, r * 0.86, 0, Math.PI, false);
    bouche.lineTo(-r * 0.86, bas);
    const interieur = new Mesh(
      new ShapeGeometry(bouche, 24),
      new MeshBasicMaterial({ color: new Color(NEON.bg), toneMapped: false }),
    );
    interieur.position.z = -PROFONDEUR * 0.7;
    racine.add(interieur);

    // L'entrée : une voûte de béton en demi-cercle, posée sur deux piliers.
    const voute = new Mesh(new TorusGeometry(r * 0.93, r * 0.12, 14, 40, Math.PI), beton);
    voute.castShadow = true;
    racine.add(voute);
    for (const cote of [-1, 1]) {
      const pilier = new Mesh(new BoxGeometry(r * 0.24, -bas, r * 0.24), beton);
      pilier.position.set(cote * r * 0.93, bas / 2, 0);
      pilier.castShadow = true;
      racine.add(pilier);
    }

    // La chaussée qui entre dans le tunnel.
    const chaussee = new Mesh(
      new PlaneGeometry(r * 1.5, PROFONDEUR * 1.4),
      new MeshStandardMaterial({ color: new Color(NEON.bg), roughness: 0.95 }),
    );
    chaussee.rotation.x = -Math.PI / 2;
    chaussee.position.set(0, -r * 0.62, -PROFONDEUR * 0.35);
    racine.add(chaussee);

    // Le panneau de route, au-dessus de l'arche.
    const panneau = new Mesh(
      new PlaneGeometry(r * 1.4, r * 0.5),
      new MeshBasicMaterial({ map: texte(`ROUTE ${numero}`, NEON.text, NEON.panel2, 256, 96), toneMapped: false }),
    );
    panneau.position.set(0, r * 1.3, 0.06);
    racine.add(panneau);

    // La voie libre : trois bandes blanches qui s'enfoncent vers le fond du tunnel.
    const voie = new Group();
    voie.name = NOMS_GETAWAY.voie;
    const blanc = new MeshBasicMaterial({ color: new Color(NEON.text), toneMapped: false });
    for (let k = 0; k < 3; k++) {
      const bande = new Mesh(new PlaneGeometry(r * 0.08, r * 0.22), blanc);
      bande.rotation.x = -Math.PI / 2;
      bande.position.set(0, -r * 0.6, -PROFONDEUR * (0.1 + k * 0.22));
      voie.add(bande);
    }
    voie.visible = false;
    racine.add(voie);

    // Le barrage : une barrière rayée rouge et blanc, et deux gyrophares, un bleu, un rouge.
    const barrage = new Group();
    barrage.name = NOMS_GETAWAY.barrage;
    const rouge = new MeshStandardMaterial({ color: new Color(NEON.alarm), roughness: 0.5 });
    const blancMat = new MeshStandardMaterial({ color: new Color(NEON.text), roughness: 0.5 });
    const rayures = 6;
    for (let k = 0; k < rayures; k++) {
      const pan = new Mesh(new BoxGeometry((r * 1.7) / rayures, r * 0.2, 0.08), k % 2 ? blancMat : rouge);
      pan.position.set(-r * 0.85 + ((k + 0.5) * r * 1.7) / rayures, 0, 0);
      pan.castShadow = true;
      barrage.add(pan);
    }
    const gyros = [NEON.cyan, NEON.alarm].map((couleur, k) => {
      const gyro = new Mesh(
        new SphereGeometry(r * 0.11, 16, 12),
        new MeshBasicMaterial({ color: new Color(couleur), toneMapped: false }),
      );
      gyro.position.set(k === 0 ? -r * 0.72 : r * 0.72, r * 0.18, 0.05);
      barrage.add(gyro);
      return gyro;
    });
    barrage.position.set(0, r * 1.4, 0.2);
    barrage.visible = false;
    racine.add(barrage);

    // Le liseré de survol : un anneau néon magenta autour de l'arche.
    const survol = new Mesh(
      new TorusGeometry(r * 1.12, 0.025, 8, 48, Math.PI),
      new MeshBasicMaterial({ color: new Color(NEON.mag), toneMapped: false }),
    );
    racine.add(survol);

    return { racine, survol, u: 0, anim: null, contenu: "cachee", interieur, voie, barrage, gyros, r };
  }

  protected remplir(t: Tunnel, c: Contenu): void {
    t.contenu = c;
    t.voie.visible = c === "sure";
    t.barrage.visible = c === "piege";
  }

  protected peindre(t: Tunnel, u: number): void {
    // Le tunnel s'allume : vert sur une voie libre, rouge derrière un barrage.
    const teinte = t.contenu === "sure" ? NEON.safe : t.contenu === "piege" ? NEON.alarm : NEON.bg;
    t.interieur.material.color.set(NEON.bg).lerp(new Color(teinte), (t.contenu === "sure" ? 0.45 : 0.3) * u);
    // La barrière tombe devant l'entrée, avec un rebond.
    t.barrage.position.y = t.r * 1.4 * (1 - sortie(u)) - t.r * 0.1 * sortie(u);
  }

  protected ambiance(temps: number, piege: Tunnel | undefined): boolean {
    const actif = super.ambiance(temps, piege);
    // Les gyrophares de police : bleu, puis rouge, quatre fois par seconde.
    const bleu = Math.floor(temps / 250) % 2 === 0;
    this.lueurDanger.color.set(actif ? (bleu ? NEON.cyan : NEON.alarm) : NEON.alarm);
    if (piege) {
      const [g1, g2] = piege.gyros;
      g1.visible = !actif || bleu;
      g2.visible = !actif || !bleu;
    }
    return actif;
  }
}
