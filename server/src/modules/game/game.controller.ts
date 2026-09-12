import { z } from "zod";
import type { AppContext } from "../../context.ts";
import { requireUser } from "../../auth/session.ts";
import { route } from "../../http/errors.ts";
import { parseBody } from "../../http/validate.ts";
import * as service from "./game.service.ts";

/** Contrôleurs de partie : session d'abord, corps validé ensuite, service enfin. */

const startSchema = z.object({
  betCoins: z.union([z.string(), z.number()]),
  mode: z.enum(["safe", "risk", "insane"]),
});

const playSchema = z.object({
  roundId: z.number().int().positive(),
  step: z.number().int().min(0),
  option: z.number().int(),
});

const cashoutSchema = z.object({
  roundId: z.number().int().positive(),
});

export function gameController(ctx: AppContext) {
  return {
    current: route((req, res) => {
      const user = requireUser(req);
      res.json({ round: service.currentRound(ctx, user) });
    }),

    start: route((req, res) => {
      const user = requireUser(req);
      const input = parseBody(startSchema, req.body);
      res.status(201).json({ round: service.startRound(ctx, user, input) });
    }),

    play: route((req, res) => {
      const user = requireUser(req);
      const input = parseBody(playSchema, req.body);
      res.json(service.play(ctx, user, input));
    }),

    cashout: route((req, res) => {
      const user = requireUser(req);
      const { roundId } = parseBody(cashoutSchema, req.body);
      res.json(service.cashout(ctx, user, roundId));
    }),
  };
}
