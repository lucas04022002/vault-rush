import { formatCoins } from "../lib/format.ts";

/** Saisie et affichage des mises, côté client. Le serveur revalide tout. */

/** Raccourcis de mise, en centimes : 1, 5, 10, 25, 50 et 100 coins. */
export const QUICK_BETS = [100, 500, 1000, 2500, 5000, 10_000];

/** « 25,00 » — le montant sans le mot « coins », pour les puces et la saisie. */
export function coinsOnly(cents: number): string {
  return formatCoins(cents).replace(" coins", "");
}

export type BetCheck = { cents: number; error: null } | { cents: null; error: string };

/**
 * Contrôle local de la mise : mêmes règles que `server/src/money.ts`
 * (virgule ou point, deux décimales au plus, bornes de la config), pour
 * répondre avant l'aller-retour. Le refus fait foi côté serveur.
 */
export function checkBet(raw: string, minCents: number, maxCents: number): BetCheck {
  const cleaned = raw.replace(/\s/g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) {
    return { cents: null, error: "Mise invalide : un nombre, deux décimales au maximum." };
  }
  const cents = Math.round(Number(cleaned) * 100);
  if (cents < minCents) return { cents: null, error: `Mise minimum : ${formatCoins(minCents)}.` };
  if (cents > maxCents) return { cents: null, error: `Mise maximum : ${formatCoins(maxCents)}.` };
  return { cents, error: null };
}
