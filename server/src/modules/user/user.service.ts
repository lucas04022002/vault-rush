import { getUserByUsername, createUser } from "../../database/store.ts";
import { GameError } from "../game/game.service.ts";

/**
 * Auth simple par pseudo (MVP) : si le pseudo existe on le connecte,
 * sinon on crée le compte avec 1000 coins de départ.
 * Pas de mot de passe pour l'instant (Version 3 du plan).
 */

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;

export type AuthResult = {
  userId: number;
  username: string;
  balance: number;
};

export function login(rawUsername: unknown): AuthResult {
  if (typeof rawUsername !== "string") throw new GameError("Username required");
  const username = rawUsername.trim();
  if (!USERNAME_RE.test(username)) {
    throw new GameError("Pseudo invalide (3-20 caractères : lettres, chiffres, _)");
  }

  const existing = getUserByUsername(username);
  const user = existing ?? createUser(username);
  return { userId: user.id, username: user.username, balance: user.balance };
}
