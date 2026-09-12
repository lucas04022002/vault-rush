import type { Request, RequestHandler } from "express";
import { z } from "zod";
import { requireUser } from "../../auth/session.ts";
import type { AppContext } from "../../context.ts";
import { GAMES, allGames, isGameId } from "../../engine/definitions.ts";
import { configFor, type GameDefinition } from "../../engine/ladder.ts";
import { HttpError, route } from "../../http/errors.ts";
import { parseBody } from "../../http/validate.ts";
import * as service from "./games.service.ts";

/**
 * Routes génériques `/api/games/:game/…` : le jeu est résolu une fois,
 * en amont, puis passé au service. Ajouter un jeu ne touche pas ce fichier.
 */

const startSchema = z.object({
  betCoins: z.union([z.string(), z.number()]),
  mode: z.string().min(1),
});

const playSchema = z.object({
  roundId: z.number().int().positive(),
  step: z.number().int().min(0),
  option: z.number().int(),
});

const cashoutSchema = z.object({
  roundId: z.number().int().positive(),
});

type RequestWithGame = Request & { game?: GameDefinition };

/** Le jeu résolu par `resolveGame`. */
function gameOf(req: Request): GameDefinition {
  const game = (req as RequestWithGame).game;
  if (!game) throw new HttpError(404, "unknown_game");
  return game;
}

export function gamesController(ctx: AppContext) {
  /** Traduit `:game` en définition, ou 404 : aucun autre contrôle n'en dépend. */
  const resolveGame: RequestHandler = (req, _res, next) => {
    const id = req.params.game;
    if (!isGameId(id)) return next(new HttpError(404, "unknown_game"));
    (req as RequestWithGame).game = GAMES[id];
    next();
  };

  return {
    resolveGame,

    /** Catalogue public : de quoi dessiner l'arcade sans être connecté. */
    list: route((_req, res) => {
      res.json({ games: allGames().map(configFor) });
    }),

    config: route((req, res) => {
      res.json({ game: configFor(gameOf(req)) });
    }),

    current: route((req, res) => {
      const user = requireUser(req);
      res.json({ round: service.currentRound(ctx, gameOf(req), user) });
    }),

    start: route((req, res) => {
      const user = requireUser(req);
      const input = parseBody(startSchema, req.body);
      res.status(201).json({ round: service.startRound(ctx, gameOf(req), user, input) });
    }),

    play: route((req, res) => {
      const user = requireUser(req);
      const input = parseBody(playSchema, req.body);
      res.json(service.play(ctx, gameOf(req), user, input));
    }),

    cashout: route((req, res) => {
      const user = requireUser(req);
      const { roundId } = parseBody(cashoutSchema, req.body);
      res.json(service.cashout(ctx, gameOf(req), user, roundId));
    }),
  };
}
