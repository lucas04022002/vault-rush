/**
 * Sons générés par synthèse (Web Audio API) — aucun fichier audio requis.
 * L'AudioContext démarre au premier clic (les navigateurs l'exigent).
 */

let ctx: AudioContext | null = null;
let muted = false;

function ac(): AudioContext {
  if (!ctx) {
    ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

export function setMuted(value: boolean) {
  muted = value;
}

export function isMuted() {
  return muted;
}

/** Joue une note simple (oscillateur + enveloppe de volume). */
function tone(
  freq: number,
  start: number,
  duration: number,
  type: OscillatorType,
  gain = 0.2,
) {
  const c = ac();
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, c.currentTime + start);
  g.gain.setValueAtTime(0.0001, c.currentTime + start);
  g.gain.exponentialRampToValueAtTime(gain, c.currentTime + start + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + start + duration);
  osc.connect(g).connect(c.destination);
  osc.start(c.currentTime + start);
  osc.stop(c.currentTime + start + duration + 0.02);
}

/** Petit clic sur une porte. */
export function playClick() {
  if (muted) return;
  tone(180, 0, 0.07, "square", 0.12);
}

/** Coffre trouvé : petit arpège ascendant joyeux. */
export function playSafe() {
  if (muted) return;
  tone(523, 0, 0.1, "triangle", 0.2); // do
  tone(659, 0.08, 0.1, "triangle", 0.2); // mi
  tone(784, 0.16, 0.14, "triangle", 0.22); // sol
}

/** Alarme : sirène descendante/montante stridente. */
export function playAlarm() {
  if (muted) return;
  const c = ac();
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(880, c.currentTime);
  osc.frequency.linearRampToValueAtTime(440, c.currentTime + 0.18);
  osc.frequency.linearRampToValueAtTime(880, c.currentTime + 0.36);
  g.gain.setValueAtTime(0.0001, c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.25, c.currentTime + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.55);
  osc.connect(g).connect(c.destination);
  osc.start();
  osc.stop(c.currentTime + 0.6);
}

/** Cash-out : cascade de pièces (petites notes aiguës rapides). */
export function playCashOut() {
  if (muted) return;
  const notes = [880, 1047, 1319, 1568, 1760, 2093];
  notes.forEach((f, i) => tone(f, i * 0.05, 0.12, "triangle", 0.16));
}

/** Vibration mobile (ignorée sur desktop). */
export function vibrate(pattern: number | number[]) {
  if (muted) return;
  navigator.vibrate?.(pattern);
}
