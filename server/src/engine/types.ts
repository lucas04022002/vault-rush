import { randomInt } from "node:crypto";
import type { ZodType } from "zod";

/**
 * Le contrat d'un moteur de jeu.
 *
 * Ce qui est commun à tout jeu d'argent fictif (valider la mise, débiter dans
 * une transaction, une seule partie active, reprendre après rechargement,
 * refuser un coup déjà joué, créditer le gain plafonné, journaliser) est écrit
 * UNE fois dans `modules/games/games.service.ts`. Ce qui est propre à un jeu
 * tient dans un `GameEngine` : son état secret, son coup, et ce que le joueur
 * a le droit de voir.
 *
 * Ce fichier ne dépend de rien (ni base, ni HTTP, ni autre module du moteur) :
 * c'est lui que lisent les moteurs, le registre et le service.
 */

/**
 * Les jeux livrés, dans l'ordre d'affichage de l'arcade.
 * Ajouter un jeu = ajouter son identifiant ici, écrire son moteur, et
 * l'enregistrer dans `engine/registry.ts` (une ligne).
 */
export const GAME_IDS = [
  "vault-rush",
  "laser-grid",
  "getaway",
  "bomb-squad",
  "blackjack-express",
] as const;

export type GameId = (typeof GAME_IDS)[number];

/** Vrai si `value` est l'identifiant d'un jeu existant. */
export function isGameId(value: unknown): value is GameId {
  return typeof value === "string" && (GAME_IDS as readonly string[]).includes(value);
}

/** Le genre d'un jeu : il choisit l'écran côté client. */
export type GameKind = "ladder" | "code" | "drop" | "cards";

/** Statut d'une partie, partagé par la base et les moteurs. */
export type RoundStatus = "playing" | "lost" | "cashed_out";

/** Tirage d'un entier dans [0, maxExclusive[ ; injectable pour les tests. */
export type Rng = { int(maxExclusive: number): number };

/** Le vrai hasard : `crypto.randomInt`, le seul utilisé en production. */
export const cryptoRng: Rng = { int: (maxExclusive: number) => randomInt(maxExclusive) };

/** Ce qu'un coup produit : le nouvel état, et ce que la base doit retenir. */
export type EngineResult<S> = {
  /** Nouvel état secret, sérialisé dans `rounds.state_json`. */
  state: S;
  /** Numéro du prochain coup attendu (colonne `step`). */
  step: number;
  /** Multiplicateur acquis à cet instant (colonne `multiplier`). */
  multiplier: number;
  status: RoundStatus;
  /**
   * Ce que ce coup a MONTRÉ (portes, indices, cartes). Les champs sont ajoutés
   * tels quels à la réponse de `POST …/play`, à côté de `round`.
   */
  reveal?: unknown;
};

/** Un mode de jeu, vu du client : le minimum commun à tous les jeux. */
export type GameModeDTO = { id: string; label: string };

/**
 * Tout ce qu'il faut afficher AVANT de miser. Un jeu peut ajouter ses propres
 * champs (le jeu d'échelle ajoute `labels` et enrichit ses modes) : ils partent
 * tels quels dans la réponse de `GET /api/games/:game/config`.
 */
export type GameConfigDTO = {
  id: string;
  kind: GameKind;
  name: string;
  tagline: string;
  /** Faux quand le jeu n'a pas d'encaissement en cours de partie. */
  canCashout: boolean;
  /** Nombre maximum de coups d'une partie (étapes, essais, mains). */
  steps: number;
  maxPayoutCents: number;
  minBetCents: number;
  maxBetCents: number;
  modes: GameModeDTO[];
};

/**
 * Les colonnes d'une partie ouverte AVANT la migration `0003_state_json`
 * (`state_json` vaut NULL) : un moteur qui existait déjà s'en sert pour
 * reconstruire son état.
 */
export type LegacyRound = { mode: string; step: number; multiplier: number };

/**
 * Refus propre au jeu (coup impossible, encaissement sans objet…).
 * Le service le traduit en réponse HTTP ; le moteur ne connaît pas Express.
 */
export class EngineError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: Record<string, unknown>;

  constructor(status: number, code: string, details: Record<string, unknown> = {}) {
    super(code);
    this.name = "EngineError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/**
 * Un jeu. `S` est son état secret (sérialisable en JSON), `A` son action.
 *
 * Règles du contrat :
 * - l'état vit en base (`rounds.state_json`), jamais chez le client ;
 * - `view(state)` est la SEULE chose qui sort du serveur : jamais de secret ;
 * - `act` ne fait qu'avancer l'état, il ne touche ni à l'argent ni à la base ;
 * - un refus se lève avec `EngineError`, jamais avec une erreur HTTP.
 */
export interface GameEngine<S = unknown, A = unknown> {
  readonly id: GameId;
  readonly kind: GameKind;
  readonly name: string;
  readonly tagline: string;
  /** Seul un jeu d'échelle laisse encaisser en cours de partie. */
  readonly canCashout: boolean;
  /** Valide le corps d'un coup, en plus de `{ roundId, step }` (400 sinon). */
  readonly actionSchema: ZodType<A>;
  config(): GameConfigDTO;
  start(modeId: string, rng: Rng): S;
  /** L'état PUBLIC : jamais le secret. */
  view(state: S): unknown;
  act(state: S, action: A, rng: Rng): EngineResult<S>;
  cashout?(state: S): EngineResult<S>;
  /**
   * Multiplicateur du coup suivant, pour le champ `round.nextMultiplier`.
   * Seul un jeu d'échelle en a un : les autres n'implémentent pas cette méthode.
   */
  nextMultiplier?(state: S): number | null;
  /**
   * Reconstruit l'état d'une partie ouverte avant `0003_state_json`.
   * Inutile pour un jeu né après la migration : il n'a aucune partie héritée.
   */
  restore?(round: LegacyRound): S;
}

/** Le registre : un moteur par identifiant de jeu. */
export type EngineRegistry = Readonly<Record<string, GameEngine>>;
