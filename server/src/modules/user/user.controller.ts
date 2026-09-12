import type { Request, Response } from "express";
import { login as loginService } from "./user.service.ts";
import { GameError } from "../game/game.service.ts";

export function login(req: Request, res: Response) {
  try {
    res.json(loginService(req.body?.username));
  } catch (err) {
    if (err instanceof GameError) {
      res.status(400).json({ error: err.message });
    } else {
      console.error(err);
      res.status(500).json({ error: "Internal server error" });
    }
  }
}
