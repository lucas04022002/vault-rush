import type { AppContext } from "../../context.ts";
import { withTransaction } from "../../database/db.ts";
import * as store from "../../database/store.ts";
import type { GameRound } from "../../database/store.ts";
import { HttpError } from "../../http/errors.ts";
import { MAX_PAYOUT_CENTS, payoutCentsFor, toCents } from "../../money.ts";
import type { SessionUser } from "../../auth/session.ts";
import * as wallet from "../wallet/wallet.service.ts";
import { GAME_MODES, type GameMode } from "./game.algorithm.ts";

/**
 * Orchestration d'une partie de Vault Rush.
 *
 * Règles tenues ici :
 * - l'état de la partie (mise, étage, statut) vit en base, jamais chez le client ;
 * - une seule partie active par joueur (garantie aussi par un index unique) ;
 * - chaque `play` annonce l'étape qu'il croit jouer : un double clic ne rejoue rien ;
 * - le dernier étage réussi encaisse tout seul ;
 * - toute opération d'argent est dans une transaction.
 */

export const GAME_ID = "vault-rush";

export type RoundDto = {
  id: number;
  game: string;
  mode: GameMode;
  status: store.RoundStatus;
  step: number;
  maxSteps: number;
  betCents: number;
  multiplier: number;
  cashoutCents: number;
  payoutCents: number;
  maxPayoutCents: number;
  createdAt: string;
};

export function toRoundDto(round: GameRound): RoundDto {
  const config = GAME_MODES[round.mode];
  const cashoutCents =
    round.status === "playing"
      ? round.step > 0
        ? payoutCentsFor(round.betCents, round.multiplier)
        : 0
      : round.payoutCents;

  return {
    id: round.id,
    game: round.game,
    mode: round.mode,
    status: round.status,
    step: round.step,
    maxSteps: config.maxFloor,
    betCents: round.betCents,
    multiplier: round.multiplier,
    cashoutCents,
    payoutCents: round.payoutCents,
    maxPayoutCents: MAX_PAYOUT_CENTS,
    createdAt: round.createdAt,
  };
}

export function currentRound(ctx: AppContext, user: SessionUser): RoundDto | null {
  const round = store.getActiveRound(ctx.db, user.id, GAME_ID);
  return round ? toRoundDto(round) : null;
}

export type StartInput = { betCoins: unknown; mode: GameMode };

export function startRound(ctx: AppContext, user: SessionUser, input: StartInput): RoundDto {
  // La mise est normalisée (et refusée) AVANT d'ouvrir quoi que ce soit en base.
  const betCents = toCents(input.betCoins);

  return withTransaction(ctx.db, () => {
    const active = store.getActiveRound(ctx.db, user.id, GAME_ID);
    if (active) throw new HttpError(409, "round_active", { round: toRoundDto(active) });

    const round = store.createRound(ctx.db, {
      userId: user.id,
      game: GAME_ID,
      betCents,
      mode: input.mode,
    });
    wallet.debit(ctx.db, user.id, betCents, "bet", round.id);
    return toRoundDto(round);
  });
}

/** Charge une partie du joueur connecté (404 si elle ne lui appartient pas). */
function ownedRound(ctx: AppContext, user: SessionUser, roundId: number): GameRound {
  const round = store.getRound(ctx.db, roundId);
  if (!round || round.userId !== user.id || round.game !== GAME_ID) {
    throw new HttpError(404, "round_not_found");
  }
  return round;
}

export type PlayInput = { roundId: number; step: number; option: number };
export type PlayResponse = { round: RoundDto; revealed: ("safe" | "alarm")[] };

export function play(ctx: AppContext, user: SessionUser, input: PlayInput): PlayResponse {
  const round = ownedRound(ctx, user, input.roundId);
  if (round.status !== "playing") {
    throw new HttpError(409, "round_not_active", { round: toRoundDto(round) });
  }
  if (round.step !== input.step) {
    throw new HttpError(409, "step_mismatch", { round: toRoundDto(round) });
  }

  const config = GAME_MODES[round.mode];
  if (input.option < 0 || input.option >= config.doors) {
    throw new HttpError(400, "invalid_option", { options: config.doors });
  }

  // C'est ici que le hasard tombe, côté serveur, une seule fois par étape.
  const result = ctx.playFloor(round.mode, input.option, round.step);

  if (result.status === "lost") {
    const lost = withTransaction(ctx.db, () => {
      const closed: GameRound = { ...round, status: "lost", payoutCents: 0 };
      store.saveRound(ctx.db, closed);
      // La mise a déjà été débitée au démarrage : la perte ne bouge pas le solde.
      wallet.record(ctx.db, user.id, closed.id, "loss");
      return closed;
    });
    return { round: toRoundDto(lost), revealed: result.doors };
  }

  const advanced = withTransaction(ctx.db, () => {
    const next: GameRound = { ...round, step: result.nextFloor, multiplier: result.multiplier };
    // Dernier étage réussi : la partie s'encaisse toute seule, plus de portes.
    if (next.step >= config.maxFloor) {
      next.status = "cashed_out";
      next.payoutCents = payoutCentsFor(next.betCents, next.multiplier);
      store.saveRound(ctx.db, next);
      wallet.credit(ctx.db, user.id, next.payoutCents, "win", next.id);
    } else {
      store.saveRound(ctx.db, next);
    }
    return next;
  });

  return { round: toRoundDto(advanced), revealed: result.doors };
}

export type CashoutResponse = { round: RoundDto; balanceCents: number };

export function cashout(ctx: AppContext, user: SessionUser, roundId: number): CashoutResponse {
  const round = ownedRound(ctx, user, roundId);
  if (round.status !== "playing") {
    throw new HttpError(409, "round_not_active", { round: toRoundDto(round) });
  }
  if (round.step === 0) throw new HttpError(409, "nothing_to_cashout");

  return withTransaction(ctx.db, () => {
    const closed: GameRound = {
      ...round,
      status: "cashed_out",
      payoutCents: payoutCentsFor(round.betCents, round.multiplier),
    };
    store.saveRound(ctx.db, closed);
    const balanceCents = wallet.credit(ctx.db, user.id, closed.payoutCents, "win", closed.id);
    return { round: toRoundDto(closed), balanceCents };
  });
}
