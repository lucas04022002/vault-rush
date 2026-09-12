/** Formatage fr-FR des montants, multiplicateurs et chances. Fonctions pures. */

const MINUS = "−"; // vrai signe moins, pas un trait d'union
const NBSP_NARROW = " ";

const coins = new Intl.NumberFormat("fr-FR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Un montant en centimes de coin → « 4 699,99 coins ». */
export function formatCoins(cents: number, options?: { signed?: boolean }): string {
  const signed = options?.signed ?? false;
  // `-0 === 0` : ramène le zéro négatif à un zéro franc, sinon Intl écrit « -0,00 ».
  const amount = cents === 0 ? 0 : cents;
  const value = signed ? Math.abs(amount) : amount;
  const body = coins.format(value / 100).replace("-", MINUS);
  const sign = signed ? (cents < 0 ? MINUS : "+") : "";
  return `${sign}${body} coins`;
}

/** Un multiplicateur → « ×3,84 ». */
export function formatMultiplier(multiplier: number): string {
  return `×${coins.format(multiplier)}`;
}

/** Une probabilité 0..1 → « 67 % » (pourcentage entier). */
export function formatPercent(ratio: number): string {
  return `${Math.round(ratio * 100)}${NBSP_NARROW}%`;
}
