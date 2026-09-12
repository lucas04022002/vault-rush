import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import cookieParser from "cookie-parser";
import express, { type Express } from "express";
import helmet from "helmet";
import { createRateLimiter } from "./auth/rateLimit.ts";
import { readSecret } from "./auth/jwt.ts";
import { sessionMiddleware } from "./auth/session.ts";
import type { AppContext } from "./context.ts";
import { openDb } from "./database/db.ts";
import { runMigrations } from "./database/migrate.ts";
import { getUser } from "./database/store.ts";
import { errorHandler, notFoundHandler } from "./http/errors.ts";
import { corsForClient, originGuard } from "./http/origin.ts";
import { drawOptions as realDrawOptions, type DrawFn } from "./engine/ladder.ts";
import { createRouter } from "./router.ts";

/**
 * Construction de l'application.
 *
 * `createApp()` ouvre sa propre base et applique les migrations : un test peut
 * donc demander `:memory:` et repartir d'une base vierge à chaque fichier.
 */

export type CreateAppOptions = {
  dbPath?: string;
  /** Tirage d'une étape ; les tests l'injectent pour neutraliser le hasard. */
  drawOptions?: DrawFn;
};

const LOGIN_ATTEMPTS = 10;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const CLIENT_DIST = fileURLToPath(new URL("../../client/dist/", import.meta.url));

/**
 * Nombre de proxys de confiance devant le serveur.
 *
 * Tout ce qui n'est pas un entier ≥ 0 vaut 0 (fermé par défaut) : `1.5` ou
 * `"abc"` doivent se voir au démarrage, pas se transformer en confiance floue.
 */
export function readProxyHops(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === "") return 0;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) {
    console.warn(
      `TRUSTED_PROXY_HOPS ignoré : « ${raw} » n'est pas un entier ≥ 0, aucun proxy n'est de confiance.`,
    );
    return 0;
  }
  return value;
}

export function createApp(options: CreateAppOptions = {}): Express {
  const isProduction = process.env.NODE_ENV === "production";
  const trustedProxyHops = readProxyHops(process.env.TRUSTED_PROXY_HOPS);
  const ctx: AppContext = {
    db: openDb(options.dbPath),
    config: {
      // Obligatoire : le serveur refuse de démarrer sans secret sérieux.
      secret: readSecret(process.env.JWT_SECRET),
      cookieSecure: process.env.COOKIE_SECURE === "1" || (isProduction && process.env.COOKIE_SECURE !== "0"),
      clientUrl: process.env.CLIENT_URL || undefined,
      isProduction,
    },
    loginLimiter: createRateLimiter({ max: LOGIN_ATTEMPTS, windowMs: LOGIN_WINDOW_MS }),
    drawOptions: options.drawOptions ?? realDrawOptions,
  };
  runMigrations(ctx.db);

  const app = express();
  app.locals.ctx = ctx;
  app.disable("x-powered-by");
  // Derrière un proxy TLS (Coolify/Traefik), c'est lui qui parle en HTTPS :
  // sans cette confiance déclarée, `req.protocol` reste « http » et la garde
  // d'origine refuserait toutes les mutations en production.
  if (trustedProxyHops > 0) app.set("trust proxy", trustedProxyHops);
  // CSP par défaut de helmet : le client construit n'a ni script ni style en
  // ligne, et ses polices sont auto-hébergées — `default-src 'self'` suffit.
  app.use(helmet());
  if (ctx.config.clientUrl) app.use(corsForClient(ctx.config.clientUrl));
  app.use(express.json({ limit: "16kb" }));
  app.use(cookieParser());
  app.use(originGuard(ctx.config.clientUrl));
  app.use(sessionMiddleware(ctx.config, (userId) => getUser(ctx.db, userId) !== undefined));

  app.use("/api", createRouter(ctx));
  app.use("/api", notFoundHandler);

  // En production, le serveur sert aussi le client construit.
  if (isProduction && existsSync(CLIENT_DIST)) {
    app.use(express.static(CLIENT_DIST));
    app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile("index.html", { root: CLIENT_DIST }));
  }

  app.use(errorHandler);
  return app;
}

/** Point d'entrée : `node src/app.ts`. */
function main() {
  const app = createApp();
  const port = Number(process.env.PORT) || 3001;
  app.listen(port, () => {
    console.log(`Vault Rush API en écoute sur http://127.0.0.1:${port}`);
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
