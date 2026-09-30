import {
  BackSide,
  BoxGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DirectionalLight,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  PointLight,
  SRGBColorSpace,
  SphereGeometry,
  TorusGeometry,
} from "three";
import { MATIERES, NEON } from "../../three/palette.ts";
import type { Stage } from "../../three/stage.ts";
import {
  type Contenu,
  DECALAGE_MS,
  disposition,
  type Evenement,
  MONTEE_MS,
  OUVERTURE_MS,
} from "./portes.ts";

/** Distance de la caméra au mur. La caméra est DE FACE : une grille de boutons tombe pile sur les portes. */
export const RECUL = 10;
/** Champ vertical de la caméra, en degrés. */
const CHAMP = 40;
/** Angle d'un battant grand ouvert (il pivote vers le joueur, gonds à gauche). */
export const ANGLE_OUVERT = -1.95;
const OUVERT = ANGLE_OUVERT;
/** Épaisseur d'un battant et profondeur d'une niche. */
const EPAISSEUR = 0.28;
const PROFONDEUR = 0.7;
/** Durée pendant laquelle le gyrophare clignote, avant de rester allumé fixe, en ms. */
export const ALARME_MS = 4000;

/** Noms des objets : les tests et le débogage les retrouvent ainsi. */
export const NOMS_COFFRE = {
  mur: "mur",
  porte: "porte",
  battant: "battant",
  or: "or",
  alarme: "alarme",
  gyrophare: "gyrophare",
  survol: "survol",
  plaque: "plaque",
} as const;

/** La largeur et la hauteur du mur visible à la distance `RECUL`, pour un rapport largeur/hauteur donné. */
export function cadreVisible(aspect: number): { largeur: number; hauteur: number } {
  const hauteur = 2 * RECUL * Math.tan(((CHAMP / 2) * Math.PI) / 180);
  return { largeur: hauteur * aspect, hauteur };
}

/** Accélère puis freine, avec un léger dépassement : un battant lourd qui s'ouvre. */
function sortie(u: number): number {
  const c = 1.4;
  const v = u - 1;
  return 1 + (c + 1) * v * v * v + c * v * v;
}

/** Le texte d'une plaque ou d'un numéro, dessiné sur un canvas. */
function texte(ecrit: string, encre: string, fond: string | null, l = 256, h = 128): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = l;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    if (fond) {
      ctx.fillStyle = fond;
      ctx.fillRect(0, 0, l, h);
    }
    ctx.fillStyle = encre;
    ctx.font = `700 ${Math.round(h * 0.52)}px 'Space Mono', ui-monospace, monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(ecrit, l / 2, h / 2 + h * 0.04, l * 0.92);
  }
  const t = new CanvasTexture(canvas);
  t.colorSpace = SRGBColorSpace;
  return t;
}

/** Une porte : son cadre, sa niche (or ou alarme dedans) et son battant qui pivote. */
type Porte = {
  racine: Group;
  pivot: Group;
  volant: Group;
  or: Group;
  alarme: Group;
  survol: Mesh;
  /** Angle actuel du battant (0 = fermé) et animation en cours. */
  angle: number;
  anim: { debut: number; de: number; vers: number } | null;
  contenu: Contenu;
};

/** Une rangée : un étage de portes et sa plaque. */
type Rangee = { groupe: Group; portes: Porte[]; plaque: Mesh<PlaneGeometry, MeshBasicMaterial> };

/**
 * Vault Rush en 3D : un mur d'acier, une rangée de portes de coffre rondes. La scène
 * ne décide rien : elle montre les contenus que le serveur a révélés et joue les
 * événements que l'écran lui passe (montée, alarme, encaissement).
 */
export class VaultScene {
  private readonly stage: Stage;
  private readonly nb: number;
  private readonly etages: number;
  private readonly monde = new Group();
  /** Deux rangées : l'étage courant, et le suivant juste au-dessus pour la montée. */
  private rangees: Rangee[] = [];
  private hauteurEtage = 1;
  private aspect = 0;
  private etage = 0;
  private temps = 0;
  /** La montée : début (ms) et étage d'arrivée ; la rangée descend d'un étage. */
  private montee: { debut: number; etage: number } | null = null;
  private readonly gyrophare: PointLight;
  private alarmeDebut: number | null = null;
  private survolee: number | null = null;
  private readonly contenusActuels: Contenu[];

  constructor(stage: Stage, nb: number, etages: number) {
    this.stage = stage;
    this.nb = nb;
    this.etages = etages;
    this.contenusActuels = Array.from({ length: nb }, () => "fermee" as Contenu);
    stage.scene.add(this.monde);

    // La lumière des ombres, et le rouge du gyrophare (éteint tant qu'il n'y a pas d'alarme).
    const soleil = new DirectionalLight(new Color(NEON.text), 1.2);
    soleil.position.set(-4, 6, 9);
    soleil.castShadow = true;
    const cote = stage.qualite === "haute" ? 2048 : 1024;
    soleil.shadow.mapSize.set(cote, cote);
    soleil.shadow.camera.left = -12;
    soleil.shadow.camera.right = 12;
    soleil.shadow.camera.top = 8;
    soleil.shadow.camera.bottom = -8;
    soleil.shadow.bias = -0.0004;
    soleil.shadow.normalBias = 0.02;
    stage.scene.add(soleil);
    this.gyrophare = new PointLight(new Color(NEON.alarm), 0, 14, 1.2);
    this.gyrophare.name = NOMS_COFFRE.gyrophare;
    this.monde.add(this.gyrophare);

    this.composer();
  }

  /** L'état tel quel, sans animation : première image, reprise, fin de partie déjà jouée. */
  montrer(contenus: Contenu[], etage: number): void {
    this.montee = null;
    this.etage = etage;
    this.monde.position.y = 0;
    const [courante] = this.rangees;
    this.ecrirePlaque(courante, etage);
    this.ecrirePlaque(this.rangees[1], etage + 1);
    courante.portes.forEach((p, i) => {
      const c = contenus[i] ?? "fermee";
      this.remplir(p, c);
      this.contenusActuels[i] = c;
      p.anim = null;
      this.poserAngle(p, c === "fermee" ? 0 : OUVERT);
    });
    this.alarmer(contenus.includes("alarme"));
    this.stage.run(this.tick);
  }

  /** Joue un événement renvoyé par le serveur ; `etageApres` est l'étage atteint. */
  jouer(ev: Evenement, etageApres: number): void {
    const [courante] = this.rangees;
    if (ev.type === "montee") {
      if (ev.porte !== null) this.ouvrir(courante.portes[ev.porte], "or", 0);
      this.montee = { debut: this.temps + (ev.porte === null ? 0 : OUVERTURE_MS), etage: etageApres };
      this.stage.run(this.tick);
      return;
    }
    // Alarme ou encaissement : la porte choisie d'abord, puis les autres en cascade.
    let decalage = 0;
    if (ev.porte !== null) {
      this.ouvrir(courante.portes[ev.porte], ev.contenus[ev.porte] ?? "or", 0);
      decalage = OUVERTURE_MS;
      if (ev.type === "alarme") this.alarmeDebut = this.temps;
    }
    let rang = 0;
    ev.contenus.forEach((c, i) => {
      if (i === ev.porte || c === "fermee") return;
      this.ouvrir(courante.portes[i], c, decalage + rang * DECALAGE_MS);
      rang++;
    });
    if (ev.type === "alarme" && ev.porte === null) this.alarmeDebut = this.temps;
    this.stage.run(this.tick);
  }

  /** Le liseré néon de la porte survolée (souris ou clavier), ou aucun. */
  survoler(porte: number | null): void {
    this.survolee = porte;
    this.rangees[0]?.portes.forEach((p, i) => {
      p.survol.visible = i === porte;
    });
    this.stage.requestRender();
  }

  private readonly tick = (dt: number): boolean => {
    this.temps += dt;
    let bouge = false;

    // Un téléphone qu'on tourne change le cadre : on recompose le mur et les portes.
    if (Math.abs(this.stage.camera.aspect - this.aspect) > 1e-3) {
      this.composer();
      this.montrerSansRelancer();
    }

    for (const rangee of this.rangees) {
      for (const p of rangee.portes) bouge = this.animerPorte(p) || bouge;
    }
    bouge = this.animerMontee() || bouge;
    bouge = this.animerAlarme() || bouge;
    return bouge;
  };

  // ---------------------------------------------------------------- composition

  /** (Re)construit le mur et les deux rangées pour le cadre actuel de la caméra. */
  private composer(): void {
    for (const r of this.rangees) this.monde.remove(r.groupe);
    const ancien = this.monde.getObjectByName(NOMS_COFFRE.mur);
    if (ancien) this.monde.remove(ancien);

    const camera = this.stage.camera;
    camera.fov = CHAMP;
    camera.position.set(0, 0, RECUL);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    this.aspect = camera.aspect;

    const { largeur, hauteur } = cadreVisible(Math.max(this.aspect, 0.3));
    this.hauteurEtage = hauteur;
    const { rayon, centres } = disposition(this.nb, largeur, hauteur);

    // Le mur d'acier brossé, assez haut pour couvrir la montée.
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
    mur.name = NOMS_COFFRE.mur;
    mur.position.set(0, hauteur * 0.6, -PROFONDEUR - 0.02);
    mur.receiveShadow = true;
    this.monde.add(mur);

    this.rangees = [0, 1].map((k) => this.rangee(k * hauteur, largeur, hauteur, rayon, centres));
  }

  private rangee(
    y: number,
    largeur: number,
    hauteur: number,
    rayon: number,
    centres: { x: number; y: number }[],
  ): Rangee {
    const groupe = new Group();
    groupe.position.y = y;
    this.monde.add(groupe);

    // Une jointure chromée sous l'étage : c'est elle qu'on voit défiler pendant la montée.
    const joint = new Mesh(
      new BoxGeometry(largeur * 1.3, 0.06, 0.1),
      new MeshStandardMaterial({
        color: new Color(MATIERES.chrome),
        metalness: 1,
        roughness: 0.3,
        envMap: this.stage.studio,
        envMapIntensity: 0.6,
      }),
    );
    joint.position.set(0, -hauteur / 2 + 0.05, -PROFONDEUR + 0.05);
    groupe.add(joint);

    const plaque = new Mesh(
      new PlaneGeometry(Math.min(largeur * 0.36, 3.2), 0.62),
      new MeshBasicMaterial({ map: texte("ÉTAGE 1", NEON.yel, NEON.bg, 512, 96), toneMapped: false }),
    );
    plaque.name = NOMS_COFFRE.plaque;
    plaque.position.set(0, hauteur / 2 - 0.62, -PROFONDEUR + 0.01);
    groupe.add(plaque);

    const portes = centres.map((c, i) => this.porte(c.x, c.y, rayon, i + 1, groupe));
    return { groupe, portes, plaque };
  }

  private porte(x: number, y: number, r: number, numero: number, parent: Group): Porte {
    const racine = new Group();
    racine.name = NOMS_COFFRE.porte;
    racine.position.set(x, y, 0);
    parent.add(racine);

    const chrome = new MeshStandardMaterial({
      color: new Color(MATIERES.chrome),
      metalness: 1,
      roughness: 0.22,
      envMap: this.stage.studio,
    });
    const acier = new MeshStandardMaterial({
      color: new Color(MATIERES.acier),
      metalness: 1,
      roughness: 0.38,
      envMap: this.stage.studio,
      envMapIntensity: 0.8,
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
      new PlaneGeometry(r * 1.8, r * 1.8),
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
    survol.name = NOMS_COFFRE.survol;
    survol.visible = false;
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
      new PlaneGeometry(r * 0.5, r * 0.25),
      new MeshBasicMaterial({ map: texte(String(numero), NEON.yel, null), transparent: true, toneMapped: false }),
    );
    gravure.position.set(0, -r * 0.56, 0.035);
    face.add(gravure);

    return { racine, pivot, volant, or, alarme, survol, angle: 0, anim: null, contenu: "fermee" };
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

  // ---------------------------------------------------------------- animation

  private remplir(p: Porte, c: Contenu): void {
    p.contenu = c;
    p.or.visible = c === "or";
    p.alarme.visible = c === "alarme";
  }

  private poserAngle(p: Porte, angle: number): void {
    p.angle = angle;
    p.pivot.rotation.y = angle;
  }

  private ouvrir(p: Porte | undefined, c: Contenu, retard: number): void {
    if (!p) return;
    this.remplir(p, c);
    p.anim = { debut: this.temps + retard, de: p.angle, vers: OUVERT };
  }

  private animerPorte(p: Porte): boolean {
    if (!p.anim) return false;
    const u = (this.temps - p.anim.debut) / OUVERTURE_MS;
    if (u < 0) return true;
    // Le volant tourne pendant le premier tiers (on déverrouille), puis le battant pivote.
    p.volant.rotation.z = -Math.min(u / 0.35, 1) * Math.PI;
    const v = Math.min(Math.max((u - 0.25) / 0.75, 0), 1);
    this.poserAngle(p, p.anim.de + (p.anim.vers - p.anim.de) * sortie(v));
    if (u >= 1) {
      this.poserAngle(p, p.anim.vers);
      p.anim = null;
      return false;
    }
    return true;
  }

  private animerMontee(): boolean {
    if (!this.montee) return false;
    const u = (this.temps - this.montee.debut) / MONTEE_MS;
    if (u < 0) return true;
    const v = Math.min(u, 1);
    // Tout le mur descend d'un étage (on monte) : l'étage suivant, déjà fermé, arrive en face.
    this.monde.position.y = -this.hauteurEtage * (v * v * (3 - 2 * v));
    if (u < 1) return true;
    // Arrivé : la rangée courante devient celle de l'étage atteint, portes fermées.
    const etage = this.montee.etage;
    this.montrer(Array.from({ length: this.nb }, () => "fermee"), etage);
    return false;
  }

  private animerAlarme(): boolean {
    if (this.alarmeDebut === null) {
      this.gyrophare.intensity = 0;
      return false;
    }
    const t = this.temps - this.alarmeDebut;
    // Un gyrophare : le rouge enfle et retombe, deux fois par seconde, pendant `ALARME_MS` ;
    // ensuite il reste allumé, fixe — la boucle s'arrête (le bilan peut rester affiché longtemps).
    const actif = t < ALARME_MS;
    this.gyrophare.intensity = actif ? 6 * (0.55 + 0.45 * Math.sin(t * 0.0125)) : 4;
    const porte = this.rangees[0]?.portes.find((p) => p.contenu === "alarme");
    if (porte) {
      porte.racine.getWorldPosition(this.gyrophare.position);
      this.gyrophare.position.z = 1.5;
      if (actif) porte.alarme.rotation.z = t * 0.008;
    }
    return actif;
  }

  private alarmer(oui: boolean): void {
    this.alarmeDebut = oui ? this.temps : null;
  }

  private ecrirePlaque(r: Rangee | undefined, etage: number): void {
    if (!r) return;
    const affiche = Math.min(etage + 1, this.etages);
    r.plaque.material.map?.dispose();
    r.plaque.material.map = texte(`ÉTAGE ${affiche}`, NEON.yel, NEON.bg, 512, 96);
    r.plaque.material.needsUpdate = true;
  }

  /** Réapplique l'état courant après une recomposition, sans relancer la boucle depuis la boucle. */
  private montrerSansRelancer(): void {
    const contenus = [...this.contenusActuels];
    const etage = this.etage;
    const [courante] = this.rangees;
    this.ecrirePlaque(courante, etage);
    this.ecrirePlaque(this.rangees[1], etage + 1);
    courante.portes.forEach((p, i) => {
      this.remplir(p, contenus[i] ?? "fermee");
      this.poserAngle(p, contenus[i] && contenus[i] !== "fermee" ? OUVERT : 0);
    });
    if (this.survolee !== null) this.survoler(this.survolee);
  }
}
