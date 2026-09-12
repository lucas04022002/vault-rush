import type { Db } from "../../database/db.ts";
import { withTransaction } from "../../database/db.ts";
import * as store from "../../database/store.ts";
import type { TransactionType } from "../../database/store.ts";
import { HttpError } from "../../http/errors.ts";

/**
 * Porte-monnaie : toute modification de solde passe ICI et écrit une ligne de
 * journal, ce qui donne une trace auditable de chaque mouvement.
 *
 * `debit` et `credit` ne gèrent pas la transaction : ils doivent être appelés
 * dans un `withTransaction` ouvert par l'opération métier (miser, encaisser),
 * pour que la partie et l'argent bougent ensemble ou pas du tout.
 */

/** En dessous de ce solde, la recharge gratuite est possible (10 coins). */
export const REFILL_THRESHOLD_CENTS = 1_000;
/** Montant de la recharge (1 000 coins). */
export const REFILL_AMOUNT_CENTS = 100_000;

export function getBalanceCents(db: Db, userId: number): number {
  const user = store.getUser(db, userId);
  if (!user) throw new HttpError(401, "unauthorized");
  return user.balanceCents;
}

export function debit(
  db: Db,
  userId: number,
  amountCents: number,
  type: TransactionType,
  roundId: number | null,
): number {
  const balance = getBalanceCents(db, userId);
  if (amountCents <= 0) throw new HttpError(400, "invalid_amount");
  if (balance < amountCents) throw new HttpError(409, "insufficient_balance");

  const newBalance = balance - amountCents;
  store.setBalance(db, userId, newBalance);
  store.addTransaction(db, {
    userId,
    roundId,
    type,
    amountCents,
    balanceAfterCents: newBalance,
  });
  return newBalance;
}

export function credit(
  db: Db,
  userId: number,
  amountCents: number,
  type: TransactionType,
  roundId: number | null,
): number {
  const balance = getBalanceCents(db, userId);
  if (amountCents <= 0) throw new HttpError(400, "invalid_amount");

  const newBalance = balance + amountCents;
  store.setBalance(db, userId, newBalance);
  store.addTransaction(db, {
    userId,
    roundId,
    type,
    amountCents,
    balanceAfterCents: newBalance,
  });
  return newBalance;
}

/** Journalise un événement sans mouvement de solde (une partie perdue, mise déjà débitée). */
export function record(
  db: Db,
  userId: number,
  roundId: number | null,
  type: TransactionType,
): void {
  store.addTransaction(db, {
    userId,
    roundId,
    type,
    amountCents: 0,
    balanceAfterCents: getBalanceCents(db, userId),
  });
}

export type RefillResult = { balanceCents: number; refilledCents: number };

/** Recharge gratuite : solde sous 10 coins et pas de recharge depuis 24 h. */
export function refill(db: Db, userId: number): RefillResult {
  return withTransaction(db, () => {
    if (getBalanceCents(db, userId) >= REFILL_THRESHOLD_CENTS) {
      throw new HttpError(409, "balance_too_high", { thresholdCents: REFILL_THRESHOLD_CENTS });
    }
    if (store.refilledWithin24h(db, userId)) {
      throw new HttpError(409, "refill_cooldown");
    }

    const balanceCents = credit(db, userId, REFILL_AMOUNT_CENTS, "refill", null);
    store.markRefill(db, userId);
    return { balanceCents, refilledCents: REFILL_AMOUNT_CENTS };
  });
}
