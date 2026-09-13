import type { Request, RequestHandler } from "express";
import { z } from "zod";
import { requireUser } from "../../auth/session.ts";
import type { AppContext } from "../../context.ts";
import { allGames, engineFor } from "../../engine/registry.ts";
import type { GameEngine } from "../../engine/types.ts";
import { HttpError, route } from "../../http/errors.ts";
import { parseBody } from "../../http/validate.ts";
import * as service from "./games.service.ts";

/**
 * Routes génériques `/api/games/:game/…` : le moteur du jeu est résolu une
 * fois, en amont, puis passé au service. Ajouter un jeu ne touche pas ce
 * fichier — pas même pour son coup, dont les champs propres sont validés par
 * `engine.actionSchema`.
 */

const startSchema = z.object({
  betCoins: z.union([z.string(), z.number()]),
  mode: z.string().min(1),
});

/** L'enveloppe d'un coup, commune à tous les jeux. */
const playSchema = z.object({
  roundId: z.number().int().positive(),
  step: z.number().int().min(0),
});

const cashoutSchema = z.object({
  roundId: z.number().int().positive(),
});

type RequestWithEngine = Request & { engine?: GameEngine };

/** Le moteur résolu par `resolveGame`. */
function engineOf(req: Request): GameEngine {
  const engine = (req as RequestWithEngine).engine;
  if (!engine) throw new HttpError(404, "unknown_game");
  return engine;
}

export function gamesController(ctx: AppContext) {
  /** Traduit `:game` en moteur, ou 404 : aucun autre contrôle n'en dépend. */
  const resolveGame: RequestHandler = (req, _res, next) => {
    const engine = engineFor(req.params.game, ctx.engines);
    if (!engine) return next(new HttpError(404, "unknown_game"));
    (req as RequestWithEngine).engine = engine;
    next();
  };

  return {
    resolveGame,

    /** Catalogue public : de quoi dessiner l'arcade sans être connecté. */
    list: route((_req, res) => {
      res.json({ games: allGames(ctx.engines).map((engine) => engine.config()) });
    }),

    config: route((req, res) => {
      res.json({ game: engineOf(req).config() });
    }),

    current: route((req, res) => {
      const user = requireUser(req);
      res.json({ round: service.currentRound(ctx, engineOf(req), user) });
    }),

    start: route((req, res) => {
      const user = requireUser(req);
      const input = parseBody(startSchema, req.body);
      res.status(201).json({ round: service.startRound(ctx, engineOf(req), user, input) });
    }),

    play: route((req, res) => {
      const user = requireUser(req);
      const engine = engineOf(req);
      // L'enveloppe d'abord, puis les champs propres au jeu : un seul 400.
      const input = parseBody(playSchema, req.body);
      const action = parseBody(engine.actionSchema, req.body);
      res.json(service.play(ctx, engine, user, input, action));
    }),

    cashout: route((req, res) => {
      const user = requireUser(req);
      const { roundId } = parseBody(cashoutSchema, req.body);
      res.json(service.cashout(ctx, engineOf(req), user, roundId));
    }),
  };
}
