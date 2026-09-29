import {
  AdditiveBlending,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  Group,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  OctahedronGeometry,
  PlaneGeometry,
  Points,
  PointsMaterial,
  SphereGeometry,
  SRGBColorSpace,
  Vector3,
} from "three";
import { formatMultiplier } from "../../lib/format.ts";
import { NEON } from "../../three/palette.ts";
import type { Stage } from "../../three/stage.ts";
import { heatOf, type SlotHeat } from "../heat.ts";
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
/** Temps caractéristique du glissement de la caméra, en ms. */
const CAMERA_MS = 140;
/** Durée de la gerbe d'éclats et de la pulsation de la case, en ms. */
const SPARK_MS = 900;
const PULSE_MS = 320;
const SPARK_COUNT = 64;
/** Multiplicateur à partir duquel l'arrivée jaillit. */
export const CELEBRATE_FROM = 2;

export type DiamondState = { path: boolean[] | null; row: number; landedSlot: number | null };

/** Les couleurs d'une case selon sa chaleur, comme en 2D (`diamond-drop.css`). */
const CASE: Record<SlotHeat, { fond: string; lueur: string; intensite: number; encre: string }> = {
  chaud: { fond: NEON.gem, lueur: NEON.gem, intensite: 0.55, encre: NEON.gemInk },
  tiede: { fond: NEON.panel2, lueur: NEON.gemShadow, intensite: 0.35, encre: NEON.gem },
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
  private readonly cases: Mesh<BoxGeometry, MeshStandardMaterial>[] = [];
  private readonly etiquettes: Mesh[] = [];
  private readonly camera = { x: 0, y: 0, width: 1, height: 1 };
  private readonly cible = new Vector3();

  private path: boolean[] | null = null;
  private affichee = 0;
  private visee = 0;
  private posee: number | null = null;
  private arrivee = false;
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

    // Le fond du plateau.
    const vue = overview(rows);
    const fond = new Mesh(
      new PlaneGeometry(vue.width + 0.6, vue.height + 0.6),
      new MeshStandardMaterial({ color: new Color(NEON.panel), roughness: 0.95 }),
    );
    fond.position.set(0, vue.y, -0.25);
    this.board.add(fond);

    // Les clous : une seule géométrie instanciée, néon améthyste.
    const total = (rows * (rows + 1)) / 2;
    const clous = new InstancedMesh(
      new SphereGeometry(0.09, 16, 12),
      new MeshStandardMaterial({
        color: new Color(NEON.gem),
        emissive: new Color(NEON.gem),
        emissiveIntensity: 1.2,
        roughness: 0.3,
      }),
      total,
    );
    const place = new Object3D();
    let n = 0;
    for (let rangee = 0; rangee < rows; rangee++) {
      for (let i = 0; i <= rangee; i++) {
        const p = pinPosition(rangee, i);
        place.position.set(p.x, p.y, GEM_Z);
        place.updateMatrix();
        clous.setMatrixAt(n++, place.matrix);
      }
    }
    this.board.add(clous);

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
          roughness: 0.5,
        }),
      );
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
      texte.position.set(centre.x, centre.y - SLOT_HEIGHT / 2, 0.16);
      this.board.add(texte);
      this.etiquettes.push(texte);
    });

    // Le diamant : un octaèdre étiré, facetté, reflet magenta.
    this.gem = new Mesh(
      new OctahedronGeometry(0.22, 0),
      new MeshStandardMaterial({
        color: new Color(NEON.gem),
        emissive: new Color(NEON.mag),
        emissiveIntensity: 0.6,
        metalness: 0.3,
        roughness: 0.15,
        flatShading: true,
      }),
    );
    this.gem.scale.set(1, 1.35, 1);
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
      this.affichee = row;
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
      this.affichee = Math.min(this.visee, this.affichee + dt / this.rowMs);
      bouge = true;
    }

    const p = this.path ? gemPosition(this.path, this.affichee) : restPosition();
    this.gem.position.set(p.x, p.y, GEM_Z);
    if (bouge) this.gem.rotation.y += dt * 0.008;

    if (
      this.path &&
      this.posee !== null &&
      !this.arrivee &&
      this.affichee >= this.path.length
    ) {
      this.arriver(this.posee);
    }

    const camBouge = this.suivre(this.path ? follow(this.rows, p) : overview(this.rows), dt);
    const pulse = this.pulser(dt);
    const eclats = this.animerEclats(dt);
    return bouge || camBouge || pulse || eclats;
  };

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
    ) * 1.05;

    this.board.updateMatrixWorld();
    this.cible.set(this.camera.x, this.camera.y, 0);
    this.board.localToWorld(this.cible);
    camera.position.set(this.cible.x, this.cible.y + distance * 0.12, this.cible.z + distance);
    camera.lookAt(this.cible);
  }

  private arriver(slot: number): void {
    this.arrivee = true;
    const boite = this.cases[slot];
    if (boite) boite.material.emissiveIntensity = 2.2;
    this.pulse = PULSE_MS;
    if ((this.slots[slot] ?? 0) >= CELEBRATE_FROM) this.jaillir(slot);
  }

  private eteindre(): void {
    if (!this.arrivee) return;
    this.arrivee = false;
    this.cases.forEach((boite, index) => {
      boite.material.emissiveIntensity = CASE[heatOf(index, this.slots.length)].intensite;
    });
    for (const texte of this.etiquettes) texte.scale.set(1, 1, 1);
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
        color: new Color(CASE[heatOf(slot, this.slots.length)].lueur),
        size: 0.12,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
      }),
    );
    this.vitesses = vitesses;
    this.ageEclats = 0;
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
