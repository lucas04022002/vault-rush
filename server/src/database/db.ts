import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

/**
 * Connexion SQLite. Aucune connexion n'est ouverte à l'import :
 * `createApp()` (ou un test) appelle `openDb()` et garde la base dans son contexte.
 */

export type Db = DatabaseSync;

export const DEFAULT_DB_PATH = "data/vault.db";
const IN_MEMORY = ":memory:";

export function openDb(path: string = process.env.DB_PATH ?? DEFAULT_DB_PATH): Db {
  if (path !== IN_MEMORY) mkdirSync(dirname(resolve(path)), { recursive: true });

  const db = new DatabaseSync(path);
  db.exec("PRAGMA foreign_keys = ON");
  // WAL n'a pas de sens (ni d'effet) sur une base en mémoire.
  if (path !== IN_MEMORY) db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA busy_timeout = 5000");
  return db;
}

/**
 * Exécute `fn` dans une transaction : tout est écrit, ou rien.
 * `BEGIN IMMEDIATE` prend le verrou d'écriture tout de suite, ce qui sérialise
 * deux opérations d'argent concurrentes sur le même joueur.
 */
export function withTransaction<T>(db: Db, fn: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (err) {
    try {
      db.exec("ROLLBACK");
    } catch {
      // La transaction était déjà retombée : l'erreur d'origine reste la bonne.
    }
    throw err;
  }
}
