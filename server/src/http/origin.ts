import type { Request, RequestHandler } from "express";
import { HttpError } from "./errors.ts";

/**
 * Origines : le cookie de session est en SameSite=Lax, la garde ci-dessous
 * ajoute une seconde barrière sur les mutations (CSRF).
 */

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Même origine que la requête ?
 *
 * On compare l'hôte annoncé par l'en-tête `Host` (celui que le navigateur a
 * réellement visé) plutôt qu'une origine reconstruite : derrière un proxy TLS,
 * le serveur parle en HTTP alors que le navigateur a vu du HTTPS. `req.protocol`
 * suit `X-Forwarded-Proto` uniquement si `trust proxy` est armé (variable
 * `TRUSTED_PROXY_HOPS`) — sinon la garde refuse, ce qui est le bon sens du
 * refus : fermé par défaut.
 */
function isAllowed(req: Request, origin: string, clientUrl?: string): boolean {
  if (clientUrl !== undefined && origin === clientUrl) return true;

  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  return url.host === req.get("host") && url.protocol === `${req.protocol}:`;
}

/** Refuse (403) toute mutation portant une origine étrangère. */
export function originGuard(clientUrl?: string): RequestHandler {
  return (req, _res, next) => {
    if (SAFE_METHODS.has(req.method)) return next();
    const origin = req.get("origin");
    // Pas d'en-tête Origin : appel hors navigateur (curl, test, sonde de santé).
    if (!origin) return next();
    if (!isAllowed(req, origin, clientUrl)) return next(new HttpError(403, "bad_origin"));
    next();
  };
}

/**
 * CORS avec cookies, uniquement pour le client de développement déclaré
 * dans `CLIENT_URL` (en production, Express sert le client : pas de CORS).
 */
export function corsForClient(clientUrl: string): RequestHandler {
  return (req, res, next) => {
    const origin = req.get("origin");
    if (origin === clientUrl) {
      res.header("Access-Control-Allow-Origin", clientUrl);
      res.header("Access-Control-Allow-Credentials", "true");
      res.header("Access-Control-Allow-Headers", "Content-Type");
      res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.header("Vary", "Origin");
    }
    if (req.method === "OPTIONS") {
      res.sendStatus(204);
      return;
    }
    next();
  };
}
