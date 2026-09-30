/**
 * Le rythme de la chute en 3D, sans `three` : l'écran s'en sert pour son minuteur,
 * et passe la durée courante à la scène, qui reste ainsi synchrone.
 *
 * Le ralenti ne décide de rien : le chemin et la case sont déjà tirés par le
 * serveur. Il ne fait que laisser le temps de voir arriver un gros gain.
 */

/** Durée d'une rangée en 3D, en millisecondes. */
export const MS_RANGEE_3D = 140;
/** Multiplicateur à partir duquel un gain a droit au ralenti. */
export const GROS_GAIN = 5;
/** Nombre de dernières rangées jouées au ralenti. */
export const RANGEES_AU_RALENTI = 3;
/** Facteur de ralenti. */
export const RALENTI = 2.5;

export function estGrosGain(multiplicateur: number): boolean {
  return multiplicateur >= GROS_GAIN;
}

/**
 * La durée de la rangée `rangee` (de 0 à `total` ; `total` = la pause avant que le
 * diamant touche sa case) pour une chute de `total` rangées vers un multiplicateur donné.
 */
export function dureeRangee(rangee: number, total: number, multiplicateur: number): number {
  const auRalenti = estGrosGain(multiplicateur) && rangee >= total - RANGEES_AU_RALENTI;
  return auRalenti ? MS_RANGEE_3D * RALENTI : MS_RANGEE_3D;
}
