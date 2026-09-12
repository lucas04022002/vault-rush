import type { Db } from "./db.ts";

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
  /** Identifiant de mode propre au jeu (« safe », « calme »…). */
  mode: string;
  step: number;
  multiplier: number;
  status: RoundStatus;
  payoutCents: number;
  createdAt: string;
  updatedAt: string;
};

/**
 * `opening` est le solde offert à la création du compte : sans cette ligne, rejouer
 * le journal depuis zéro donnerait 1 000 coins de moins que le solde réel.
 */
export type TransactionType = "opening" | "bet" | "win" | "loss" | "refill";

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
  updated_at: string;
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
    mode: r.mode,
    step: r.step,
    multiplier: r.multiplier,
    status: r.status as RoundStatus,
    payoutCents: r.payout_cents,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
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

/**
 * Secondes restant avant la prochaine recharge gratuite, 0 si elle est déjà
 * possible. Le client s'en sert pour annoncer l'heure au joueur plutôt qu'un
 * « réessaie plus tard » sans horizon.
 */
export function refillCooldownSeconds(db: Db, userId: number): number {
  const row = db
    .prepare(
      `SELECT CAST(strftime('%s', last_refill_at, '+24 hours') - strftime('%s', 'now') AS INTEGER)
                AS secondes
         FROM users
        WHERE id = ? AND last_refill_at IS NOT NULL`,
    )
    .get(userId) as { secondes: number | null } | undefined;
  const secondes = row?.secondes ?? 0;
  return secondes > 0 ? secondes : 0;
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

// --- Historique ---
export type HistoryRow = {
  id: number;
  game: string;
  mode: string;
  betCents: number;
  status: RoundStatus;
  /** Bénéfice net de la partie : gain encaissé − mise. */
  netCents: number;
  step: number;
  multiplier: number;
  createdAt: string;
};

/** Parties terminées d'un joueur, de la plus récente à la plus ancienne. */
export function listUserRounds(
  db: Db,
  userId: number,
  options: { game?: string; limit: number },
): HistoryRow[] {
  const filtreJeu = options.game ? "AND game = ?" : "";
  const params: (string | number)[] = [userId];
  if (options.game) params.push(options.game);
  params.push(options.limit);

  return db
    .prepare(
      `SELECT id,
              game,
              mode,
              bet_cents AS betCents,
              status,
              payout_cents - bet_cents AS netCents,
              step,
              multiplier,
              created_at AS createdAt
         FROM rounds
        WHERE user_id = ?
          AND status IN ('lost', 'cashed_out')
          ${filtreJeu}
        ORDER BY id DESC
        LIMIT ?`,
    )
    .all(...params) as HistoryRow[];
}

// --- Classement ---
export type LeaderboardRow = {
  username: string;
  /** Bénéfice net cumulé (gains encaissés − mises) sur la fenêtre. */
  netCents: number;
  rounds: number;
  bestPayoutCents: number;
};

/** Fenêtre glissante du classement. */
export const LEADERBOARD_WINDOW = "-30 days";

/**
 * Classement par bénéfice net sur 30 jours, jamais par solde : un joueur qui a
 * beaucoup perdu ne doit pas monter grâce à une recharge, et un exploit d'il y
 * a six mois ne doit pas geler le tableau. Seules les parties terminées comptent.
 */
export function getLeaderboard(
  db: Db,
  options: { game?: string; limit: number },
): LeaderboardRow[] {
  const filtreJeu = options.game ? "AND r.game = ?" : "";
  const params: (string | number)[] = [];
  if (options.game) params.push(options.game);
  params.push(options.limit);

  return db
    .prepare(
      `SELECT u.username AS username,
              SUM(r.payout_cents) - SUM(r.bet_cents) AS netCents,
              COUNT(r.id) AS rounds,
              MAX(r.payout_cents) AS bestPayoutCents
         FROM rounds r
         JOIN users u ON u.id = r.user_id
        WHERE r.status IN ('lost', 'cashed_out')
          AND r.created_at >= datetime('now', '${LEADERBOARD_WINDOW}')
          ${filtreJeu}
        GROUP BY u.id
        ORDER BY netCents DESC, bestPayoutCents DESC
        LIMIT ?`,
    )
    .all(...params) as LeaderboardRow[];
}
