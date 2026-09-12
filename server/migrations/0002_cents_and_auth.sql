-- Passage de l'argent en centimes entiers, ajout des comptes (mot de passe),
-- du jeu et de l'étape sur les parties, et de l'index « une seule partie active ».
-- SQLite ne sait pas changer le type d'une colonne : on reconstruit les tables
-- en recopiant toutes les lignes (aucune donnée n'est perdue).

-- Deux parties actives pour le même joueur ne peuvent plus coexister. Les
-- doublons hérités (mise déjà débitée, partie jamais terminée) sont clôturés
-- en « perdue » ; la plus récente reste jouable.
UPDATE rounds SET status = 'lost', payout = 0
WHERE status = 'playing'
  AND id NOT IN (SELECT MAX(id) FROM rounds WHERE status = 'playing' GROUP BY user_id);

-- --- users -------------------------------------------------------------
CREATE TABLE users_cents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT,
  balance_cents INTEGER NOT NULL DEFAULT 100000,
  last_login_at TEXT,
  last_refill_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO users_cents (id, username, password_hash, balance_cents, created_at)
SELECT id, username, NULL, CAST(ROUND(balance * 100) AS INTEGER), created_at
FROM users;

DROP TABLE users;
ALTER TABLE users_cents RENAME TO users;

-- --- rounds ------------------------------------------------------------
CREATE TABLE rounds_cents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  game TEXT NOT NULL DEFAULT 'vault-rush',
  bet_cents INTEGER NOT NULL,
  mode TEXT NOT NULL,
  step INTEGER NOT NULL DEFAULT 0,
  multiplier REAL NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'playing',
  payout_cents INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO rounds_cents
  (id, user_id, game, bet_cents, mode, step, multiplier, status, payout_cents, created_at, updated_at)
SELECT id, user_id, 'vault-rush', CAST(ROUND(bet_amount * 100) AS INTEGER), mode,
       current_floor, multiplier, status, CAST(ROUND(payout * 100) AS INTEGER),
       created_at, created_at
FROM rounds;

DROP TABLE rounds;
ALTER TABLE rounds_cents RENAME TO rounds;

-- --- transactions ------------------------------------------------------
CREATE TABLE transactions_cents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  round_id INTEGER,
  type TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  balance_after_cents INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO transactions_cents
  (id, user_id, round_id, type, amount_cents, balance_after_cents, created_at)
SELECT id, user_id, round_id, type, CAST(ROUND(amount * 100) AS INTEGER),
       CAST(ROUND(balance_after * 100) AS INTEGER), created_at
FROM transactions;

DROP TABLE transactions;
ALTER TABLE transactions_cents RENAME TO transactions;

-- --- index -------------------------------------------------------------
-- Une seule partie active par joueur et par jeu (garantie par la base, pas par le code).
CREATE UNIQUE INDEX idx_rounds_active ON rounds(user_id, game) WHERE status = 'playing';
CREATE INDEX idx_rounds_user ON rounds(user_id, id);
CREATE INDEX idx_transactions_user ON transactions(user_id, id);
