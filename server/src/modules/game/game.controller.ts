import type { Request, Response } from "express";
import * as gameService from "./game.service.ts";
import { GameError } from "./game.service.ts";
import { getBalance } from "../wallet/wallet.service.ts";

/**
 * Contrôleurs : traduisent HTTP <-> service.
 * Toute GameError devient un 400 (faute du client), le reste un 500.
 */

function handle(res: Response, fn: () => unknown) {
  try {
    res.json(fn());
  } catch (err) {
    if (err instanceof GameError) {
      res.status(400).json({ error: err.message });
    } else {
      console.error(err);
      res.status(500).json({ error: "Internal server error" });
    }
  }
}

export function start(req: Request, res: Response) {
  const { userId, betAmount, mode } = req.body ?? {};
  handle(res, () => gameService.startRound(Number(userId), Number(betAmount), mode));
}

export function play(req: Request, res: Response) {
  const { roundId, userId, selectedDoor } = req.body ?? {};
  handle(res, () => gameService.play(Number(roundId), Number(userId), Number(selectedDoor)));
}

export function cashout(req: Request, res: Response) {
  const { roundId, userId } = req.body ?? {};
  handle(res, () => gameService.cashOut(Number(roundId), Number(userId)));
}

export function history(req: Request, res: Response) {
  handle(res, () => gameService.history(Number(req.params.userId)));
}

export function balance(req: Request, res: Response) {
  handle(res, () => ({ balance: getBalance(Number(req.params.userId)) }));
}
