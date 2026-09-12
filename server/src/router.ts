import { Router } from "express";
import * as game from "./modules/game/game.controller.ts";
import * as user from "./modules/user/user.controller.ts";
import * as leaderboard from "./modules/leaderboard/leaderboard.controller.ts";

export const router = Router();

router.post("/auth/login", user.login);
router.get("/leaderboard", leaderboard.leaderboard);

router.post("/game/start", game.start);
router.post("/game/play", game.play);
router.post("/game/cashout", game.cashout);
router.get("/game/history/:userId", game.history);
router.get("/wallet/balance/:userId", game.balance);
