import { z } from "zod";
import { MAX_BET_CENTS, MAX_PAYOUT_CENTS, MIN_BET_CENTS } from "../money.ts";
import {
  EngineError,
  type EngineResult,
  type GameConfigDTO,
  type GameEngine,
  type GameId,
  type Rng,
} from "./types.ts";

/**
 * Moteur « plateau de clous » : Diamond Drop.
 *
 * Un diamant est lâché au sommet ; à chaque rangée il part à gauche ou à droite
 * avec la même chance ; il finit dans une case qui porte un multiplicateur.
 * Une seule action par partie (« lâcher »), pas d'encaissement.
 *
 * Les gains ne sont PAS écrits à la main : ils sont calculés ici, à partir des
 * trois paramètres d'un mode (rangées, α, bord). Le rapport de calibrage donne
 * les tables attendues, et `tests/diamond-drop.test.ts` compare ce calcul à
 * ces tables : si la formule dérive, les tests tombent.
 *
 * Ce fichier est pur : aucune base, aucun HTTP, et le hasard n'entre que par
 * le `Rng` reçu en argument de `start`.
 */

export type DropMode = {
  id: string;
  label: string;
  /** Nombre de rangées de clous ; il y a `rows + 1` cases. */
  rows: number;
  /** Volatilité : plus α est grand, plus les cases rares paient. */
  alpha: number;
  /** Avantage de la maison (0,02 = 2 %). */
  houseEdge: number;
};

/** Les trois modes, calibrés le 13/09/2026. Ces trois nombres suffisent. */
export const DROP_MODES: readonly DropMode[] = [
  { id: "doux", label: "Doux", rows: 8, alpha: 0.5, houseEdge: 0.02 },
  { id: "nerveux", label: "Nerveux", rows: 12, alpha: 0.65, houseEdge: 0.04 },
  { id: "fou", label: "Fou", rows: 16, alpha: 0.75, houseEdge: 0.06 },
];

/**
 * La loi d'arrivée : `P(k) = C(R, k) / 2^R`, la binomiale d'un chemin de R pas
 * à pile ou face. `k` est le nombre de fois où le diamant est parti à droite,
 * donc l'indice de la case d'arrivée.
 */
export function slotProbabilities(rows: number): number[] {
  const binomial: number[] = [1];
  for (let k = 1; k <= rows; k++) binomial[k] = (binomial[k - 1] * (rows - k + 1)) / k;
  const total = 2 ** rows;
  return binomial.map((c) => c / total);
}

/**
 * Les multiplicateurs d'un mode : `f(k) = P(k)^(−α)` donne la forme (une case
 * rare rapporte plus), et la normalisation `(1 − bord) · f(k) / Σ P(i)·f(i)` fixe
 * le retour au joueur exactement à `1 − bord` avant arrondi.
 *
 * L'arrondi se fait à deux décimales VERS LE BAS : il ne doit jamais rendre le
 * jeu favorable au joueur, donc le retour réel est légèrement sous `1 − bord`.
 */
export function slotMultipliers(mode: DropMode): number[] {
  const p = slotProbabilities(mode.rows);
  const shape = p.map((x) => x ** -mode.alpha);
  const norm = p.reduce((sum, x, i) => sum + x * shape[i], 0);
  return shape.map((x) => Math.floor(((1 - mode.houseEdge) * x * 100) / norm) / 100);
}

/** Le retour au joueur EXACT d'un mode : `Σ P(k)·mult(k)`, sans simulation. */
export function exactReturn(mode: DropMode): number {
  const p = slotProbabilities(mode.rows);
  return slotMultipliers(mode).reduce((sum, mult, k) => sum + p[k] * mult, 0);
}

/**
 * L'état d'une partie. `path` est le SECRET : il est tiré au démarrage et ne
 * sort qu'au lâcher (`dropped`). `true` = le diamant est parti à droite.
 */
export type DropState = {
  mode: string;
  path: boolean[];
  dropped: boolean;
};

/** Le corps d'un lâcher : rien. L'action est le fait même de lâcher. */
export const dropActionSchema = z.object({});
export type DropAction = z.infer<typeof dropActionSchema>;

/** La case d'arrivée : le nombre de fois où le diamant est parti à droite. */
function slotOf(path: boolean[]): number {
  return path.reduce((count, right) => count + (right ? 1 : 0), 0);
}

// Les tables d'un mode ne changent jamais : on ne les recalcule pas à chaque vue.
const tables = new Map<string, number[]>();

/** Les multiplicateurs d'un mode, mémorisés. */
export function tableOf(mode: DropMode): number[] {
  let table = tables.get(mode.id);
  if (!table) {
    table = slotMultipliers(mode);
    tables.set(mode.id, table);
  }
  return table;
}

const ID = "diamond-drop";
const NAME = "Diamond Drop";
const TAGLINE = "Lâche le diamant, laisse les clous décider.";

/** Un mode, vu du client : de quoi dessiner le plateau et le tableau des cases. */
export type DropModeConfig = {
  id: string;
  label: string;
  rows: number;
  alpha: number;
  houseEdge: number;
  /** Les multiplicateurs, de la case la plus à gauche à la plus à droite. */
  slots: number[];
  /** La chance d'arriver dans chaque case, pour les règles. */
  chances: number[];
};

/**
 * La config du jeu : le DTO commun, plus les rangées et les cases de chaque
 * mode. Le plafond et les bornes de mise sont ceux de l'arcade entière.
 */
export type DropConfig = GameConfigDTO & {
  /** Le vocabulaire commun de l'arcade (tuile, historique) : un « lâcher ». */
  labels: { step: string; option: string; safe: string; danger: string; cashout: string };
  modes: DropModeConfig[];
};

/** Tout ce que le client doit savoir AVANT de miser. */
export function dropConfig(): DropConfig {
  return {
    id: ID,
    kind: "drop",
    name: NAME,
    tagline: TAGLINE,
    canCashout: false,
    // Une seule action par partie : le lâcher.
    steps: 1,
    format: `${Math.min(...DROP_MODES.map((m) => m.rows))} à ${Math.max(
      ...DROP_MODES.map((m) => m.rows),
    )} rangées`,
    maxPayoutCents: MAX_PAYOUT_CENTS,
    minBetCents: MIN_BET_CENTS,
    maxBetCents: MAX_BET_CENTS,
    labels: {
      step: "lâcher",
      option: "case",
      safe: "case",
      danger: "case",
      cashout: "Lâcher le diamant",
    },
    modes: DROP_MODES.map((mode) => ({
      id: mode.id,
      label: mode.label,
      rows: mode.rows,
      alpha: mode.alpha,
      houseEdge: mode.houseEdge,
      slots: [...tableOf(mode)],
      chances: slotProbabilities(mode.rows),
    })),
  };
}

/** Fabrique le moteur de Diamond Drop. */
export function createDropEngine(): GameEngine<DropState, DropAction> {
  function modeOf(id: string): DropMode {
    const mode = DROP_MODES.find((m) => m.id === id);
    if (!mode) {
      throw new EngineError(400, "unknown_mode", { modes: DROP_MODES.map((m) => m.id) });
    }
    return mode;
  }

  return {
    id: ID as GameId,
    kind: "drop",
    name: NAME,
    tagline: TAGLINE,
    // On lâche, on voit où ça tombe : il n'y a rien à encaisser en cours de route.
    canCashout: false,
    actionSchema: dropActionSchema,

    config: dropConfig,

    /**
     * Le chemin ENTIER est tiré ici, côté serveur, une rangée après l'autre,
     * et gardé en base jusqu'au lâcher. Le client ne peut donc rien deviner,
     * et le serveur ne peut rien changer une fois le clic parti.
     */
    start: (modeId: string, rng: Rng): DropState => {
      const mode = modeOf(modeId);
      return {
        mode: modeId,
        path: Array.from({ length: mode.rows }, () => rng.int(2) === 1),
        dropped: false,
      };
    },

    /**
     * Ce que le joueur a le droit de voir. AVANT le lâcher : le mode, le nombre
     * de rangées et la table des cases — rien qui dépende du tirage. APRÈS : le
     * chemin rangée par rangée (pour l'animation), la case et son gain.
     */
    view: (state: DropState) => {
      const mode = modeOf(state.mode);
      const slots = [...tableOf(mode)];
      if (!state.dropped) {
        return {
          mode: state.mode,
          rows: mode.rows,
          slots,
          dropped: false,
          path: null,
          slot: null,
          multiplier: null,
        };
      }
      const slot = slotOf(state.path);
      return {
        mode: state.mode,
        rows: mode.rows,
        slots,
        dropped: true,
        path: [...state.path],
        slot,
        multiplier: slots[slot],
      };
    },

    act(state: DropState, _action: DropAction): EngineResult<DropState> {
      // Le diamant ne se lâche qu'une fois : un second coup ne rejoue rien.
      if (state.dropped) throw new EngineError(409, "round_not_active");

      const mode = modeOf(state.mode);
      const slot = slotOf(state.path);
      const multiplier = tableOf(mode)[slot];

      // Le tirage a eu lieu au démarrage : ce coup ne fait que le révéler.
      return {
        state: { ...state, dropped: true },
        step: 1,
        multiplier,
        // Toute case paie quelque chose (la plus basse vaut ×0,50) : la partie
        // se solde donc toujours par un crédit, même inférieur à la mise.
        status: "cashed_out",
        reveal: { path: [...state.path], slot, multiplier },
      };
    },
  };
}
