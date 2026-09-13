import type { Db } from "./database/db.ts";
import type { RateLimiter } from "./auth/rateLimit.ts";
import type { EngineRegistry, Rng } from "./engine/types.ts";

/**
 * Contexte de l'application : tout ce qu'une route peut avoir besoin de toucher.
 * Il est construit par `createApp()` et passé explicitement aux contrôleurs —
 * aucun module n'ouvre de base ni ne lit l'environnement à l'import, ce qui
 * permet à chaque test d'avoir sa propre base en mémoire.
 */

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
  /** Les moteurs servis par cette application : un par jeu. */
  engines: EngineRegistry;
  /** La source d'aléa des moteurs ; injectable pour neutraliser le hasard. */
  rng: Rng;
};
