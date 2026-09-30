/**
 * Ce qu'il faut savoir AVANT de charger la 3D — sans jamais importer `three`.
 *
 * Ce fichier est lu par les écrans eux-mêmes : s'il importait `three`, la
 * bibliothèque partirait dans le morceau principal du site, et l'accueil de
 * l'arcade la téléchargerait pour rien.
 */

export type Rendu = "3d" | "2d";

const KEY = "vaultrush_render";

/** Vrai si le navigateur demande à ne pas animer (jsdom n'a pas `matchMedia`). */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Le niveau de finition du rendu 3D : « haute » sur un appareil à pointeur fin (un
 * ordinateur, qui a la marge pour le flou de profondeur et des ombres fines),
 * « normale » ailleurs — un téléphone garde le cristal, le chrome et les ombres,
 * sans ce qui coûte le plus.
 */
export type Qualite = "haute" | "normale";

export function qualiteRendu(): Qualite {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return "normale";
  return window.matchMedia("(pointer: fine)").matches ? "haute" : "normale";
}

/** Vrai si un contexte WebGL se crée sur un canvas jetable, aussitôt relâché. */
export function webglAvailable(): boolean {
  if (typeof document === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    if (!gl) return false;
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return true;
  } catch {
    return false;
  }
}

/** La préférence enregistrée, ou `null` si aucune (ou stockage interdit). */
export function loadRenderPreference(): Rendu | null {
  try {
    const valeur = window.localStorage.getItem(KEY);
    return valeur === "3d" || valeur === "2d" ? valeur : null;
  } catch {
    return null;
  }
}

export function setRenderPreference(value: Rendu): void {
  try {
    window.localStorage.setItem(KEY, value);
  } catch {
    // Navigation privée, stockage bloqué : la préférence vaut pour cette visite.
  }
}

/**
 * La 3D n'est POSSIBLE qu'avec WebGL et sans demande de mouvement réduit ;
 * elle est alors choisie sauf si le joueur a demandé la 2D.
 */
export function chooseRender(o: {
  webgl: boolean;
  reducedMotion: boolean;
  preference: Rendu | null;
}): { mode: Rendu; possible: boolean } {
  const possible = o.webgl && !o.reducedMotion;
  return { possible, mode: possible && o.preference !== "2d" ? "3d" : "2d" };
}
