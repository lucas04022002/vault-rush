import type { Request, Response } from "express";
import { getLeaderboard } from "../../database/store.ts";

export function leaderboard(_req: Request, res: Response) {
  try {
    res.json(getLeaderboard(10));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
}
