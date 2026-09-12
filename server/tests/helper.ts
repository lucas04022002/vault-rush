import request from "supertest";
import type { Express } from "express";
import { createApp, type CreateAppOptions } from "../src/app.ts";
import { getMultiplier, type GameMode, type PlayResult } from "../src/modules/game/game.algorithm.ts";

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

/** Tirage truqué : toutes les portes sont sûres (le hasard est neutralisé). */
export function alwaysSafe(mode: GameMode, _door: number, currentFloor: number): PlayResult {
  const nextFloor = currentFloor + 1;
  return {
    status: "playing",
    result: "safe",
    nextFloor,
    multiplier: getMultiplier(mode, nextFloor),
    doors: ["safe", "safe", "safe"],
  };
}

/** Tirage truqué : la porte choisie est toujours une alarme. */
export function alwaysAlarm(_mode: GameMode, _door: number, currentFloor: number): PlayResult {
  return {
    status: "lost",
    result: "alarm",
    nextFloor: currentFloor,
    multiplier: 0,
    doors: ["alarm", "alarm", "alarm"],
  };
}

/** Crée un compte et renvoie un agent supertest qui garde le cookie de session. */
export async function signUp(app: Express, username = "joueuse", password = "motdepasse1") {
  const agent = request.agent(app);
  const res = await agent.post("/api/auth/register").send({ username, password });
  if (res.status !== 201) throw new Error(`inscription échouée: ${res.status} ${res.text}`);
  return { agent, userId: res.body.user.id as number };
}
