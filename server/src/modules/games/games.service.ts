import type { AppContext } from "../../context.ts";
import type { SessionUser } from "../../auth/session.ts";
import { withTransaction } from "../../database/db.ts";
import * as store from "../../database/store.ts";
import type { GameRound } from "../../database/store.ts";
import {
  cashoutCents,
  findMode,
  multiplierAt,
  playStep,
  type GameDefinition,
  type ModeDefinition,
  type Outcome,
} from "../../engine/ladder.ts";
import { HttpError } from "../../http/errors.ts";
import { toCents } from "../../money.ts";
import * as wallet from "../wallet/wallet.service.ts";

/**
 * Orchestration d'une partie, quel que soit le jeu.
 *
 * Règles tenues ici :
 * - l'état de la partie (mise, étape, statut) vit en base, jamais chez le client ;
 * - une seule partie active par joueur ET par jeu (garantie aussi par un index unique) ;
 * - chaque `play` annonce l'étape qu'il croit jouer : un double clic ne rejoue rien ;
 * - la dernière étape réussie encaisse toute seule ;
 * - INVARIANT : lecture de la partie, contrôles, tirage du hasard et écriture se
 *   font dans la MÊME transaction — sinon deux requêtes simultanées (ou deux
 *   répliques) pourraient jouer deux fois la même étape.
 */

export type RoundDto = {
  id: number;
  game: string;
  mode: string;
  status: store.RoundStatus;
  step: number;
  maxSteps: number;
  betCents: number;
  multiplier: number;
  /** Multiplicateur de l'étape suivante, `null` si la partie est finie. */
  nextMultiplier: number | null;
  /** Ce que vaut un encaissement maintenant (gain réel une fois la partie finie). */
  cashoutCents: number;
  payoutCents: number;
  createdAt: string;
  finishedAt?: string;
};

/** Le mode de la partie, ou 400 : une partie héritée peut porter un mode inconnu. */
function requireMode(def: GameDefinition, modeId: string): ModeDefinition {
  const mode = findMode(def, modeId);
  if (!mode) {
    throw new HttpError(400, "unknown_mode", { modes: def.modes.map((m) => m.id) });
  }
  return mode;
}

export function toRoundDto(def: GameDefinition, round: GameRound): RoundDto {
  const mode = findMode(def, round.mode);
  const enCours = round.status === "playing";
  const encaissable = enCours
    ? round.step > 0
      ? cashoutCents(round.betCents, round.multiplier)
      : 0
    : round.payoutCents;

  return {
    id: round.id,
    game: round.game,
    mode: round.mode,
    status: round.status,
    step: round.step,
    maxSteps: def.steps,
    betCents: round.betCents,
    multiplier: round.multiplier,
    nextMultiplier:
      enCours && mode && round.step < def.steps ? multiplierAt(mode, def.steps, round.step + 1) : null,
    cashoutCents: encaissable,
    payoutCents: round.payoutCents,
    createdAt: round.createdAt,
    finishedAt: enCours ? undefined : round.updatedAt,
  };
}

export function currentRound(ctx: AppContext, def: GameDefinition, user: SessionUser): RoundDto | null {
  const round = store.getActiveRound(ctx.db, user.id, def.id);
  return round ? toRoundDto(def, round) : null;
}

export type StartInput = { betCoins: unknown; mode: string };

export function startRound(
  ctx: AppContext,
  def: GameDefinition,
  user: SessionUser,
  input: StartInput,
): RoundDto {
  // Mise et mode sont normalisés (et refusés) AVANT d'ouvrir quoi que ce soit en base.
  const betCents = toCents(input.betCoins);
  const mode = requireMode(def, input.mode);

  return withTransaction(ctx.db, () => {
    const active = store.getActiveRound(ctx.db, user.id, def.id);
    if (active) throw new HttpError(409, "round_active", { round: toRoundDto(def, active) });

    const round = store.createRound(ctx.db, {
      userId: user.id,
      game: def.id,
      betCents,
      mode: mode.id,
    });
    wallet.debit(ctx.db, user.id, betCents, "bet", round.id);
    return toRoundDto(def, round);
  });
}

/** Charge une partie du joueur connecté, pour CE jeu (404 sinon). */
function ownedRound(
  ctx: AppContext,
  def: GameDefinition,
  user: SessionUser,
  roundId: number,
): GameRound {
  const round = store.getRound(ctx.db, roundId);
  if (!round || round.userId !== user.id || round.game !== def.id) {
    throw new HttpError(404, "round_not_found");
  }
  return round;
}

export type PlayInput = { roundId: number; step: number; option: number };
export type PlayResponse = { round: RoundDto; revealed: Outcome[]; outcome: Outcome };

export function play(
  ctx: AppContext,
  def: GameDefinition,
  user: SessionUser,
  input: PlayInput,
): PlayResponse {
  return withTransaction(ctx.db, () => {
    const round = ownedRound(ctx, def, user, input.roundId);
    if (round.status !== "playing") {
      throw new HttpError(409, "round_not_active", { round: toRoundDto(def, round) });
    }
    if (round.step !== input.step) {
      throw new HttpError(409, "step_mismatch", { round: toRoundDto(def, round) });
    }

    const mode = requireMode(def, round.mode);
    if (!Number.isInteger(input.option) || input.option < 0 || input.option >= mode.options) {
      throw new HttpError(400, "invalid_option", { options: mode.options });
    }

    // C'est ici que le hasard tombe, côté serveur, une seule fois par étape.
    const result = playStep(def, mode, round.step, input.option, ctx.drawOptions);

    if (result.outcome === "danger") {
      const closed: GameRound = { ...round, status: "lost", payoutCents: 0 };
      store.saveRound(ctx.db, closed);
      // La mise a déjà été débitée au démarrage : la perte ne bouge pas le solde.
      wallet.record(ctx.db, user.id, closed.id, "loss");
      return { round: toRoundDto(def, reread(ctx, closed)), revealed: result.revealed, outcome: result.outcome };
    }

    const next: GameRound = { ...round, step: result.nextStep, multiplier: result.multiplier };
    // Dernière étape réussie : la partie s'encaisse toute seule, plus d'options.
    if (next.step >= def.steps) {
      next.status = "cashed_out";
      next.payoutCents = cashoutCents(next.betCents, next.multiplier);
      store.saveRound(ctx.db, next);
      wallet.credit(ctx.db, user.id, next.payoutCents, "win", next.id);
    } else {
      store.saveRound(ctx.db, next);
    }
    return { round: toRoundDto(def, reread(ctx, next)), revealed: result.revealed, outcome: result.outcome };
  });
}

export type CashoutResponse = { round: RoundDto; balanceCents: number };

export function cashout(
  ctx: AppContext,
  def: GameDefinition,
  user: SessionUser,
  roundId: number,
): CashoutResponse {
  return withTransaction(ctx.db, () => {
    const round = ownedRound(ctx, def, user, roundId);
    if (round.status !== "playing") {
      throw new HttpError(409, "round_not_active", { round: toRoundDto(def, round) });
    }
    if (round.step === 0) throw new HttpError(409, "nothing_to_cashout");

    const closed: GameRound = {
      ...round,
      status: "cashed_out",
      payoutCents: cashoutCents(round.betCents, round.multiplier),
    };
    store.saveRound(ctx.db, closed);
    const balanceCents = wallet.credit(ctx.db, user.id, closed.payoutCents, "win", closed.id);
    return { round: toRoundDto(def, reread(ctx, closed)), balanceCents };
  });
}

/** Relit la ligne écrite : `updated_at` (donc `finishedAt`) vient de la base. */
function reread(ctx: AppContext, round: GameRound): GameRound {
  return store.getRound(ctx.db, round.id) ?? round;
}
