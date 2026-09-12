import type { Db } from "./database/db.ts";
import type { RateLimiter } from "./auth/rateLimit.ts";
import type { GameMode, PlayResult } from "./modules/game/game.algorithm.ts";

/**
 * Contexte de l'application : tout ce qu'une route peut avoir besoin de toucher.
 * Il est construit par `createApp()` et passé explicitement aux contrôleurs —
 * aucun module n'ouvre de base ni ne lit l'environnement à l'import, ce qui
 * permet à chaque test d'avoir sa propre base en mémoire.
 */

/** Signature du tirage d'un étage (injectable pour neutraliser le hasard en test). */
export type PlayFloorFn = (
  mode: GameMode,
  selectedDoorIndex: number,
  currentFloor: number,
) => PlayResult;

export type AppConfig = {
  /** Secret HS256 déjà encodé (issu de `JWT_SECRET`). */
  secret: Uint8Array;
  cookieSecure: boolean;
  clientUrl?: string;
  isProduction: boolean;
};

export type AppContext = {
  db: Db;
  config: AppConfig;
  loginLimiter: RateLimiter;
  playFloor: PlayFloorFn;
};
