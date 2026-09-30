import {
  AdditiveBlending,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  DirectionalLight,
  Group,
  InstancedMesh,
  LatheGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  PointLight,
  Points,
  PointsMaterial,
  SphereGeometry,
  SRGBColorSpace,
  Vector2,
  Vector3,
} from "three";
import { formatMultiplier } from "../../lib/format.ts";
import { MATIERES, NEON } from "../../three/palette.ts";
import type { Stage } from "../../three/stage.ts";
import { heatOf, type SlotHeat } from "../heat.ts";
import { estGrosGain, RANGEES_AU_RALENTI } from "./rythme.ts";
import {
  type Focus,
  follow,
  gemPosition,
  overview,
  type Point,
  pinPosition,
  restPosition,
  SLOT_HEIGHT,
  slotCenter,
} from "./trajectory.ts";

/** Inclinaison du plateau : le haut s'éloigne, les cases viennent vers le joueur (≈ 20°). */
const TILT = -0.35;
/** Le diamant et les clous sont un peu devant le fond du plateau. */
const GEM_Z = 0.15;
/**
 * Recul de la caméra au-delà du cadrage exact. L'inclinaison rapproche les cases du joueur,
 * donc elles paraissent plus larges que le plan visé : sans cette marge, les cases des bords
 * touchent le cadre sur un téléphone (mesuré le 29/09/2026 : 1,05 ne suffisait pas).
 */
const FIT_MARGIN = 1.15;
/** Temps caractéristique du glissement de la caméra, en ms. */
const CAMERA_MS = 140;
/** Durée de la gerbe d'éclats et de la pulsation de la case, en ms. */
const SPARK_MS = 900;
const PULSE_MS = 320;
const SPARK_COUNT = 64;
/** Multiplicateur à partir duquel l'arrivée jaillit. */
export const CELEBRATE_FROM = 2;
/** Durée de la vibration d'un clou touché, en ms. */
export const CLOU_MS = 260;
/** Largeur (en cases) du cadre pendant le ralenti d'un gros gain : la caméra se resserre. */
export const ZOOM_WIDTH = 4.5;
/** Secousse de la caméra à l'arrivée d'un gros gain : durée (ms) et amplitude (en cases). */
const SECOUSSE_MS = 350;
const SECOUSSE_AMPLITUDE = 0.07;
/** Couleur de repos du chrome des clous (légèrement lavande, comme la salle). */
const CHROME = MATIERES.chrome;

/**
 * Le profil d'un diamant taille brillant, tourné autour de l'axe vertical en 8 facettes :
 * pointe du pavillon en bas, rondiste, couronne, table en haut.
 */
const PROFIL_BRILLANT = [
  new Vector2(0.001, -0.34),
  new Vector2(0.24, 0),
  new Vector2(0.24, 0.035),
  new Vector2(0.16, 0.13),
  new Vector2(0.001, 0.13),
];

/** Noms des objets de la scène : les tests et les outils de débogage les retrouvent ainsi. */
export const NOMS = {
  diamant: "diamant",
  clous: "clous",
  case: "case",
  etiquette: "etiquette",
  plateau: "plateau",
} as const;

export type DiamondState = { path: boolean[] | null; row: number; landedSlot: number | null };

/** Les couleurs d'une case selon sa chaleur, comme en 2D (`diamond-drop.css`). */
const CASE: Record<SlotHeat, { fond: string; lueur: string; intensite: number; encre: string }> = {
  chaud: { fond: NEON.gem, lueur: NEON.gem, intensite: 0.25, encre: NEON.gemInk },
  tiede: { fond: NEON.panel2, lueur: NEON.gemShadow, intensite: 0.3, encre: NEON.gem },
  froid: { fond: NEON.panel2, lueur: NEON.panel2, intensite: 0, encre: NEON.dim },
};

/** Le multiplicateur écrit sur une texture, lisible de près comme de loin. */
function etiquette(texte: string, encre: string): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = encre;
    ctx.font = "700 64px 'Space Mono', ui-monospace, monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(texte, 128, 68, 244);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/**
 * Diamond Drop en 3D. La scène ne choisit RIEN : elle reçoit le chemin tiré par
 * le serveur et la rangée où en est l'écran, et elle dessine le diamant là où
 * `gemPosition` le place. L'écran reste le seul maître du temps ; la scène
 * lisse seulement le passage d'une rangée à la suivante.
 */
export class DiamondScene {
  private readonly stage: Stage;
  private readonly rows: number;
  private readonly slots: number[];
  private readonly board = new Group();
  private readonly gem: Mesh;
  private readonly clous: InstancedMesh<SphereGeometry, MeshStandardMaterial>;
  /** Clous touchés qui vibrent encore : indice d'instance → âge de la vibration (ms). */
  private readonly vibrations = new Map<number, number>();
  /** Dernière rangée entière franchie par le diamant affiché (pour savoir quel clou il touche). */
  private dernierClou = -1;
  private secousse = 0;
  private readonly cases: Mesh<BoxGeometry, MeshStandardMaterial>[] = [];
  private readonly etiquettes: Mesh<PlaneGeometry, MeshBasicMaterial>[] = [];
  private readonly camera = { x: 0, y: 0, width: 1, height: 1 };
  private readonly cible = new Vector3();
  private readonly focale = new Vector3();

  private path: boolean[] | null = null;
  private affichee = 0;
  private visee = 0;
  private posee: number | null = null;
  private arrivee = false;
  /**
   * Vrai quand le chemin arrive déjà terminé (plateau remonté ou repris après l'arrivée) :
   * la case s'allume, mais sans gerbe ni pulsation — la fête a déjà eu lieu.
   */
  private arriveeSilencieuse = false;
  private rowMs = 140;
  private pulse = 0;
  private eclats: Points<BufferGeometry, PointsMaterial> | null = null;
  private vitesses: Float32Array | null = null;
  private ageEclats = 0;

  constructor(stage: Stage, rows: number, slots: number[]) {
    this.stage = stage;
    this.rows = rows;
    this.slots = slots;
    this.board.rotation.x = TILT;
    stage.scene.add(this.board);

    // Le plateau : métal brossé sombre (l'anisotropie étire les reflets du studio comme un
    // métal poli dans un sens), qui reçoit les ombres du diamant et des clous.
    const vue = overview(rows);
    const fond = new Mesh(
      new PlaneGeometry(vue.width + 0.6, vue.height + 0.6),
      new MeshPhysicalMaterial({
        color: new Color(NEON.panel2),
        metalness: 0.85,
        roughness: 0.4,
        anisotropy: 0.9,
        anisotropyRotation: Math.PI / 2,
        envMapIntensity: 0.45,
      }),
    );
    fond.name = NOMS.plateau;
    fond.position.set(0, vue.y, -0.25);
    fond.receiveShadow = true;
    this.board.add(fond);

    // Un cadre chromé autour du plateau : quatre baguettes fines.
    const chrome = new MeshStandardMaterial({ color: new Color(CHROME), metalness: 1, roughness: 0.18 });
    const largeur = vue.width + 0.6;
    const hauteur = vue.height + 0.6;
    for (const [w, h, x, y] of [
      [largeur + 0.16, 0.08, 0, vue.y + hauteur / 2],
      [largeur + 0.16, 0.08, 0, vue.y - hauteur / 2],
      [0.08, hauteur, -largeur / 2, vue.y],
      [0.08, hauteur, largeur / 2, vue.y],
    ] as const) {
      const baguette = new Mesh(new BoxGeometry(w, h, 0.12), chrome);
      baguette.position.set(x, y, -0.19);
      this.board.add(baguette);
    }

    // Les clous : une seule géométrie instanciée, en chrome qui reflète le studio. Chaque
    // instance a sa couleur (un clou touché s'éclaire en améthyste) et sa taille (il vibre).
    const total = (rows * (rows + 1)) / 2;
    this.clous = new InstancedMesh(
      new SphereGeometry(0.085, 20, 16),
      new MeshStandardMaterial({ color: new Color(MATIERES.cristal), metalness: 1, roughness: 0.12 }),
      total,
    );
    this.clous.name = NOMS.clous;
    this.clous.castShadow = true;
    const repos = new Color(CHROME);
    let n = 0;
    for (let rangee = 0; rangee < rows; rangee++) {
      for (let i = 0; i <= rangee; i++) {
        this.placerClou(n, 1);
        this.clous.setColorAt(n, repos);
        n++;
      }
    }
    this.board.add(this.clous);

    // La lumière qui projette les ombres, fixée au plateau (elle s'incline avec lui), cadrée
    // sur lui seul pour que la carte d'ombres garde toute sa finesse.
    const soleil = new DirectionalLight(new Color(NEON.text), 1.3);
    soleil.position.set(vue.width * 0.15, vue.y + vue.height * 0.35, 8);
    soleil.target.position.set(0, vue.y, 0);
    soleil.castShadow = true;
    const cote = stage.qualite === "haute" ? 2048 : 1024;
    soleil.shadow.mapSize.set(cote, cote);
    soleil.shadow.camera.left = -vue.width / 2 - 1;
    soleil.shadow.camera.right = vue.width / 2 + 1;
    soleil.shadow.camera.top = vue.height / 2 + 1;
    soleil.shadow.camera.bottom = -vue.height / 2 - 1;
    soleil.shadow.camera.near = 1;
    soleil.shadow.camera.far = 20;
    soleil.shadow.bias = -0.0004;
    soleil.shadow.normalBias = 0.02;
    this.board.add(soleil, soleil.target);

    // Les cases, colorées par leur chaleur, le multiplicateur écrit sur la face.
    slots.forEach((multiplicateur, index) => {
      const teinte = CASE[heatOf(index, slots.length)];
      const centre = slotCenter(index, rows);
      const boite = new Mesh(
        new BoxGeometry(0.92, SLOT_HEIGHT, 0.3),
        new MeshStandardMaterial({
          color: new Color(teinte.fond),
          emissive: new Color(teinte.lueur),
          emissiveIntensity: teinte.intensite,
          // Laqué : un peu de reflet du studio, sans devenir un miroir qui noierait le chiffre.
          metalness: 0.15,
          roughness: 0.32,
        }),
      );
      boite.name = NOMS.case;
      boite.receiveShadow = true;
      boite.position.set(centre.x, centre.y - SLOT_HEIGHT / 2, 0);
      this.board.add(boite);
      this.cases.push(boite);

      const texte = new Mesh(
        new PlaneGeometry(0.9, 0.45),
        new MeshBasicMaterial({
          map: etiquette(formatMultiplier(multiplicateur), teinte.encre),
          transparent: true,
          depthWrite: false,
        }),
      );
      texte.name = NOMS.etiquette;
      texte.position.set(centre.x, centre.y - SLOT_HEIGHT / 2, 0.16);
      this.board.add(texte);
      this.etiquettes.push(texte);
    });

    // Le diamant : taille brillant à 8 facettes, en cristal. La transmission laisse passer la
    // lumière, l'indice 2,42 est celui du diamant, la dispersion sépare les couleurs (les
    // éclats arc-en-ciel) et l'iridescence irise les facettes quand il tourne.
    this.gem = new Mesh(
      new LatheGeometry(PROFIL_BRILLANT, 8),
      new MeshPhysicalMaterial({
        color: new Color(MATIERES.cristal),
        metalness: 0,
        roughness: 0.02,
        transmission: 1,
        thickness: 0.6,
        ior: 2.42,
        dispersion: 4,
        iridescence: 0.5,
        iridescenceIOR: 1.6,
        attenuationColor: new Color(NEON.gem),
        attenuationDistance: 1.2,
        envMapIntensity: 2.2,
        flatShading: true,
      }),
    );
    this.gem.name = NOMS.diamant;
    this.gem.castShadow = true;
    // Une petite lumière emportée par le diamant : elle fait briller les clous qu'il frôle.
    const eclat = new PointLight(new Color(NEON.text), 1.2, 1.6, 2);
    eclat.position.set(0, 0.1, 0.35);
    this.gem.add(eclat);
    this.board.add(this.gem);

    // Caméra : d'emblée sur tout le plateau, sans glissement au premier affichage.
    Object.assign(this.camera, vue);
    this.placerCamera();
  }

  setRowMs(ms: number): void {
    this.rowMs = ms;
  }

  /** Le nouvel état venu de l'écran. Un nouveau chemin (ou une reprise) saute à la rangée courante. */
  update({ path, row, landedSlot }: DiamondState): void {
    if (path !== this.path) {
      this.path = path;
      // Un lâcher neuf part du diamant en attente (rangée « −1 ») ; une reprise saute à la rangée courante.
      this.affichee = path && row === 0 ? -1 : row;
      this.arriveeSilencieuse = path !== null && row >= path.length;
      // Une reprise ne refait pas tinter les clous déjà passés.
      this.dernierClou = Math.floor(this.affichee);
      this.eteindre();
    }
    this.visee = row;
    this.posee = landedSlot;
    if (landedSlot === null) this.eteindre();
    this.stage.run(this.tick);
  }

  private readonly tick = (dt: number): boolean => {
    let bouge = false;
    if (this.affichee < this.visee) {
      // Jamais plus d'une rangée de retard sur la rangée de l'écran : si les images se font rares
      // (onglet en arrière-plan, téléphone qui peine), le diamant rattrape. Une rangée reste
      // possible : c'est pourquoi l'écran retient le bilan et le son d'une rangée en 3D, le temps
      // que le diamant touche sa case.
      this.affichee = Math.max(this.affichee, this.visee - 1);
      this.affichee = Math.min(this.visee, this.affichee + dt / this.rowMs);
      bouge = true;
    }

    const p = this.position();
    this.gem.position.set(p.x, p.y, GEM_Z);
    if (bouge) {
      this.gem.rotation.y += dt * 0.008;
      this.toucherClous();
    }

    if (
      this.path &&
      this.posee !== null &&
      !this.arrivee &&
      this.affichee >= this.path.length
    ) {
      this.arriver(this.posee);
    }

    const secoue = this.secousse > 0;
    this.secousse = Math.max(0, this.secousse - dt);
    const camBouge = this.suivre(this.cadrage(p), dt);
    const pulse = this.pulser(dt);
    const eclats = this.animerEclats(dt);
    const vibre = this.vibrer(dt);
    return bouge || camBouge || pulse || eclats || vibre || secoue;
  };

  /** La case tirée par le serveur : le nombre de « à droite » du chemin. */
  private caseTiree(): number | null {
    return this.path ? this.path.filter(Boolean).length : null;
  }

  /** Vrai pendant le ralenti d'un gros gain (les dernières rangées). */
  private auRalenti(): boolean {
    const slot = this.caseTiree();
    if (!this.path || slot === null) return false;
    return (
      estGrosGain(this.slots[slot] ?? 0) &&
      this.affichee >= this.path.length - RANGEES_AU_RALENTI
    );
  }

  /** Chaque rangée entière franchie : le clou que le diamant vient de toucher se met à vibrer. */
  private toucherClous(): void {
    if (!this.path) return;
    const atteinte = Math.min(Math.floor(this.affichee), this.path.length - 1);
    for (let rangee = this.dernierClou + 1; rangee <= atteinte; rangee++) {
      if (rangee < 0) continue;
      // Le clou touché à la rangée `rangee` : celui dont l'indice est le nombre de « à droite »
      // déjà faits — exactement celui sur lequel `gemPosition` pose le diamant.
      const index = this.path.slice(0, rangee).filter(Boolean).length;
      this.vibrations.set((rangee * (rangee + 1)) / 2 + index, 0);
    }
    this.dernierClou = Math.max(this.dernierClou, atteinte);
  }

  /** Les clous touchés grossissent et s'éclairent, puis reviennent au chrome. */
  private vibrer(dt: number): boolean {
    if (this.vibrations.size === 0) return false;
    const repos = new Color(CHROME);
    const eclaire = new Color(NEON.gem);
    for (const [instance, age] of this.vibrations) {
      const suivant = age + dt;
      const u = Math.min(suivant / CLOU_MS, 1);
      // Un coup sec puis une oscillation qui s'éteint.
      this.placerClou(instance, 1 + 0.45 * (1 - u) * Math.cos(u * Math.PI * 3));
      this.clous.setColorAt(instance, eclaire.clone().lerp(repos, u));
      if (u >= 1) this.vibrations.delete(instance);
      else this.vibrations.set(instance, suivant);
    }
    this.clous.instanceMatrix.needsUpdate = true;
    if (this.clous.instanceColor) this.clous.instanceColor.needsUpdate = true;
    return this.vibrations.size > 0;
  }

  /** Place le clou n° `instance` (rangée par rangée, de gauche à droite) à l'échelle voulue. */
  private placerClou(instance: number, echelle: number): void {
    let rangee = Math.floor((Math.sqrt(8 * instance + 1) - 1) / 2);
    if (((rangee + 1) * (rangee + 2)) / 2 <= instance) rangee++;
    const index = instance - (rangee * (rangee + 1)) / 2;
    const p = pinPosition(rangee, index);
    const objet = new Object3D();
    objet.position.set(p.x, p.y, GEM_Z);
    objet.scale.setScalar(echelle);
    objet.updateMatrix();
    this.clous.setMatrixAt(instance, objet.matrix);
  }

  /** Où dessiner le diamant : en attente, entre l'attente et le premier clou, ou sur le chemin. */
  private position(): Point {
    if (!this.path) return restPosition();
    if (this.affichee >= 0) return gemPosition(this.path, this.affichee);
    const depart = restPosition();
    const clou = gemPosition(this.path, 0);
    const u = this.affichee + 1;
    return { x: depart.x + (clou.x - depart.x) * u, y: depart.y + (clou.y - depart.y) * u };
  }

  /**
   * Ce que la caméra vise : tout le plateau au repos, le diamant pendant la chute (un peu en
   * avance vers le bas), et la case d'arrivée une fois posé — centrée, sinon la moitié basse
   * du cadre ne montrait que le vide sous les cases.
   */
  private cadrage(p: Point): Focus {
    if (!this.path) return overview(this.rows);
    const suivi = follow(this.rows, p);
    // Gros gain : pendant le ralenti, la caméra se resserre sur le diamant.
    const cadre = this.auRalenti() ? { ...suivi, width: Math.min(suivi.width, ZOOM_WIDTH) } : suivi;
    return this.arrivee ? { ...cadre, y: p.y - SLOT_HEIGHT } : cadre;
  }

  /** La caméra glisse vers ce qu'elle doit montrer ; `true` tant qu'elle n'y est pas. */
  private suivre(focus: Focus, dt: number): boolean {
    const k = 1 - Math.exp(-dt / CAMERA_MS);
    let ecart = 0;
    for (const cle of ["x", "y", "width", "height"] as const) {
      const d = focus[cle] - this.camera[cle];
      this.camera[cle] += d * k;
      ecart = Math.max(ecart, Math.abs(d));
    }
    this.placerCamera();
    return ecart > 1e-3;
  }

  /** Recule la caméra juste assez pour voir `width` × `height` autour du centre visé. */
  private placerCamera(): void {
    const camera = this.stage.camera;
    const vfov = (camera.fov * Math.PI) / 180;
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * camera.aspect);
    const distance = Math.max(
      this.camera.width / 2 / Math.tan(hfov / 2),
      this.camera.height / 2 / Math.tan(vfov / 2),
    ) * FIT_MARGIN;

    this.board.updateMatrixWorld();
    this.cible.set(this.camera.x, this.camera.y, 0);
    this.board.localToWorld(this.cible);
    // La secousse d'un gros gain : une oscillation amortie, la même à chaque fois.
    const force = (this.secousse / SECOUSSE_MS) * SECOUSSE_AMPLITUDE;
    const dx = force * Math.sin(this.secousse * 0.09);
    const dy = force * Math.cos(this.secousse * 0.11);
    camera.position.set(this.cible.x + dx, this.cible.y + distance * 0.12 + dy, this.cible.z + distance);
    camera.lookAt(this.cible);

    // La mise au point suit le diamant : le reste du plateau part doucement dans le flou.
    this.gem.getWorldPosition(this.focale);
    this.stage.setFocus(camera.position.distanceTo(this.focale));
  }

  private arriver(slot: number): void {
    this.arrivee = true;
    const boite = this.cases[slot];
    if (boite) {
      // Même une case banale s'allume en améthyste : c'est ELLE que le joueur doit voir.
      boite.material.emissive.set(NEON.gem);
      // 0,5 et pas plus : au-delà, le halo rend la case blanche et son multiplicateur illisible.
      boite.material.emissiveIntensity = 0.5;
    }
    // Sur la case allumée, le chiffre passe en sombre (la couleur de la texture est multipliée).
    this.etiquettes[slot]?.material.color.setScalar(0.2);
    if (this.arriveeSilencieuse) return;
    this.pulse = PULSE_MS;
    if ((this.slots[slot] ?? 0) >= CELEBRATE_FROM) this.jaillir(slot);
    if (estGrosGain(this.slots[slot] ?? 0)) this.secousse = SECOUSSE_MS;
  }

  private eteindre(): void {
    if (!this.arrivee) return;
    this.arrivee = false;
    this.cases.forEach((boite, index) => {
      const teinte = CASE[heatOf(index, this.slots.length)];
      boite.material.emissive.set(teinte.lueur);
      boite.material.emissiveIntensity = teinte.intensite;
    });
    for (const texte of this.etiquettes) {
      texte.scale.set(1, 1, 1);
      texte.material.color.setScalar(1);
    }
    this.retirerEclats();
  }

  /** L'étiquette de la case d'arrivée grossit d'un coup, puis se pose à 1,25. */
  private pulser(dt: number): boolean {
    if (this.pulse <= 0 || this.posee === null) return false;
    this.pulse = Math.max(0, this.pulse - dt);
    const u = 1 - this.pulse / PULSE_MS;
    const echelle = 1.25 + 0.25 * Math.sin(u * Math.PI);
    this.etiquettes[this.posee]?.scale.set(echelle, echelle, 1);
    return this.pulse > 0;
  }

  /** Une gerbe d'éclats, disposée par l'angle d'or : la même à chaque fois (captures stables). */
  private jaillir(slot: number): void {
    this.retirerEclats();
    const centre: Point = slotCenter(slot, this.rows);
    const positions = new Float32Array(SPARK_COUNT * 3);
    const vitesses = new Float32Array(SPARK_COUNT * 3);
    for (let i = 0; i < SPARK_COUNT; i++) {
      const angle = i * 2.399963;
      const force = 0.0022 + (i % 7) * 0.0003;
      positions.set([centre.x, centre.y + 0.1, GEM_Z], i * 3);
      vitesses.set([Math.cos(angle) * force, 0.004 + Math.abs(Math.sin(angle)) * force, 0], i * 3);
    }
    const geometrie = new BufferGeometry();
    geometrie.setAttribute("position", new BufferAttribute(positions, 3));
    this.eclats = new Points(
      geometrie,
      new PointsMaterial({
        // Toujours la couleur de la case allumée : la lueur d'une case « froide » est presque
        // celle du fond, les éclats y seraient invisibles.
        color: new Color(NEON.gem),
        size: 0.12,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
      }),
    );
    this.vitesses = vitesses;
    this.ageEclats = 0;
    // La sphère englobante est calculée au départ (rayon nul) : sans ceci, les éclats
    // disparaîtraient dès que la caméra ne voit plus leur point de départ.
    this.eclats.frustumCulled = false;
    this.board.add(this.eclats);
  }

  private animerEclats(dt: number): boolean {
    if (!this.eclats || !this.vitesses) return false;
    this.ageEclats += dt;
    const attribut = this.eclats.geometry.getAttribute("position") as BufferAttribute;
    const positions = attribut.array as Float32Array;
    for (let i = 0; i < positions.length; i += 3) {
      this.vitesses[i + 1] -= 0.000012 * dt; // gravité
      positions[i] += this.vitesses[i] * dt;
      positions[i + 1] += this.vitesses[i + 1] * dt;
    }
    attribut.needsUpdate = true;
    this.eclats.material.opacity = Math.max(0, 1 - this.ageEclats / SPARK_MS);
    if (this.ageEclats >= SPARK_MS) {
      this.retirerEclats();
      return false;
    }
    return true;
  }

  private retirerEclats(): void {
    if (!this.eclats) return;
    this.board.remove(this.eclats);
    this.eclats.geometry.dispose();
    this.eclats.material.dispose();
    this.eclats = null;
    this.vitesses = null;
  }
}
