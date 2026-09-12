import type { GameConfig, GameMode, Round } from "../api.ts";

/** Petites dérivations d'affichage, communes à tous les jeux d'échelle. */

export function modeOf(config: GameConfig, modeId: string): GameMode | undefined {
  return config.modes.find((mode) => mode.id === modeId);
}

/**
 * Ce que vaudrait un encaissement après l'étape suivante, plafond compris —
 * même calcul que `cashoutCents` côté serveur (arrondi puis plafond).
 */
export function nextCashoutCents(config: GameConfig, round: Round): number | null {
  if (round.nextMultiplier === null) return null;
  return Math.min(Math.round(round.betCents * round.nextMultiplier), config.maxPayoutCents);
}

/**
 * Le verbe d'encaissement vient de la config du jeu ; seule la GRAMMAIRE est
 * ici : « Encaisser » prend son montant en complément direct, « Sortir » a
 * besoin d'une préposition. Un verbe inconnu prend la forme directe.
 */
const INDIRECT = new Set(["Sortir", "Partir", "Repartir"]);

export function cashoutLabel(verb: string, amount: string): string {
  return INDIRECT.has(verb) ? `${verb} avec ${amount}` : `${verb} ${amount}`;
}

/** « porte » → « Porte » : les libellés du serveur sont en minuscules. */
export function capitalize(word: string): string {
  return word.charAt(0).toLocaleUpperCase("fr-FR") + word.slice(1);
}
