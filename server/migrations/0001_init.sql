-- Schéma initial : exactement celui qui tournait avant les migrations
-- (montants en REAL). Les bases déjà en service le possèdent déjà :
-- « IF NOT EXISTS » rend cette migration inoffensive pour elles.

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  balance REAL NOT NULL DEFAULT 1000,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS rounds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  bet_amount REAL NOT NULL,
  mode TEXT NOT NULL,
  current_floor INTEGER NOT NULL DEFAULT 0,
  multiplier REAL NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'playing',
  payout REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  round_id INTEGER,
  type TEXT NOT NULL,
  amount REAL NOT NULL,
  balance_after REAL NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);
