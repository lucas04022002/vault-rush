import type { Response } from "express";
import { z } from "zod";
import type { AppContext } from "../../context.ts";
import { signSession } from "../../auth/jwt.ts";
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from "../../auth/password.ts";
import { clearSessionCookie, requireUser, setSessionCookie } from "../../auth/session.ts";
import { route } from "../../http/errors.ts";
import { parseBody } from "../../http/validate.ts";
import * as service from "./auth.service.ts";
import type { Account } from "./auth.service.ts";

/** Contrôleurs de compte : ce sont eux qui posent (ou retirent) le cookie de session. */

const username = z
  .string()
  .trim()
  .regex(/^[a-zA-Z0-9_]{3,20}$/, "Pseudo invalide (3 à 20 caractères : lettres, chiffres, _)");

const password = z
  .string()
  .min(MIN_PASSWORD_LENGTH, `Mot de passe : ${MIN_PASSWORD_LENGTH} caractères minimum`)
  .max(MAX_PASSWORD_LENGTH);

const credentialsSchema = z.object({ username, password });
const setPasswordSchema = z.object({ username, newPassword: password });

export function authController(ctx: AppContext) {
  async function openSession(res: Response, account: Account) {
    const token = await signSession(ctx.config.secret, account.user);
    setSessionCookie(res, token, ctx.config);
    return account;
  }

  return {
    register: route(async (req, res) => {
      const body = parseBody(credentialsSchema, req.body);
      const account = await service.register(ctx, body.username, body.password);
      res.status(201).json(await openSession(res, account));
    }),

    login: route(async (req, res) => {
      const body = parseBody(credentialsSchema, req.body);
      const account = await service.login(ctx, body.username, body.password);
      res.json(await openSession(res, account));
    }),

    setPassword: route(async (req, res) => {
      const body = parseBody(setPasswordSchema, req.body);
      const account = await service.setPassword(ctx, body.username, body.newPassword);
      res.json(await openSession(res, account));
    }),

    logout: route((_req, res) => {
      clearSessionCookie(res, ctx.config);
      res.json({ ok: true });
    }),

    me: route((req, res) => {
      res.json(service.me(ctx, requireUser(req)));
    }),
  };
}
