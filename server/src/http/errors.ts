import type { NextFunction, Request, RequestHandler, Response } from "express";

/**
 * Erreurs HTTP : une seule façon de sortir d'une route en erreur.
 *
 * `HttpError` porte le code métier renvoyé au client (`{ error: "..." }`) ;
 * tout le reste est une panne serveur et devient un 500 sans pile.
 */

export class HttpError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: Record<string, unknown>;

  constructor(status: number, code: string, details: Record<string, unknown> = {}) {
    super(code);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/** Enveloppe une route asynchrone pour que ses rejets partent vers le gestionnaire terminal. */
export function route(handler: (req: Request, res: Response) => unknown | Promise<unknown>): RequestHandler {
  return (req, res, next) => {
    try {
      Promise.resolve(handler(req, res)).catch(next);
    } catch (err) {
      next(err);
    }
  };
}

/** Route d'API inconnue. */
export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({ error: "not_found" });
}

/**
 * Erreurs posées par `express.json()` : un corps illisible ou trop gros vient du
 * client, pas du serveur. Sans cette traduction, une requête d'un octet répond
 * 500 et remplit le journal du VPS d'une pile complète.
 */
function bodyParserError(err: unknown): HttpError | null {
  const type = (err as { type?: unknown } | null)?.type;
  if (err instanceof SyntaxError && type === "entity.parse.failed") {
    return new HttpError(400, "invalid_json");
  }
  if (type === "entity.too.large") return new HttpError(413, "payload_too_large");
  return null;
}

/** Gestionnaire terminal : jamais de pile dans la réponse. */
export function errorHandler(err: unknown, _req: Request, res: Response, next: NextFunction) {
  if (res.headersSent) return next(err);

  const traduite = err instanceof HttpError ? err : bodyParserError(err);
  if (traduite) {
    res.status(traduite.status).json({ error: traduite.code, ...traduite.details });
    return;
  }

  console.error("Erreur non gérée :", err);
  res.status(500).json({ error: "internal_error" });
}
