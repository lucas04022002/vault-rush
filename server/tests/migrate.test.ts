import { test } from "node:test";
import assert from "node:assert/strict";
import type { DatabaseSync } from "node:sqlite";
import { openDb, withTransaction } from "../src/database/db.ts";
import { runMigrations } from "../src/database/migrate.ts";

function columns(db: DatabaseSync, table: string): string[] {
  return (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name);
}

function countMigrations(db: DatabaseSync): number {
  const row = db.prepare("SELECT COUNT(*) AS n FROM schema_migrations").get() as { n: number };
  return row.n;
}

test("une base vide reçoit les trois migrations", () => {
  const db = openDb(":memory:");
  const applied = runMigrations(db);

  assert.deepEqual(applied, [
    "0001_init.sql",
    "0002_cents_and_auth.sql",
    "0003_state_json.sql",
  ]);
  assert.equal(countMigrations(db), 3);

  const users = columns(db, "users");
  assert.ok(users.includes("balance_cents"), "users.balance_cents attendue");
  assert.ok(users.includes("password_hash"), "users.password_hash attendue");
  assert.ok(users.includes("last_login_at"), "users.last_login_at attendue");
  assert.ok(!users.includes("balance"), "l'ancienne colonne balance doit disparaître");

  const rounds = columns(db, "rounds");
  assert.ok(rounds.includes("bet_cents") && rounds.includes("payout_cents"));
  assert.ok(rounds.includes("game") && rounds.includes("step"));
  assert.ok(rounds.includes("state_json"), "rounds.state_json attendue");
  assert.ok(!rounds.includes("bet_amount"));

  const transactions = columns(db, "transactions");
  assert.ok(transactions.includes("amount_cents") && transactions.includes("balance_after_cents"));
  db.close();
});

test("un second appel n'applique rien", () => {
  const db = openDb(":memory:");
  runMigrations(db);
  const again = runMigrations(db);

  assert.deepEqual(again, []);
  assert.equal(countMigrations(db), 3);
  db.close();
});

test("une base existante en REAL est convertie en centimes sans perte", () => {
  const db = openDb(":memory:");
  // Ancienne base : le schéma d'avant les migrations, avec un solde en coins.
  db.exec(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      balance REAL NOT NULL DEFAULT 1000,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  db.prepare("INSERT INTO users (username, balance) VALUES (?, ?)").run("ancienne", 12.34);
  db.prepare("INSERT INTO users (username, balance) VALUES (?, ?)").run("riche", 1000);

  runMigrations(db);

  const rows = db
    .prepare("SELECT username, balance_cents, password_hash FROM users ORDER BY id")
    .all() as { username: string; balance_cents: number; password_hash: string | null }[];
  assert.equal(rows.length, 2);
  assert.equal(rows[0].balance_cents, 1234);
  assert.equal(rows[0].password_hash, null);
  assert.equal(rows[1].balance_cents, 100000);
  db.close();
});

test("une seule partie active par joueur et par jeu", () => {
  const db = openDb(":memory:");
  runMigrations(db);
  db.prepare("INSERT INTO users (username) VALUES (?)").run("joueuse");
  const insert = db.prepare(
    "INSERT INTO rounds (user_id, game, bet_cents, mode, step, multiplier, status) VALUES (1, 'vault-rush', 100, 'safe', 0, 1, 'playing')",
  );
  insert.run();
  assert.throws(() => insert.run(), /UNIQUE|constraint/i);
  db.close();
});

test("withTransaction annule tout quand le corps lève", () => {
  const db = openDb(":memory:");
  runMigrations(db);
  db.prepare("INSERT INTO users (username) VALUES (?)").run("joueuse");

  assert.throws(() =>
    withTransaction(db, () => {
      db.prepare("UPDATE users SET balance_cents = 1 WHERE id = 1").run();
      throw new Error("boum");
    }),
  );

  const row = db.prepare("SELECT balance_cents FROM users WHERE id = 1").get() as {
    balance_cents: number;
  };
  assert.equal(row.balance_cents, 100000, "le solde doit être revenu à sa valeur d'origine");
  db.close();
});
