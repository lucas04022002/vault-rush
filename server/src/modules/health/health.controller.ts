import type { AppContext } from "../../context.ts";
import { route } from "../../http/errors.ts";

/** Sonde de santé : le serveur répond ET la base répond. */
export function healthController(ctx: AppContext) {
  return route((_req, res) => {
    let db = false;
    try {
      ctx.db.prepare("SELECT 1").get();
      db = true;
    } catch (err) {
      console.error("Base injoignable :", err);
    }
    res.status(db ? 200 : 503).json({ ok: db, db });
  });
}
