import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { withTransaction, type Db } from "./db.ts";

/**
 * Migrations versionnées : les fichiers `migrations/NNNN_*.sql` sont appliqués
 * dans l'ordre alphabétique, une seule fois, chacun dans sa transaction.
 * Aucune migration ne détruit de données.
 */

export const MIGRATIONS_DIR = fileURLToPath(new URL("../../migrations/", import.meta.url));

type PragmaRow = { foreign_keys?: number };

/** Applique les migrations en attente et renvoie la liste de celles qui viennent de passer. */
export function runMigrations(db: Db, dir: string = MIGRATIONS_DIR): string[] {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const done = new Set(
    (db.prepare("SELECT name FROM schema_migrations").all() as { name: string }[]).map((r) => r.name),
  );
  const pending = readdirSync(dir)
    .filter((file) => file.endsWith(".sql"))
    .sort()
    .filter((file) => !done.has(file));
  if (pending.length === 0) return [];

  const foreignKeysWereOn = (db.prepare("PRAGMA foreign_keys").get() as PragmaRow)?.foreign_keys === 1;
  // Procédure SQLite de reconstruction de table : clés étrangères coupées, et
  // renommage « à l'ancienne » pour que les tables pas encore reconstruites ne
  // fassent pas échouer un ALTER TABLE ... RENAME.
  db.exec("PRAGMA foreign_keys = OFF");
  db.exec("PRAGMA legacy_alter_table = ON");

  const applied: string[] = [];
  try {
    for (const file of pending) {
      const sql = readFileSync(join(dir, file), "utf8");
      withTransaction(db, () => {
        db.exec(sql);
        db.prepare("INSERT INTO schema_migrations (name) VALUES (?)").run(file);
      });
      applied.push(file);
    }
  } finally {
    db.exec("PRAGMA legacy_alter_table = OFF");
    if (foreignKeysWereOn) db.exec("PRAGMA foreign_keys = ON");
  }

  return applied;
}
