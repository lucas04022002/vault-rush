import { Router } from "express";
import type { AppContext } from "./context.ts";
import { authController } from "./modules/auth/auth.controller.ts";
import { gamesController } from "./modules/games/games.controller.ts";
import { healthController } from "./modules/health/health.controller.ts";
import { historyController } from "./modules/history/history.controller.ts";
import { leaderboardController } from "./modules/leaderboard/leaderboard.controller.ts";
import { walletController } from "./modules/wallet/wallet.controller.ts";

/**
 * Routes de l'API. Aucune ne prend d'identifiant de joueur dans l'URL ou le corps :
 * l'identité vient du cookie de session.
 */
export function createRouter(ctx: AppContext): Router {
  const router = Router();
  const auth = authController(ctx);
  const games = gamesController(ctx);
  const wallet = walletController(ctx);

  router.get("/health", healthController(ctx));

  router.post("/auth/register", auth.register);
  router.post("/auth/login", auth.login);
  router.post("/auth/set-password", auth.setPassword);
  router.post("/auth/logout", auth.logout);
  router.get("/auth/me", auth.me);

  router.get("/wallet", wallet.balance);
  router.post("/wallet/refill", wallet.refill);

  router.get("/history", historyController(ctx));
  router.get("/leaderboard", leaderboardController(ctx));

  // Catalogue, puis les routes de partie : un seul jeu de routes pour tous les jeux.
  router.get("/games", games.list);

  const jeu = Router({ mergeParams: true });
  jeu.use(games.resolveGame);
  jeu.get("/config", games.config);
  jeu.get("/current", games.current);
  jeu.post("/start", games.start);
  jeu.post("/play", games.play);
  jeu.post("/cashout", games.cashout);
  router.use("/games/:game", jeu);

  return router;
}
