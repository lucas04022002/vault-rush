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

/** Gestionnaire terminal : jamais de pile dans la réponse. */
export function errorHandler(err: unknown, _req: Request, res: Response, next: NextFunction) {
  if (res.headersSent) return next(err);

  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.code, ...err.details });
    return;
  }

  console.error("Erreur non gérée :", err);
  res.status(500).json({ error: "internal_error" });
}
