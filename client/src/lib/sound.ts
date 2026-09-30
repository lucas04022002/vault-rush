/**
 * Sons de synthèse (Web Audio), sans aucun fichier audio.
 *
 * Règles tenues ici :
 * - le son est COUPÉ par défaut (la préférence vit dans `localStorage`) ;
 * - rien n'est joué avant qu'une réponse du serveur soit arrivée : les écrans
 *   appellent `playOutcome` depuis l'effet qui observe l'état de la partie ;
 * - l'AudioContext n'est créé qu'au premier son réellement joué.
 */

const KEY = "vaultrush_sound";

let context: AudioContext | null = null;
let enabled = false;

type WindowWithWebkitAudio = Window & { webkitAudioContext?: typeof AudioContext };

function audio(): AudioContext | null {
  const Ctor = window.AudioContext ?? (window as WindowWithWebkitAudio).webkitAudioContext;
  if (!Ctor) return null;
  if (!context) context = new Ctor();
  if (context.state === "suspended") void context.resume();
  return context;
}

/** La préférence enregistrée ; coupée par défaut, et en cas de stockage interdit. */
export function loadSoundPreference(): boolean {
  try {
    enabled = window.localStorage.getItem(KEY) === "on";
  } catch {
    enabled = false;
  }
  return enabled;
}

export function setSoundEnabled(value: boolean): void {
  enabled = value;
  try {
    window.localStorage.setItem(KEY, value ? "on" : "off");
  } catch {
    // Navigation privée, stockage bloqué : la préférence vaut pour cette visite.
  }
}

export function isSoundEnabled(): boolean {
  return enabled;
}

function tone(freq: number, start: number, duration: number, type: OscillatorType, gain: number) {
  const ctx = audio();
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const vol = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, ctx.currentTime + start);
  vol.gain.setValueAtTime(0.0001, ctx.currentTime + start);
  vol.gain.exponentialRampToValueAtTime(gain, ctx.currentTime + start + 0.01);
  vol.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + duration);
  osc.connect(vol).connect(ctx.destination);
  osc.start(ctx.currentTime + start);
  osc.stop(ctx.currentTime + start + duration + 0.02);
}

/**
 * La note du clou touché à la rangée `rangee` sur `total` : un la (880 Hz) au premier
 * clou, l'octave au-dessus (1 760 Hz) au dernier, en montant régulièrement — la chute
 * s'entend approcher de l'arrivée.
 */
export function frequenceClou(rangee: number, total: number): number {
  const u = total <= 1 ? 0 : Math.min(Math.max(rangee / (total - 1), 0), 1);
  return 880 * 2 ** u;
}

/**
 * Le tintement d'un clou de Diamond Drop. Joué pendant l'animation d'un chemin que le
 * serveur a DÉJÀ tiré : il accompagne le résultat, il ne l'annonce pas avant l'heure.
 */
export function playPeg(rangee: number, total: number): void {
  if (!enabled) return;
  try {
    tone(frequenceClou(rangee, total), 0, 0.06, "triangle", 0.07);
  } catch {
    // Un navigateur qui refuse l'audio ne doit jamais casser l'écran de jeu.
  }
}

export type SoundName = "safe" | "danger" | "cashout";

/** Joue le son d'un RÉSULTAT, donc toujours après une réponse du serveur. */
export function playOutcome(name: SoundName): void {
  if (!enabled) return;
  try {
    if (name === "safe") {
      tone(523, 0, 0.1, "triangle", 0.2);
      tone(659, 0.08, 0.1, "triangle", 0.2);
      tone(784, 0.16, 0.14, "triangle", 0.22);
      return;
    }
    if (name === "danger") {
      tone(440, 0, 0.3, "sawtooth", 0.22);
      tone(220, 0.18, 0.34, "sawtooth", 0.22);
      return;
    }
    [880, 1047, 1319, 1568, 1760, 2093].forEach((f, i) => tone(f, i * 0.05, 0.12, "triangle", 0.16));
  } catch {
    // Un navigateur qui refuse l'audio ne doit jamais casser l'écran de jeu.
  }
}
