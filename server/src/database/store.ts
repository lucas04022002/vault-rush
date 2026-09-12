import { db } from "./db.ts";
import type { GameMode } from "../modules/game/game.algorithm.ts";

/**
 * Couche d'accès aux données (SQLite).
 * Les services ne voient que ces fonctions, jamais le SQL directement.
 */

export type User = {
  id: number;
  username: string;
  balance: number;
};

export type RoundStatus = "playing" | "lost" | "cashed_out";

export type GameRound = {
  id: number;
  userId: number;
  betAmount: number;
  mode: GameMode;
  currentFloor: number;
  multiplier: number;
  status: RoundStatus;
  payout: number;
  createdAt: string;
};

export type TransactionType = "bet" | "win" | "loss" | "refund";

export type Transaction = {
  id: number;
  userId: number;
  roundId: number | null;
  type: TransactionType;
  amount: number;
  balanceAfter: number;
  createdAt: string;
};

// Lignes brutes telles que stockées en base (snake_case).
type RoundRow = {
  id: number;
  user_id: number;
  bet_amount: number;
  mode: string;
  current_floor: number;
  multiplier: number;
  status: string;
  payout: number;
  created_at: string;
};

function mapRound(r: RoundRow): GameRound {
  return {
    id: r.id,
    userId: r.user_id,
    betAmount: r.bet_amount,
    mode: r.mode as GameMode,
    currentFloor: r.current_floor,
    multiplier: r.multiplier,
    status: r.status as RoundStatus,
    payout: r.payout,
    createdAt: r.created_at,
  };
}

// --- Users ---
export function getUser(id: number): User | undefined {
  return db.prepare("SELECT id, username, balance FROM users WHERE id = ?").get(id) as
    | User
    | undefined;
}

export function getUserByUsername(username: string): User | undefined {
  return db
    .prepare("SELECT id, username, balance FROM users WHERE username = ?")
    .get(username) as User | undefined;
}

export function createUser(username: string, balance = 1000): User {
  const info = db
    .prepare("INSERT INTO users (username, balance) VALUES (?, ?)")
    .run(username, balance);
  return { id: Number(info.lastInsertRowid), username, balance };
}

export function updateBalance(userId: number, newBalance: number): void {
  db.prepare("UPDATE users SET balance = ? WHERE id = ?").run(
    Number(newBalance.toFixed(2)),
    userId,
  );
}

// --- Rounds ---
export function createRound(data: Omit<GameRound, "id" | "createdAt">): GameRound {
  const info = db
    .prepare(
      `INSERT INTO rounds (user_id, bet_amount, mode, current_floor, multiplier, status, payout)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      data.userId,
      data.betAmount,
      data.mode,
      data.currentFloor,
      data.multiplier,
      data.status,
      data.payout,
    );
  return getRound(Number(info.lastInsertRowid))!;
}

export function getRound(id: number): GameRound | undefined {
  const row = db.prepare("SELECT * FROM rounds WHERE id = ?").get(id) as RoundRow | undefined;
  return row ? mapRound(row) : undefined;
}

export function saveRound(round: GameRound): void {
  db.prepare(
    `UPDATE rounds SET current_floor = ?, multiplier = ?, status = ?, payout = ? WHERE id = ?`,
  ).run(round.currentFloor, round.multiplier, round.status, round.payout, round.id);
}

export function getUserRounds(userId: number, limit = 20): GameRound[] {
  const rows = db
    .prepare("SELECT * FROM rounds WHERE user_id = ? ORDER BY id DESC LIMIT ?")
    .all(userId, limit) as RoundRow[];
  return rows.map(mapRound);
}

// --- Leaderboard ---
export type LeaderboardRow = {
  username: string;
  balance: number;
  bestPayout: number;
};

export function getLeaderboard(limit = 10): LeaderboardRow[] {
  return db
    .prepare(
      `SELECT u.username AS username,
              u.balance  AS balance,
              COALESCE(MAX(r.payout), 0) AS bestPayout
       FROM users u
       LEFT JOIN rounds r ON r.user_id = u.id
       GROUP BY u.id
       ORDER BY u.balance DESC, bestPayout DESC
       LIMIT ?`,
    )
    .all(limit) as LeaderboardRow[];
}

// --- Transactions ---
export function addTransaction(data: Omit<Transaction, "id" | "createdAt">): void {
  db.prepare(
    `INSERT INTO transactions (user_id, round_id, type, amount, balance_after)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(data.userId, data.roundId, data.type, data.amount, data.balanceAfter);
}
