import type { AppContext } from "../../context.ts";
import { getLeaderboard } from "../../database/store.ts";
import { route } from "../../http/errors.ts";

/** Classement public : par bénéfice net, en centimes. */
export function leaderboardController(ctx: AppContext) {
  return route((_req, res) => {
    res.json(getLeaderboard(ctx.db, 10));
  });
}
