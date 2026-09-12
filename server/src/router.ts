import { Router } from "express";
import type { AppContext } from "./context.ts";
import { authController } from "./modules/auth/auth.controller.ts";
import { gameController } from "./modules/game/game.controller.ts";
import { GAME_ID } from "./modules/game/game.service.ts";
import { healthController } from "./modules/health/health.controller.ts";
import { leaderboardController } from "./modules/leaderboard/leaderboard.controller.ts";
import { walletController } from "./modules/wallet/wallet.controller.ts";

/**
 * Routes de l'API. Aucune ne prend d'identifiant de joueur dans l'URL ou le corps :
 * l'identité vient du cookie de session.
 */
export function createRouter(ctx: AppContext): Router {
  const router = Router();
  const auth = authController(ctx);
  const game = gameController(ctx);
  const wallet = walletController(ctx);

  router.get("/health", healthController(ctx));

  router.post("/auth/register", auth.register);
  router.post("/auth/login", auth.login);
  router.post("/auth/set-password", auth.setPassword);
  router.post("/auth/logout", auth.logout);
  router.get("/auth/me", auth.me);

  router.get("/wallet", wallet.balance);
  router.post("/wallet/refill", wallet.refill);

  router.get("/leaderboard", leaderboardController(ctx));

  // Un seul jeu pour l'instant ; le préfixe générique /api/games/:game arrive
  // avec le moteur commun (tâche 2), Laser Grid avec lui.
  const games = Router();
  games.get("/current", game.current);
  games.post("/start", game.start);
  games.post("/play", game.play);
  games.post("/cashout", game.cashout);
  router.use(`/games/${GAME_ID}`, games);

  return router;
}
