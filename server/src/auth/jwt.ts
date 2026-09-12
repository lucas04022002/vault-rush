import { SignJWT, jwtVerify } from "jose";

/**
 * Jeton de session : JWT HS256 signé avec `JWT_SECRET`, valable 30 jours.
 * Il ne contient que l'identité ; le solde et l'état de partie sont lus en base.
 */

export type SessionUser = { id: number; username: string };

const ALGORITHM = "HS256";
const LIFETIME = "30d";
export const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
export const MIN_SECRET_LENGTH = 32;

/** Vérifie et encode le secret. Lève au démarrage si la configuration est mauvaise. */
export function readSecret(raw: string | undefined): Uint8Array {
  if (!raw || raw.length < MIN_SECRET_LENGTH) {
    throw new Error(
      `JWT_SECRET est obligatoire et doit faire au moins ${MIN_SECRET_LENGTH} caractères.`,
    );
  }
  return new TextEncoder().encode(raw);
}

export async function signSession(secret: Uint8Array, user: SessionUser): Promise<string> {
  return new SignJWT({ username: user.username })
    .setProtectedHeader({ alg: ALGORITHM })
    .setSubject(String(user.id))
    .setIssuedAt()
    .setExpirationTime(LIFETIME)
    .sign(secret);
}

/** Renvoie l'identité du porteur, ou `null` si le jeton est absent, faux ou expiré. */
export async function verifySession(
  secret: Uint8Array,
  token: string | undefined,
): Promise<SessionUser | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret, { algorithms: [ALGORITHM] });
    const id = Number(payload.sub);
    const username = payload.username;
    if (!Number.isInteger(id) || id <= 0 || typeof username !== "string") return null;
    return { id, username };
  } catch {
    return null;
  }
}
