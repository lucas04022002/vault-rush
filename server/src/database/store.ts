import type { Db } from "./db.ts";
import type { GameMode } from "../modules/game/game.algorithm.ts";

/**
 * Couche d'accès aux données (SQLite).
 * Les services ne voient que ces fonctions, jamais le SQL directement.
 * Tous les montants sont des entiers en centimes.
 */

export type User = {
  id: number;
  username: string;
  passwordHash: string | null;
  balanceCents: number;
  lastLoginAt: string | null;
  lastRefillAt: string | null;
  createdAt: string;
};

export type RoundStatus = "playing" | "lost" | "cashed_out";

export type GameRound = {
  id: number;
  userId: number;
  game: string;
  betCents: number;
  mode: GameMode;
  step: number;
  multiplier: number;
  status: RoundStatus;
  payoutCents: number;
  createdAt: string;
};

export type TransactionType = "bet" | "win" | "loss" | "refill";

export type Transaction = {
  userId: number;
  roundId: number | null;
  type: TransactionType;
  amountCents: number;
  balanceAfterCents: number;
};

// Lignes brutes telles que stockées en base (snake_case).
type UserRow = {
  id: number;
  username: string;
  password_hash: string | null;
  balance_cents: number;
  last_login_at: string | null;
  last_refill_at: string | null;
  created_at: string;
};

type RoundRow = {
  id: number;
  user_id: number;
  game: string;
  bet_cents: number;
  mode: string;
  step: number;
  multiplier: number;
  status: string;
  payout_cents: number;
  created_at: string;
};

function mapUser(r: UserRow): User {
  return {
    id: r.id,
    username: r.username,
    passwordHash: r.password_hash,
    balanceCents: r.balance_cents,
    lastLoginAt: r.last_login_at,
    lastRefillAt: r.last_refill_at,
    createdAt: r.created_at,
  };
}

function mapRound(r: RoundRow): GameRound {
  return {
    id: r.id,
    userId: r.user_id,
    game: r.game,
    betCents: r.bet_cents,
    mode: r.mode as GameMode,
    step: r.step,
    multiplier: r.multiplier,
    status: r.status as RoundStatus,
    payoutCents: r.payout_cents,
    createdAt: r.created_at,
  };
}

// --- Comptes ---
export function getUser(db: Db, id: number): User | undefined {
  const row = db.prepare("SELECT * FROM users WHERE id = ?").get(id) as UserRow | undefined;
  return row ? mapUser(row) : undefined;
}

export function getUserByUsername(db: Db, username: string): User | undefined {
  const row = db.prepare("SELECT * FROM users WHERE username = ?").get(username) as
    | UserRow
    | undefined;
  return row ? mapUser(row) : undefined;
}

export function createUser(
  db: Db,
  username: string,
  passwordHash: string | null,
  balanceCents = 100_000,
): User {
  const info = db
    .prepare("INSERT INTO users (username, password_hash, balance_cents) VALUES (?, ?, ?)")
    .run(username, passwordHash, balanceCents);
  return getUser(db, Number(info.lastInsertRowid))!;
}

export function setPasswordHash(db: Db, userId: number, hash: string): void {
  db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hash, userId);
}

export function touchLogin(db: Db, userId: number): void {
  db.prepare("UPDATE users SET last_login_at = datetime('now') WHERE id = ?").run(userId);
}

export function setBalance(db: Db, userId: number, balanceCents: number): void {
  db.prepare("UPDATE users SET balance_cents = ? WHERE id = ?").run(balanceCents, userId);
}

export function markRefill(db: Db, userId: number): void {
  db.prepare("UPDATE users SET last_refill_at = datetime('now') WHERE id = ?").run(userId);
}

/** Vrai si le joueur a déjà rechargé depuis moins de 24 h. */
export function refilledWithin24h(db: Db, userId: number): boolean {
  const row = db
    .prepare(
      "SELECT 1 AS recent FROM users WHERE id = ? AND last_refill_at > datetime('now', '-24 hours')",
    )
    .get(userId) as { recent: number } | undefined;
  return row !== undefined;
}

// --- Parties ---
export function createRound(
  db: Db,
  data: Pick<GameRound, "userId" | "game" | "betCents" | "mode">,
): GameRound {
  const info = db
    .prepare(
      `INSERT INTO rounds (user_id, game, bet_cents, mode, step, multiplier, status, payout_cents)
       VALUES (?, ?, ?, ?, 0, 1, 'playing', 0)`,
    )
    .run(data.userId, data.game, data.betCents, data.mode);
  return getRound(db, Number(info.lastInsertRowid))!;
}

export function getRound(db: Db, id: number): GameRound | undefined {
  const row = db.prepare("SELECT * FROM rounds WHERE id = ?").get(id) as RoundRow | undefined;
  return row ? mapRound(row) : undefined;
}

export function getActiveRound(db: Db, userId: number, game: string): GameRound | undefined {
  const row = db
    .prepare("SELECT * FROM rounds WHERE user_id = ? AND game = ? AND status = 'playing'")
    .get(userId, game) as RoundRow | undefined;
  return row ? mapRound(row) : undefined;
}

export function saveRound(db: Db, round: GameRound): void {
  db.prepare(
    `UPDATE rounds
        SET step = ?, multiplier = ?, status = ?, payout_cents = ?, updated_at = datetime('now')
      WHERE id = ?`,
  ).run(round.step, round.multiplier, round.status, round.payoutCents, round.id);
}

// --- Journal ---
export function addTransaction(db: Db, data: Transaction): void {
  db.prepare(
    `INSERT INTO transactions (user_id, round_id, type, amount_cents, balance_after_cents)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(data.userId, data.roundId, data.type, data.amountCents, data.balanceAfterCents);
}

// --- Classement ---
export type LeaderboardRow = {
  username: string;
  netProfitCents: number;
  bestPayoutCents: number;
  rounds: number;
};

/**
 * Classement par bénéfice net (gains encaissés − mises), jamais par solde :
 * un joueur qui a beaucoup perdu ne doit pas monter grâce à une recharge.
 * Le classement par jeu et la fenêtre de 30 jours arrivent avec le moteur commun.
 */
export function getLeaderboard(db: Db, limit = 10): LeaderboardRow[] {
  return db
    .prepare(
      `SELECT u.username AS username,
              COALESCE(SUM(r.payout_cents), 0) - COALESCE(SUM(r.bet_cents), 0) AS netProfitCents,
              COALESCE(MAX(r.payout_cents), 0) AS bestPayoutCents,
              COUNT(r.id) AS rounds
         FROM users u
         LEFT JOIN rounds r ON r.user_id = u.id AND r.status IN ('lost', 'cashed_out')
        GROUP BY u.id
        ORDER BY netProfitCents DESC, bestPayoutCents DESC
        LIMIT ?`,
    )
    .all(limit) as LeaderboardRow[];
}
