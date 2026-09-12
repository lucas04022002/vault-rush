import type { AppContext } from "../../context.ts";
import { requireUser } from "../../auth/session.ts";
import { route } from "../../http/errors.ts";
import * as service from "./wallet.service.ts";

export function walletController(ctx: AppContext) {
  return {
    balance: route((req, res) => {
      const user = requireUser(req);
      res.json({ balanceCents: service.getBalanceCents(ctx.db, user.id) });
    }),

    refill: route((req, res) => {
      const user = requireUser(req);
      res.json(service.refill(ctx.db, user.id));
    }),
  };
}
