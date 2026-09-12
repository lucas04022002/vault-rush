import { HttpError } from "./http/errors.ts";

/**
 * Argent : des entiers en centimes de coin, jamais de flottant.
 *
 * Le client peut envoyer `12.5`, `"12.5"` ou `"12,50"` ; tout est normalisé ici,
 * et toute validation de montant se fait après cette normalisation.
 */

/** Mise minimale : 1 coin. */
export const MIN_BET_CENTS = 100;
/** Mise maximale : 1 000 coins. */
export const MAX_BET_CENTS = 100_000;
/** Plafond de gain par partie : 10 000 coins. */
export const MAX_PAYOUT_CENTS = 1_000_000;

// Tolérance pour le bruit binaire : 1 + 0.1 + 0.2 vaut 1.3000000000000003.
const FLOAT_NOISE = 1e-6;

function fromNumber(value: number): number {
  if (!Number.isFinite(value)) throw new HttpError(400, "invalid_amount");
  const exact = value * 100;
  const cents = Math.round(exact);
  if (Math.abs(exact - cents) > FLOAT_NOISE) throw new HttpError(400, "invalid_amount");
  return cents;
}

function fromString(raw: string): number {
  // Espaces (y compris fine et insécable) de séparation des milliers, virgule décimale.
  const cleaned = raw.replace(/\s/g, "").replace(",", ".");
  if (!/^-?\d+(\.\d{1,2})?$/.test(cleaned)) throw new HttpError(400, "invalid_amount");
  return fromNumber(Number(cleaned));
}

/** Normalise un montant de mise en centimes, ou lève un 400. */
export function toCents(input: unknown): number {
  let cents: number;
  if (typeof input === "number") cents = fromNumber(input);
  else if (typeof input === "string") cents = fromString(input);
  else throw new HttpError(400, "invalid_amount");

  if (cents < MIN_BET_CENTS) throw new HttpError(400, "bet_too_small", { minCents: MIN_BET_CENTS });
  if (cents > MAX_BET_CENTS) throw new HttpError(400, "bet_too_large", { maxCents: MAX_BET_CENTS });
  return cents;
}

/** Affichage brut à deux décimales (le formatage fr-FR est l'affaire du client). */
export function fromCents(cents: number): string {
  return (cents / 100).toFixed(2);
}

/** Gain d'un encaissement : arrondi au centime puis plafonné. */
export function payoutCentsFor(betCents: number, multiplier: number): number {
  return Math.min(Math.round(betCents * multiplier), MAX_PAYOUT_CENTS);
}
