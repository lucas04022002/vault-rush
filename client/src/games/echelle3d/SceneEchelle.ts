import {
  BoxGeometry,
  CanvasTexture,
  Color,
  DirectionalLight,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  type Object3D,
  PlaneGeometry,
  PointLight,
  SRGBColorSpace,
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
} from "./logique.ts";

/**
 * La scène commune des jeux d'ÉCHELLE en 3D. Elle porte tout ce qui ne dépend pas du
 * jeu : une caméra DE FACE (une grille de boutons posée sur la scène tombe pile sur les
 * options), deux rangées (l'étape courante et la suivante, pour le passage de l'une à
 * l'autre), les révélations en cascade, l'ambiance de danger, le liseré de survol et
 * l'en-tête. Chaque jeu n'écrit que son décor, son option et la façon de la révéler.
 *
 * La scène ne décide rien : elle montre ce que le serveur a révélé et joue les événements
 * que l'écran lui passe.
 */

/** Distance de la caméra au plan des options. */
export const RECUL = 10;
/** Champ vertical de la caméra, en degrés. */
const CHAMP = 40;
/** Profondeur derrière le plan des options où se trouve le décor. */
export const PROFONDEUR = 0.7;
/** Durée pendant laquelle l'ambiance de danger s'anime, avant de rester fixe, en ms. */
export const DANGER_MS = 4000;

/** Noms communs des objets : les tests et le débogage les retrouvent ainsi. */
export const NOMS_ECHELLE = {
  decor: "decor",
  option: "option",
  survol: "survol",
  entete: "entete",
  danger: "danger",
} as const;

/** La largeur et la hauteur du plan visible à la distance `RECUL`, pour un rapport largeur/hauteur donné. */
export function cadreVisible(aspect: number): { largeur: number; hauteur: number } {
  const hauteur = 2 * RECUL * Math.tan(((CHAMP / 2) * Math.PI) / 180);
  return { largeur: hauteur * aspect, hauteur };
}

/** Accélère puis freine, avec un léger dépassement (un battant lourd, un ressort). */
export function sortie(u: number): number {
  const c = 1.4;
  const v = u - 1;
  return 1 + (c + 1) * v * v * v + c * v * v;
}

/** Un texte (en-tête, numéro) dessiné sur un canvas. */
export function texte(ecrit: string, encre: string, fond: string | null, l = 256, h = 128): CanvasTexture {
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

/** Ce que toute option porte ; chaque jeu y ajoute ses propres pièces. */
export type OptionBase = {
  racine: Group;
  /** Le liseré de survol, allumé sur l'option pointée ou sélectionnée au clavier. */
  survol: Object3D;
  /** Avancement de la révélation, de 0 (cachée) à 1 (révélée). */
  u: number;
  anim: { debut: number } | null;
  contenu: Contenu;
};

type Rangee<O> = { groupe: Group; options: O[]; entete: Mesh<PlaneGeometry, MeshBasicMaterial> };

export abstract class SceneEchelle<O extends OptionBase> {
  protected readonly stage: Stage;
  protected readonly nb: number;
  protected readonly etapes: number;
  protected readonly monde = new Group();
  protected rangees: Rangee<O>[] = [];
  protected hauteurEtape = 1;
  protected temps = 0;
  private aspect = 0;
  private etape = 0;
  private avancee: { debut: number; etape: number } | null = null;
  private dangerDebut: number | null = null;
  private survolee: number | null = null;
  private contenusActuels: Contenu[];
  /** La lumière du danger (gyrophare, laser, gyrophares de police, explosion) : éteinte au repos. */
  protected readonly lueurDanger: PointLight;

  /**
   * Les champs d'une sous-classe ne sont initialisés qu'APRÈS ce constructeur : il ne
   * construit donc rien qui dépende du jeu. La sous-classe appelle `demarrer()` à la fin
   * du sien.
   */
  constructor(stage: Stage, nb: number, etapes: number) {
    this.stage = stage;
    this.nb = nb;
    this.etapes = etapes;
    this.contenusActuels = Array.from({ length: nb }, () => "cachee" as Contenu);
    stage.scene.add(this.monde);

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

    this.lueurDanger = new PointLight(new Color(NEON.alarm), 0, 14, 1.2);
    this.lueurDanger.name = NOMS_ECHELLE.danger;
    this.monde.add(this.lueurDanger);
  }

  // ------------------------------------------------------------ ce que chaque jeu écrit

  /** Le fond (mur, salle, route, boîtier), assez haut pour couvrir le passage à l'étape suivante. */
  protected abstract decor(largeur: number, hauteur: number): Object3D;
  /** Une option (porte, case, tunnel, câble), centrée en (x, y), de demi-taille `r`, ajoutée à `parent`. */
  protected abstract option(x: number, y: number, r: number, numero: number, parent: Group): O;
  /** Dessine l'option `o` à l'avancement `u` de sa révélation (0 = cachée, 1 = révélée), selon `o.contenu`. */
  protected abstract peindre(o: O, u: number): void;
  /** Le texte de l'en-tête pour l'étape `etape` (0 = la première). */
  protected abstract enTete(etape: number): string;
  /** La couleur du jeu : en-tête et liseré de survol. */
  protected abstract accent(): string;

  /** La couleur du danger ; rouge par défaut. */
  protected couleurDanger(): string {
    return NEON.alarm;
  }

  /**
   * L'ambiance de danger, `t` ms après son début (`actif` tant que t < DANGER_MS). Par défaut,
   * la lueur enfle et retombe deux fois par seconde, puis reste fixe. Renvoie vrai tant qu'elle s'anime.
   */
  protected ambiance(t: number, piege: O | undefined): boolean {
    const actif = t < DANGER_MS;
    this.lueurDanger.intensity = actif ? 6 * (0.55 + 0.45 * Math.sin(t * 0.0125)) : 4;
    if (piege) {
      piege.racine.getWorldPosition(this.lueurDanger.position);
      this.lueurDanger.position.z = 1.5;
    }
    return actif;
  }

  /** Montre ce que cache une option (visibilité de l'or, du laser…) ; appelée avant `peindre`. */
  protected remplir(o: O, c: Contenu): void {
    o.contenu = c;
  }

  /** Le trait sous chaque rangée, qu'on voit défiler au passage d'une étape. */
  protected separateur(largeur: number): Object3D | null {
    return new Mesh(
      new BoxGeometry(largeur * 1.3, 0.06, 0.1),
      new MeshStandardMaterial({
        color: new Color(MATIERES.chrome),
        metalness: 1,
        roughness: 0.3,
        envMap: this.stage.studio,
        envMapIntensity: 0.6,
      }),
    );
  }

  // ------------------------------------------------------------ l'interface commune

  /** À appeler à la fin du constructeur de la sous-classe. */
  protected demarrer(): void {
    this.lueurDanger.color.set(this.couleurDanger());
    this.composer();
  }

  /** L'état tel quel, sans animation : première image, reprise, fin de partie déjà jouée. */
  montrer(contenus: Contenu[], etape: number): void {
    this.avancee = null;
    this.etape = etape;
    this.monde.position.y = 0;
    this.appliquer(contenus);
    this.dangerDebut = contenus.includes("piege") ? this.temps : null;
    this.stage.run(this.tick);
  }

  /** Joue un événement renvoyé par le serveur ; `etapeApres` est l'étape atteinte. */
  jouer(ev: Evenement, etapeApres: number): void {
    const [courante] = this.rangees;
    if (ev.type === "avance") {
      if (ev.porte !== null) this.reveler(courante.options[ev.porte], "sure", 0);
      this.avancee = { debut: this.temps + (ev.porte === null ? 0 : OUVERTURE_MS), etape: etapeApres };
      this.stage.run(this.tick);
      return;
    }
    // Perdu ou encaissé : l'option choisie d'abord, puis les autres en cascade.
    let decalage = 0;
    if (ev.porte !== null) {
      this.reveler(courante.options[ev.porte], ev.contenus[ev.porte] ?? "sure", 0);
      decalage = OUVERTURE_MS;
    }
    if (ev.type === "perdu") this.dangerDebut = this.temps;
    let rang = 0;
    ev.contenus.forEach((c, i) => {
      if (i === ev.porte || c === "cachee") return;
      this.reveler(courante.options[i], c, decalage + rang * DECALAGE_MS);
      rang++;
    });
    this.contenusActuels = ev.contenus.slice(0, this.nb);
    this.stage.run(this.tick);
  }

  /** Le liseré de l'option survolée (souris ou clavier), ou aucune. */
  survoler(option: number | null): void {
    this.survolee = option;
    this.rangees[0]?.options.forEach((o, i) => {
      o.survol.visible = i === option;
    });
    this.stage.requestRender();
  }

  // ------------------------------------------------------------ mécanique

  private readonly tick = (dt: number): boolean => {
    this.temps += dt;
    let bouge = false;
    // Un téléphone qu'on tourne change le cadre : on recompose et on réapplique l'état.
    if (Math.abs(this.stage.camera.aspect - this.aspect) > 1e-3) {
      this.composer();
      this.appliquer(this.contenusActuels);
      if (this.survolee !== null) this.survoler(this.survolee);
    }
    for (const rangee of this.rangees) {
      for (const o of rangee.options) bouge = this.animer(o) || bouge;
    }
    bouge = this.animerAvancee() || bouge;
    bouge = this.animerDanger() || bouge;
    return bouge;
  };

  private composer(): void {
    for (const r of this.rangees) this.monde.remove(r.groupe);
    const ancien = this.monde.getObjectByName(NOMS_ECHELLE.decor);
    if (ancien) this.monde.remove(ancien);

    const camera = this.stage.camera;
    camera.fov = CHAMP;
    camera.position.set(0, 0, RECUL);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    this.aspect = camera.aspect;

    const { largeur, hauteur } = cadreVisible(Math.max(this.aspect, 0.3));
    this.hauteurEtape = hauteur;
    const { rayon, centres } = disposition(this.nb, largeur, hauteur);

    const decor = this.decor(largeur, hauteur);
    decor.name = NOMS_ECHELLE.decor;
    this.monde.add(decor);

    this.rangees = [0, 1].map((k) => {
      const groupe = new Group();
      groupe.position.y = k * hauteur;
      this.monde.add(groupe);
      const trait = this.separateur(largeur);
      if (trait) {
        trait.position.set(0, -hauteur / 2 + 0.05, -PROFONDEUR + 0.05);
        groupe.add(trait);
      }
      const entete = new Mesh(
        new PlaneGeometry(Math.min(largeur * 0.4, 3.6), 0.62),
        new MeshBasicMaterial({ map: texte("", this.accent(), NEON.bg, 512, 96), toneMapped: false }),
      );
      entete.name = NOMS_ECHELLE.entete;
      entete.position.set(0, hauteur / 2 - 0.62, -PROFONDEUR + 0.02);
      groupe.add(entete);
      const options = centres.map((c, i) => {
        const o = this.option(c.x, c.y, rayon, i + 1, groupe);
        o.racine.name = NOMS_ECHELLE.option;
        o.survol.name = NOMS_ECHELLE.survol;
        o.survol.visible = false;
        return o;
      });
      return { groupe, options, entete };
    });
  }

  /** Pose les contenus sur la rangée courante (révélées d'un coup) et écrit les en-têtes. */
  private appliquer(contenus: Contenu[]): void {
    this.contenusActuels = Array.from({ length: this.nb }, (_, i) => contenus[i] ?? "cachee");
    const [courante, suivante] = this.rangees;
    this.ecrireEntete(courante, this.etape);
    this.ecrireEntete(suivante, this.etape + 1);
    courante.options.forEach((o, i) => this.poser(o, this.contenusActuels[i]));
    suivante.options.forEach((o) => this.poser(o, "cachee"));
  }

  private poser(o: O, c: Contenu): void {
    this.remplir(o, c);
    o.anim = null;
    o.u = c === "cachee" ? 0 : 1;
    this.peindre(o, o.u);
  }

  private reveler(o: O | undefined, c: Contenu, retard: number): void {
    if (!o) return;
    this.remplir(o, c);
    o.anim = { debut: this.temps + retard };
  }

  private animer(o: O): boolean {
    if (!o.anim) return false;
    const u = (this.temps - o.anim.debut) / OUVERTURE_MS;
    if (u < 0) return true;
    o.u = Math.min(u, 1);
    this.peindre(o, o.u);
    if (u >= 1) {
      o.anim = null;
      return false;
    }
    return true;
  }

  private animerAvancee(): boolean {
    if (!this.avancee) return false;
    const u = (this.temps - this.avancee.debut) / MONTEE_MS;
    if (u < 0) return true;
    const v = Math.min(u, 1);
    // Toute la scène descend d'une étape : l'étape suivante, déjà cachée, arrive en face.
    this.monde.position.y = -this.hauteurEtape * (v * v * (3 - 2 * v));
    if (u < 1) return true;
    this.montrer(Array.from({ length: this.nb }, () => "cachee"), this.avancee.etape);
    return false;
  }

  private animerDanger(): boolean {
    if (this.dangerDebut === null) {
      this.lueurDanger.intensity = 0;
      return false;
    }
    const piege = this.rangees[0]?.options.find((o) => o.contenu === "piege");
    return this.ambiance(this.temps - this.dangerDebut, piege);
  }

  private ecrireEntete(r: Rangee<O> | undefined, etape: number): void {
    if (!r) return;
    r.entete.material.map?.dispose();
    r.entete.material.map = texte(this.enTete(Math.min(etape, this.etapes - 1)), this.accent(), NEON.bg, 512, 96);
    r.entete.material.needsUpdate = true;
  }
}
