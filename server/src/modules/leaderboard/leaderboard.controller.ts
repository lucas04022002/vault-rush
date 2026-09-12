import type { AppContext } from "../../context.ts";
import { route } from "../../http/errors.ts";
import { parseGameFilter, parseLimit } from "../../http/validate.ts";
import { LEADERBOARD_SIZE, MAX_LEADERBOARD_SIZE, leaderboard } from "./leaderboard.service.ts";

/** Classement public (aucune session requise) : `?game=` filtre sur un jeu. */
export function leaderboardController(ctx: AppContext) {
  return route((req, res) => {
    const game = parseGameFilter(req);
    const limit = parseLimit(req.query.limit, LEADERBOARD_SIZE, MAX_LEADERBOARD_SIZE);
    res.json({ entries: leaderboard(ctx.db, { game, limit }) });
  });
}
