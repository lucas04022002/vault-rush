import { requireUser } from "../../auth/session.ts";
import type { AppContext } from "../../context.ts";
import { engineFor } from "../../engine/registry.ts";
import { listUserRounds } from "../../database/store.ts";
import { route } from "../../http/errors.ts";
import { parseGameFilter, parseLimit } from "../../http/validate.ts";

/**
 * Historique du joueur connecté : ses parties terminées, tous jeux confondus
 * ou filtrées par jeu. Le bénéfice net est calculé par la base (gain − mise).
 */

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export function historyController(ctx: AppContext) {
  return route((req, res) => {
    const user = requireUser(req);
    const game = parseGameFilter(req);
    const limit = parseLimit(req.query.limit, DEFAULT_LIMIT, MAX_LIMIT);

    const rounds = listUserRounds(ctx.db, user.id, { game, limit }).map((round) => ({
      ...round,
      // Le nombre d'étapes vient du moteur du jeu, pas de la base.
      maxSteps: engineFor(round.game, ctx.engines)?.config().steps ?? round.step,
    }));

    res.json({ rounds });
  });
}
