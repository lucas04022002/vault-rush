import type { Request } from "express";
import type { ZodType } from "zod";
import { isGameId, type GameId } from "../engine/definitions.ts";
import { HttpError } from "./errors.ts";

/**
 * Validation des corps de requête avec zod : un seul point d'entrée,
 * un seul format d'erreur (400 `{ error: "invalid_body", details: [...] }`).
 */

export function parseBody<T>(schema: ZodType<T>, body: unknown): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new HttpError(400, "invalid_body", {
      details: parsed.error.issues.map((issue) => ({
        field: issue.path.join(".") || "(corps)",
        message: issue.message,
      })),
    });
  }
  return parsed.data;
}

/**
 * Limite de pagination : valeur par défaut, plafond dur, et refus de tout ce
 * qui n'est pas un entier positif (une limite absurde est ramenée au plafond,
 * pas transformée en erreur).
 */
export function parseLimit(raw: unknown, fallback: number, max: number): number {
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < 1) {
    throw new HttpError(400, "invalid_limit", { maxLimit: max });
  }
  return Math.min(value, max);
}

/** Filtre `?game=` d'une liste : absent, ou un jeu existant (404 sinon). */
export function parseGameFilter(req: Request): GameId | undefined {
  const game = req.query.game;
  if (game === undefined || game === "") return undefined;
  if (!isGameId(game)) throw new HttpError(404, "unknown_game");
  return game;
}
