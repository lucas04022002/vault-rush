import type { ZodType } from "zod";
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
