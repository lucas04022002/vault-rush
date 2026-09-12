import type { Db } from "../../database/db.ts";
import { getLeaderboard, type LeaderboardRow } from "../../database/store.ts";
import type { GameId } from "../../engine/definitions.ts";

/**
 * Classement public : bénéfice net cumulé sur 30 jours, par jeu ou tous jeux
 * confondus. Le solde n'entre jamais dans le calcul (une recharge ne classe pas).
 */

export const LEADERBOARD_SIZE = 10;
export const MAX_LEADERBOARD_SIZE = 50;

export type LeaderboardEntry = LeaderboardRow;

export function leaderboard(
  db: Db,
  options: { game?: GameId; limit?: number } = {},
): LeaderboardEntry[] {
  return getLeaderboard(db, {
    game: options.game,
    limit: options.limit ?? LEADERBOARD_SIZE,
  });
}
