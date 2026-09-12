import {
  getUser,
  updateBalance,
  addTransaction,
  type TransactionType,
} from "../../database/store.ts";

/**
 * Wallet : toute modification de solde passe ICI, et écrit une transaction.
 * Ça donne une trace auditable de chaque mouvement d'argent.
 */

export function getBalance(userId: number): number {
  const user = getUser(userId);
  if (!user) throw new Error("User not found");
  return user.balance;
}

/** Débite le solde (mise). Lève une erreur si fonds insuffisants. */
export function debit(
  userId: number,
  amount: number,
  type: TransactionType,
  roundId: number | null,
): number {
  const user = getUser(userId);
  if (!user) throw new Error("User not found");
  if (amount <= 0) throw new Error("Amount must be positive");
  if (user.balance < amount) throw new Error("Insufficient balance");

  const newBalance = Number((user.balance - amount).toFixed(2));
  updateBalance(userId, newBalance);
  addTransaction({ userId, roundId, type, amount, balanceAfter: newBalance });
  return newBalance;
}

/** Crédite le solde (gain / remboursement). */
export function credit(
  userId: number,
  amount: number,
  type: TransactionType,
  roundId: number | null,
): number {
  const user = getUser(userId);
  if (!user) throw new Error("User not found");
  if (amount <= 0) throw new Error("Amount must be positive");

  const newBalance = Number((user.balance + amount).toFixed(2));
  updateBalance(userId, newBalance);
  addTransaction({ userId, roundId, type, amount, balanceAfter: newBalance });
  return newBalance;
}
