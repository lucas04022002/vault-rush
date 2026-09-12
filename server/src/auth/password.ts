import { randomBytes } from "node:crypto";
import { argon2id, argon2Verify } from "hash-wasm";

/**
 * Mots de passe : argon2id via hash-wasm (WebAssembly, donc aucun module natif
 * à compiler — Smart App Control bloque les binaires non signés sur cette machine).
 */

export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 200;

// Paramètres OWASP 2024 pour argon2id (19 Mio, 2 passes, 1 fil).
const MEMORY_SIZE_KIB = 19_456;
const ITERATIONS = 2;
const PARALLELISM = 1;

export async function hashPassword(password: string): Promise<string> {
  return argon2id({
    password,
    salt: randomBytes(16),
    memorySize: MEMORY_SIZE_KIB,
    iterations: ITERATIONS,
    parallelism: PARALLELISM,
    hashLength: 32,
    outputType: "encoded",
  });
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  try {
    return await argon2Verify({ password, hash });
  } catch {
    // Empreinte illisible (base corrompue ou format inconnu) : on refuse, sans détail.
    return false;
  }
}
