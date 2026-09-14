import type { AppContext } from "../../context.ts";
import type { SessionUser } from "../../auth/session.ts";
import { withTransaction } from "../../database/db.ts";
import * as store from "../../database/store.ts";
import type { GameRound } from "../../database/store.ts";
import {
  EngineError,
  type EngineResult,
  type GameEngine,
  maxStepsFor,
} from "../../engine/types.ts";
import { HttpError } from "../../http/errors.ts";
import { payoutFor, toCents } from "../../money.ts";
import * as wallet from "../wallet/wallet.service.ts";

/**
 * Orchestration d'une partie, quel que soit le JEU.
 *
 * Ce fichier ne connaît aucun jeu : il ne sait que miser, débiter, faire
 * avancer un moteur, encaisser et journaliser. Tout ce qui décide
 * gagné/perdu/combien vit dans le moteur (`engine/…`).
 *
 * Règles tenues ici :
 * - l'état de la partie (mise, étape, état secret, statut) vit en base, jamais
 *   chez le client, et seul `engine.view(state)` en sort ;
 * - une seule partie active par joueur ET par jeu (garantie aussi par un index unique) ;
 * - chaque `play` annonce l'étape qu'il croit jouer : un double clic ne rejoue rien ;
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
  /** Multiplicateur de l'étape suivante, `null` si la partie est finie ou sans échelle. */
  nextMultiplier: number | null;
  /** Ce que vaut un encaissement maintenant (gain réel une fois la partie finie). */
  cashoutCents: number;
  payoutCents: number;
  /** L'état PUBLIC du jeu : ce que le moteur accepte de montrer. */
  view: unknown;
  createdAt: string;
  finishedAt?: string;
};

/** Traduit un refus du moteur en réponse HTTP : le moteur ne connaît pas Express. */
function fromEngine<T>(action: () => T): T {
  try {
    return action();
  } catch (err) {
    if (err instanceof EngineError) throw new HttpError(err.status, err.code, err.details);
    throw err;
  }
}

/**
 * L'état secret d'une partie. Une partie ouverte avant la migration `0003`
 * n'a pas de `state_json` : son moteur le reconstruit depuis les colonnes.
 */
function stateOf(engine: GameEngine, round: GameRound): unknown {
  if (round.stateJson !== null) return JSON.parse(round.stateJson) as unknown;
  if (!engine.restore) {
    throw new HttpError(500, "round_state_missing", { game: round.game });
  }
  return fromEngine(() =>
    // biome-ignore lint/style/noNonNullAssertion: présence vérifiée juste au-dessus.
    engine.restore!({ mode: round.mode, step: round.step, multiplier: round.multiplier }),
  );
}

export function toRoundDto(engine: GameEngine, round: GameRound): RoundDto {
  const state = stateOf(engine, round);
  const enCours = round.status === "playing";
  const encaissable =
    enCours && engine.canCashout && round.step > 0
      ? payoutFor(round.betCents, round.multiplier)
      : enCours
        ? 0
        : round.payoutCents;

  return {
    id: round.id,
    game: round.game,
    mode: round.mode,
    status: round.status,
    step: round.step,
    // Le mode peut être plus court que le jeu (Vault Code : 5 essais en Sec).
    maxSteps: maxStepsFor(engine, round.mode),
    betCents: round.betCents,
    multiplier: round.multiplier,
    nextMultiplier: enCours ? (engine.nextMultiplier?.(state) ?? null) : null,
    cashoutCents: encaissable,
    payoutCents: round.payoutCents,
    view: fromEngine(() => engine.view(state)),
    createdAt: round.createdAt,
    finishedAt: enCours ? undefined : round.updatedAt,
  };
}

export function currentRound(
  ctx: AppContext,
  engine: GameEngine,
  user: SessionUser,
): RoundDto | null {
  const round = store.getActiveRound(ctx.db, user.id, engine.id);
  return round ? toRoundDto(engine, round) : null;
}

export type StartInput = { betCoins: unknown; mode: string };

export function startRound(
  ctx: AppContext,
  engine: GameEngine,
  user: SessionUser,
  input: StartInput,
): RoundDto {
  // Mise et mode sont normalisés (et refusés) AVANT d'ouvrir quoi que ce soit en base.
  const betCents = toCents(input.betCoins);
  const modes = engine.config().modes;
  if (!modes.some((mode) => mode.id === input.mode)) {
    throw new HttpError(400, "unknown_mode", { modes: modes.map((m) => m.id) });
  }

  return withTransaction(ctx.db, () => {
    const active = store.getActiveRound(ctx.db, user.id, engine.id);
    if (active) throw new HttpError(409, "round_active", { round: toRoundDto(engine, active) });

    const state = fromEngine(() => engine.start(input.mode, ctx.rng));
    const round = store.createRound(ctx.db, {
      userId: user.id,
      game: engine.id,
      betCents,
      mode: input.mode,
      stateJson: JSON.stringify(state),
    });
    wallet.debit(ctx.db, user.id, betCents, "bet", round.id);
    return toRoundDto(engine, round);
  });
}

/** Charge une partie du joueur connecté, pour CE jeu (404 sinon). */
function ownedRound(
  ctx: AppContext,
  engine: GameEngine,
  user: SessionUser,
  roundId: number,
): GameRound {
  const round = store.getRound(ctx.db, roundId);
  if (!round || round.userId !== user.id || round.game !== engine.id) {
    throw new HttpError(404, "round_not_found");
  }
  return round;
}

export type PlayInput = { roundId: number; step: number };
/** `round`, plus ce que le coup a montré (`reveal` du moteur), à plat. */
export type PlayResponse = { round: RoundDto } & Record<string, unknown>;

export function play(
  ctx: AppContext,
  engine: GameEngine,
  user: SessionUser,
  input: PlayInput,
  action: unknown,
): PlayResponse {
  return withTransaction(ctx.db, () => {
    const round = ownedRound(ctx, engine, user, input.roundId);
    if (round.status !== "playing") {
      throw new HttpError(409, "round_not_active", { round: toRoundDto(engine, round) });
    }
    if (round.step !== input.step) {
      throw new HttpError(409, "step_mismatch", { round: toRoundDto(engine, round) });
    }

    // C'est ici que le hasard tombe, côté serveur, une seule fois par coup.
    const state = stateOf(engine, round);
    const result = fromEngine(() => engine.act(state, action, ctx.rng));
    const closed = settle(ctx, user, round, result);
    const reveal = (result.reveal ?? {}) as Record<string, unknown>;
    return { round: toRoundDto(engine, closed), ...reveal };
  });
}

export type CashoutResponse = { round: RoundDto; balanceCents: number };

export function cashout(
  ctx: AppContext,
  engine: GameEngine,
  user: SessionUser,
  roundId: number,
): CashoutResponse {
  // Un jeu sans encaissement le dit d'avance : on ne trouve pas, on perd.
  if (!engine.canCashout || !engine.cashout) {
    throw new HttpError(400, "cashout_not_allowed", { game: engine.id });
  }
  const encaisser = engine.cashout.bind(engine);

  return withTransaction(ctx.db, () => {
    const round = ownedRound(ctx, engine, user, roundId);
    if (round.status !== "playing") {
      throw new HttpError(409, "round_not_active", { round: toRoundDto(engine, round) });
    }

    const state = stateOf(engine, round);
    const result = fromEngine(() => encaisser(state));
    const closed = settle(ctx, user, round, { ...result, status: "cashed_out" });
    return {
      round: toRoundDto(engine, closed),
      balanceCents: wallet.getBalanceCents(ctx.db, user.id),
    };
  });
}

/**
 * Écrit le résultat d'un coup et fait bouger l'argent : le SEUL endroit où une
 * partie change d'état. La mise a déjà été débitée au démarrage — une perte ne
 * touche donc pas au solde, seul un gain est crédité (et plafonné).
 */
function settle(
  ctx: AppContext,
  user: SessionUser,
  round: GameRound,
  result: EngineResult<unknown>,
): GameRound {
  const next: GameRound = {
    ...round,
    step: result.step,
    multiplier: result.multiplier,
    status: result.status,
    stateJson: JSON.stringify(result.state),
    payoutCents:
      result.status === "cashed_out" ? payoutFor(round.betCents, result.multiplier) : 0,
  };
  store.saveRound(ctx.db, next);

  if (next.status === "cashed_out" && next.payoutCents > 0) {
    wallet.credit(ctx.db, user.id, next.payoutCents, "win", next.id);
  } else if (next.status === "lost") {
    wallet.record(ctx.db, user.id, next.id, "loss");
  }
  // `updated_at` (donc `finishedAt`) vient de la base : on relit la ligne écrite.
  return store.getRound(ctx.db, next.id) ?? next;
}
