import type { AppContext } from "../../context.ts";
import { withTransaction } from "../../database/db.ts";
import * as store from "../../database/store.ts";
import { HttpError } from "../../http/errors.ts";
import { hashPassword, verifyPassword } from "../../auth/password.ts";
import type { SessionUser } from "../../auth/session.ts";

/**
 * Comptes : pseudo + mot de passe argon2id.
 *
 * Les comptes hérités de la version « pseudo seul » ont un hash nul :
 * la connexion les renvoie vers `set-password`, sans jamais deviner à leur place.
 */

export type Account = { user: SessionUser; balanceCents: number };

function toAccount(user: store.User): Account {
  return { user: { id: user.id, username: user.username }, balanceCents: user.balanceCents };
}

export async function register(
  ctx: AppContext,
  username: string,
  password: string,
): Promise<Account> {
  if (store.getUserByUsername(ctx.db, username)) throw new HttpError(409, "username_taken");
  const hash = await hashPassword(password);
  try {
    // Le solde offert est un mouvement d'argent comme un autre : il entre dans le
    // journal, et dans la même transaction que la création du compte. Sinon,
    // rejouer le journal depuis zéro ne retomberait jamais sur le solde réel.
    const user = withTransaction(ctx.db, () => {
      const created = store.createUser(ctx.db, username, hash);
      store.addTransaction(ctx.db, {
        userId: created.id,
        roundId: null,
        type: "opening",
        amountCents: created.balanceCents,
        balanceAfterCents: created.balanceCents,
      });
      return created;
    });
    return toAccount(user);
  } catch (err) {
    // Course entre deux inscriptions : c'est l'unicité en base qui tranche.
    if (err instanceof Error && /UNIQUE/i.test(err.message)) {
      throw new HttpError(409, "username_taken");
    }
    throw err;
  }
}

export async function login(
  ctx: AppContext,
  username: string,
  password: string,
): Promise<Account> {
  if (ctx.loginLimiter.isBlocked(username)) throw new HttpError(429, "too_many_attempts");
  ctx.loginLimiter.hit(username);

  const user = store.getUserByUsername(ctx.db, username);
  // Compte hérité sans mot de passe : le client doit proposer d'en définir un.
  if (user && user.passwordHash === null) throw new HttpError(409, "password_required");

  // Réponse identique pour un pseudo inconnu et un mauvais mot de passe.
  if (!user || !(await verifyPassword(password, user.passwordHash!))) {
    throw new HttpError(401, "invalid_credentials");
  }

  ctx.loginLimiter.reset(username);
  store.touchLogin(ctx.db, user.id);
  return toAccount(user);
}

export async function setPassword(
  ctx: AppContext,
  username: string,
  newPassword: string,
): Promise<Account> {
  const user = store.getUserByUsername(ctx.db, username);
  if (!user) throw new HttpError(404, "user_not_found");
  if (user.passwordHash !== null) throw new HttpError(409, "password_already_set");

  const hash = await hashPassword(newPassword);
  store.setPasswordHash(ctx.db, user.id, hash);
  store.touchLogin(ctx.db, user.id);
  ctx.loginLimiter.reset(username);
  return toAccount(user);
}

export function me(ctx: AppContext, session: SessionUser): Account {
  const user = store.getUser(ctx.db, session.id);
  if (!user) throw new HttpError(401, "unauthorized");
  return toAccount(user);
}
