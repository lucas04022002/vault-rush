import request from "supertest";
import type { Express } from "express";
import { createApp, type CreateAppOptions } from "../src/app.ts";
import type { Outcome } from "../src/engine/ladder.ts";

/**
 * Outillage commun aux tests : chaque fichier ouvre sa propre base en mémoire,
 * il n'y a donc aucun état partagé entre les suites.
 */

// Doit être posé AVANT le premier appel à createApp() (aucun module ne lit l'env à l'import).
process.env.JWT_SECRET ??= "secret-de-test-assez-long-pour-32-caracteres";
process.env.COOKIE_SECURE = "0";
process.env.NODE_ENV = "test";

export function makeApp(options: Partial<CreateAppOptions> = {}): Express {
  return createApp({ dbPath: ":memory:", ...options });
}

/** Accès direct à la base de l'app, pour vérifier le journal ou fabriquer un état. */
export function ctxOf(app: Express) {
  return app.locals.ctx;
}

/**
 * Tirages truqués : le nombre d'options sûres reste exact (comme le vrai tirage),
 * seul l'ordre est figé. Le joueur qui choisit l'option 0 gagne avec `firstSafe`
 * et perd avec `firstDanger`.
 */
export function firstSafe(options: number, safeOptions: number): Outcome[] {
  return Array.from({ length: options }, (_, i) => (i < safeOptions ? "safe" : "danger"));
}

export function firstDanger(options: number, safeOptions: number): Outcome[] {
  const dangers = options - safeOptions;
  return Array.from({ length: options }, (_, i) => (i < dangers ? "danger" : "safe"));
}

/** Crée un compte et renvoie un agent supertest qui garde le cookie de session. */
export async function signUp(app: Express, username = "joueuse", password = "motdepasse1") {
  const agent = request.agent(app);
  const res = await agent.post("/api/auth/register").send({ username, password });
  if (res.status !== 201) throw new Error(`inscription échouée: ${res.status} ${res.text}`);
  return { agent, userId: res.body.user.id as number };
}
