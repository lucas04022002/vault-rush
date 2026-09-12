import { ApiError } from "../api.ts";
import { formatCoins } from "./format.ts";

/**
 * Les codes d'erreur du serveur, en français.
 *
 * Le client n'affiche JAMAIS de JSON brut : tout ce qui remonte d'une requête
 * passe par ici. Un code inconnu donne un message générique, jamais le code.
 */

const MESSAGES: Record<string, string> = {
  // Partie
  insufficient_balance: "Solde insuffisant.",
  round_active: "Une partie est déjà en cours : elle a été reprise.",
  round_not_active: "Cette partie est terminée.",
  round_not_found: "Partie introuvable.",
  step_mismatch: "Cette étape a déjà été jouée : l'écran a été remis à jour.",
  nothing_to_cashout: "Il faut franchir au moins une étape avant d'encaisser.",
  invalid_option: "Ce choix n'existe pas à cette étape.",
  unknown_mode: "Ce mode n'existe pas.",
  unknown_game: "Ce jeu n'existe pas.",
  bet_too_small: `Mise minimum : ${formatCoins(100)}.`,
  bet_too_large: `Mise maximum : ${formatCoins(100_000)}.`,
  invalid_amount: "Mise invalide : un nombre, deux décimales au maximum.",

  // Comptes
  invalid_credentials: "Pseudo ou mot de passe incorrect.",
  username_taken: "Ce pseudo est déjà pris.",
  password_required: "Ce compte n'a pas encore de mot de passe.",
  password_already_set: "Ce compte a déjà un mot de passe.",
  user_not_found: "Compte introuvable.",
  too_many_attempts: "Trop d'essais. Réessaie dans quelques minutes.",
  unauthorized: "Session expirée : reconnecte-toi.",
  bad_origin: "Requête refusée par le serveur (origine inattendue).",

  // Porte-monnaie
  balance_too_high: `La recharge gratuite arrive quand le solde passe sous ${formatCoins(1000)}.`,
  refill_cooldown: "Recharge déjà utilisée : une seule toutes les 24 heures.",

  // Transport
  invalid_body: "Saisie invalide.",
  invalid_limit: "Filtre invalide.",
  not_found: "Page introuvable.",
  network_error: "Serveur injoignable. Vérifie ta connexion.",
  internal_error: "Erreur du serveur. Réessaie dans un instant.",
};

/** Le message français d'une erreur, quelle qu'elle soit. */
export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    const known = MESSAGES[err.code];
    if (known) return known;
    if (err.code === "invalid_body") return MESSAGES.invalid_body;
  }
  return MESSAGES.internal_error;
}

/** Le code d'erreur d'une requête, ou `null` si l'échec vient d'ailleurs. */
export function errorCode(err: unknown): string | null {
  return err instanceof ApiError ? err.code : null;
}
