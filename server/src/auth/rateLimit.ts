/**
 * Limiteur d'essais en mémoire (une instance par serveur).
 * Sert à freiner la force brute sur la connexion : 10 essais par pseudo / 15 min.
 */

export type RateLimiter = {
  /** Vrai si la clé a épuisé son quota pour la fenêtre en cours. */
  isBlocked(key: string): boolean;
  /** Compte un essai. */
  hit(key: string): void;
  /** Remet le compteur à zéro (connexion réussie). */
  reset(key: string): void;
};

export type RateLimitOptions = { max: number; windowMs: number };

export function createRateLimiter({ max, windowMs }: RateLimitOptions): RateLimiter {
  const attempts = new Map<string, { count: number; expiresAt: number }>();

  function current(key: string) {
    const entry = attempts.get(key);
    if (!entry || entry.expiresAt <= Date.now()) {
      attempts.delete(key);
      return undefined;
    }
    return entry;
  }

  return {
    isBlocked(key) {
      return (current(key)?.count ?? 0) >= max;
    },
    hit(key) {
      const entry = current(key);
      if (entry) entry.count += 1;
      else attempts.set(key, { count: 1, expiresAt: Date.now() + windowMs });
    },
    reset(key) {
      attempts.delete(key);
    },
  };
}
