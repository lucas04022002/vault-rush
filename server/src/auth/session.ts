import type { Request, RequestHandler, Response } from "express";
import { HttpError } from "../http/errors.ts";
import { SESSION_MAX_AGE_MS, verifySession, type SessionUser } from "./jwt.ts";

/**
 * Session : un cookie httpOnly, et rien d'autre.
 * Aucune route ne lit un identifiant de joueur envoyé par le client.
 */

export type { SessionUser } from "./jwt.ts";

export const SESSION_COOKIE = "vr_session";

type RequestWithSession = Request & { session?: SessionUser };

export type SessionOptions = { secret: Uint8Array; cookieSecure: boolean };

/**
 * Pose `req.session` (ou rien) avant les routes.
 *
 * Un jeton peut rester valide alors que le compte n'existe plus (suppression à
 * la main, base réinitialisée) : `accountExists` le vérifie ici, une fois pour
 * toutes les routes. Sans ce contrôle, les routes qui écrivent partaient en
 * violation de clé étrangère, donc en 500, au lieu du 401 attendu.
 */
export function sessionMiddleware(
  options: SessionOptions,
  accountExists: (userId: number) => boolean,
): RequestHandler {
  return (req, res, next) => {
    const token = (req as Request & { cookies?: Record<string, string> }).cookies?.[SESSION_COOKIE];
    verifySession(options.secret, token)
      .then((user) => {
        if (user && accountExists(user.id)) {
          (req as RequestWithSession).session = user;
        } else if (user) {
          // Compte disparu : on retire le cookie au lieu de le laisser rejouer.
          clearSessionCookie(res, options);
        }
        next();
      })
      .catch(next);
  };
}

/** Identité du joueur connecté, ou 401. */
export function requireUser(req: Request): SessionUser {
  const user = (req as RequestWithSession).session;
  if (!user) throw new HttpError(401, "unauthorized");
  return user;
}

export function setSessionCookie(res: Response, token: string, options: SessionOptions): void {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: options.cookieSecure,
    maxAge: SESSION_MAX_AGE_MS,
    path: "/",
  });
}

export function clearSessionCookie(res: Response, options: SessionOptions): void {
  res.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    sameSite: "lax",
    secure: options.cookieSecure,
    path: "/",
  });
}
