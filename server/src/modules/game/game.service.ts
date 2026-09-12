import {
  GAME_MODES,
  playFloor,
  calculateCashOut,
  type GameMode,
} from "./game.algorithm.ts";
import {
  getUser,
  createRound,
  getRound,
  saveRound,
  getUserRounds,
  type GameRound,
} from "../../database/store.ts";
import { getBalance, debit, credit } from "../wallet/wallet.service.ts";

/**
 * Orchestration d'une partie. Applique TOUTES les règles de sécurité :
 * - on ne fait jamais confiance au frontend
 * - l'état de la partie (étage, statut, mise) vit côté serveur
 */

/** Erreur métier (réponse 400) vs erreur serveur (500). */
export class GameError extends Error {}

const VALID_MODES: GameMode[] = ["safe", "risk", "insane"];

export type StartResult = {
  roundId: number;
  balance: number;
  currentFloor: number;
  multiplier: number;
  doors: number;
  status: "playing";
};

export function startRound(
  userId: number,
  betAmount: number,
  mode: GameMode,
): StartResult {
  if (!getUser(userId)) throw new GameError("User not found");
  if (!VALID_MODES.includes(mode)) throw new GameError("Invalid mode");
  if (typeof betAmount !== "number" || !Number.isFinite(betAmount)) {
    throw new GameError("Invalid bet amount");
  }
  if (betAmount <= 0) throw new GameError("Bet must be greater than 0");
  if (betAmount > getBalance(userId)) throw new GameError("Insufficient balance");

  const round = createRound({
    userId,
    betAmount: Number(betAmount.toFixed(2)),
    mode,
    currentFloor: 0,
    multiplier: 1,
    status: "playing",
    payout: 0,
  });

  // On retire la mise immédiatement (la trace de transaction est écrite par le wallet).
  const balance = debit(userId, round.betAmount, "bet", round.id);

  return {
    roundId: round.id,
    balance,
    currentFloor: 0,
    multiplier: 1,
    doors: GAME_MODES[mode].doors,
    status: "playing",
  };
}

/** Récupère une partie en s'assurant qu'elle appartient bien au joueur. */
function getOwnedRound(roundId: number, userId: number): GameRound {
  const round = getRound(roundId);
  if (!round) throw new GameError("Round not found");
  if (round.userId !== userId) throw new GameError("Round does not belong to user");
  return round;
}

export type PlayResponse =
  | {
      status: "playing";
      result: "safe";
      currentFloor: number;
      multiplier: number;
      potentialWin: number;
    }
  | { status: "lost"; result: "alarm"; payout: 0 };

export function play(
  roundId: number,
  userId: number,
  selectedDoor: number,
): PlayResponse {
  const round = getOwnedRound(roundId, userId);

  if (round.status !== "playing") throw new GameError("Round is not active");
  if (!Number.isInteger(selectedDoor)) throw new GameError("Invalid door");

  const result = playFloor(round.mode, selectedDoor, round.currentFloor);

  if (result.status === "lost") {
    round.status = "lost";
    round.payout = 0;
    saveRound(round);
    return { status: "lost", result: "alarm", payout: 0 };
  }

  round.currentFloor = result.nextFloor;
  round.multiplier = result.multiplier;
  saveRound(round);

  return {
    status: "playing",
    result: "safe",
    currentFloor: round.currentFloor,
    multiplier: round.multiplier,
    potentialWin: calculateCashOut(round.betAmount, round.multiplier),
  };
}

export type CashOutResponse = {
  status: "cashed_out";
  payout: number;
  newBalance: number;
};

export function cashOut(roundId: number, userId: number): CashOutResponse {
  const round = getOwnedRound(roundId, userId);

  if (round.status !== "playing") throw new GameError("Round is not active");
  if (round.currentFloor === 0) {
    throw new GameError("Cannot cash out before first successful floor");
  }

  const payout = calculateCashOut(round.betAmount, round.multiplier);
  round.status = "cashed_out";
  round.payout = payout;
  saveRound(round);

  const newBalance = credit(userId, payout, "win", round.id);
  return { status: "cashed_out", payout, newBalance };
}

export function history(userId: number) {
  if (!getUser(userId)) throw new GameError("User not found");
  return getUserRounds(userId).map((r) => ({
    id: r.id,
    betAmount: r.betAmount,
    mode: r.mode,
    result: r.status,
    payout: r.payout,
    createdAt: r.createdAt,
  }));
}
