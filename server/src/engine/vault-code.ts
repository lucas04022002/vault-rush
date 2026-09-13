import { z } from "zod";
import { MAX_BET_CENTS, MAX_PAYOUT_CENTS, MIN_BET_CENTS } from "../money.ts";
import {
  EngineError,
  type EngineResult,
  type GameConfigDTO,
  type GameEngine,
  type Rng,
} from "./types.ts";

/**
 * Vault Code — trouver la combinaison du coffre.
 *
 * Un code de QUATRE chiffres, tous différents, tiré au démarrage côté serveur.
 * À chaque essai le coffre répond deux nombres, et rien d'autre :
 *   - « verrous » : chiffres justes ET bien placés ;
 *   - « échos »   : chiffres présents mais mal placés.
 * Pas d'encaissement : on trouve, ou on épuise ses essais et on perd.
 *
 * LA TABLE DE GAINS N'EST PAS INVENTÉE. Elle est calibrée par mesure contre le
 * MEILLEUR joueur possible (solveur minimax, premier coup 0123) : le retour de
 * ce joueur parfait vaut ≈ 0,94 dans les trois modes, donc personne ne peut
 * battre la maison sur la durée. Un joueur moins méthodique gagne un peu moins.
 * La mesure est rejouée par `tests/vault-code-calibrage.test.ts` ; toucher un
 * nombre de cette table sans refaire tourner ce test n'a aucun sens.
 */

export type VaultCodeMode = {
  id: string;
  label: string;
  /** Nombre d'essais accordés. */
  essais: number;
  /** Multiplicateur si le code est trouvé au 1er, 2e, … essai. */
  gains: number[];
};

/** Longueur du code : quatre chiffres, tous différents. */
export const CODE_LENGTH = 4;
/** Chiffres disponibles : 0 à 9. */
export const DIGITS = 10;

/** Les modes, avec la table de gains figée du calibrage du 13/09/2026. */
export const MODES_VAULT_CODE: VaultCodeMode[] = [
  { id: "confort", label: "Confort", essais: 7, gains: [4.24, 2.97, 2.08, 1.45, 1.02, 0.71, 0.5] },
  { id: "tendu", label: "Tendu", essais: 6, gains: [11.31, 6.22, 3.42, 1.88, 1.03, 0.57] },
  { id: "sec", label: "Sec", essais: 5, gains: [29.04, 13.07, 5.88, 2.65, 1.19] },
];

/** Un essai déjà joué, avec la réponse du coffre. */
export type VaultCodeAttempt = { guess: number[]; verrous: number; echos: number };

/** L'état secret d'une partie : `code` ne sort JAMAIS par `view`. */
export type VaultCodeState = {
  mode: string;
  /** LE SECRET. Il vit en base (`rounds.state_json`) et nulle part ailleurs. */
  code: number[];
  attempts: VaultCodeAttempt[];
};

export type VaultCodeAction = { guess: number[] };

/**
 * `{ guess }` : quatre chiffres de 0 à 9, tous différents. Ce qui ne respecte
 * pas cette forme est un 400 `invalid_body` — un essai bien formé mais
 * impossible (plus d'essai disponible) est un refus du moteur, pas un 400.
 */
export const vaultCodeActionSchema = z.object({
  guess: z
    .array(z.number().int().min(0).max(DIGITS - 1))
    .length(CODE_LENGTH)
    .refine((guess) => new Set(guess).size === guess.length, {
      message: "les chiffres doivent être tous différents",
    }),
});

/** Le mode demandé, ou le refus. */
function modeOf(modeId: string): VaultCodeMode {
  const mode = MODES_VAULT_CODE.find((m) => m.id === modeId);
  if (!mode) {
    throw new EngineError(400, "unknown_mode", { modes: MODES_VAULT_CODE.map((m) => m.id) });
  }
  return mode;
}

/**
 * La réponse du coffre à un essai. Les deux combinaisons ont des chiffres tous
 * différents : un chiffre commun compte donc une fois, et une seule.
 */
export function indices(guess: number[], code: number[]): { verrous: number; echos: number } {
  let verrous = 0;
  let communs = 0;
  for (let i = 0; i < guess.length; i++) {
    if (guess[i] === code[i]) verrous++;
    if (code.includes(guess[i])) communs++;
  }
  return { verrous, echos: communs - verrous };
}

/**
 * Tire un code de `CODE_LENGTH` chiffres tous différents.
 * Mélange partiel de Fisher-Yates sur 0..9 : chaque combinaison est équiprobable.
 */
export function drawCode(rng: Rng): number[] {
  const chiffres = Array.from({ length: DIGITS }, (_, i) => i);
  for (let i = 0; i < CODE_LENGTH; i++) {
    const j = i + rng.int(DIGITS - i);
    [chiffres[i], chiffres[j]] = [chiffres[j], chiffres[i]];
  }
  return chiffres.slice(0, CODE_LENGTH);
}

/** Vrai quand la partie est jouée : code trouvé, ou essais épuisés. */
function finie(state: VaultCodeState, mode: VaultCodeMode): boolean {
  const dernier = state.attempts.at(-1);
  return dernier?.verrous === CODE_LENGTH || state.attempts.length >= mode.essais;
}

/**
 * La config, lue AVANT de miser : essais et table de gains par mode, plafond
 * et bornes de mise.
 *
 * `labels`, `options`, `safeOptions`, `chancePerStep` et `houseEdge` sont la
 * forme commune que le catalogue du client attend de tout jeu. Ici :
 * un « essai » tient lieu d'étape, `options` est le nombre de chiffres
 * disponibles, `safeOptions` le nombre de chiffres du code, et `chancePerStep`
 * la chance d'un essai tiré complètement à l'aveugle (1 sur 5 040).
 */
export function vaultCodeConfig(): GameConfigDTO {
  const combinaisons = DIGITS * (DIGITS - 1) * (DIGITS - 2) * (DIGITS - 3);
  return {
    id: "vault-code",
    kind: "code",
    name: "Vault Code",
    tagline: "Trouve la combinaison du coffre avant d'épuiser tes essais.",
    canCashout: false,
    // Le plus grand nombre d'essais des trois modes : chaque mode porte le sien.
    steps: Math.max(...MODES_VAULT_CODE.map((m) => m.essais)),
    digits: CODE_LENGTH,
    labels: {
      step: "essai",
      option: "chiffre",
      safe: "verrou",
      danger: "échec",
      cashout: "Ouvrir",
    },
    maxPayoutCents: MAX_PAYOUT_CENTS,
    minBetCents: MIN_BET_CENTS,
    maxBetCents: MAX_BET_CENTS,
    modes: MODES_VAULT_CODE.map((mode) => ({
      id: mode.id,
      label: mode.label,
      essais: mode.essais,
      options: DIGITS,
      safeOptions: CODE_LENGTH,
      // Mesuré contre un joueur parfait : ≈ 6 % pour la maison (voir le calibrage).
      houseEdge: 0.06,
      chancePerStep: 1 / combinaisons,
      multipliers: [...mode.gains],
    })),
  } as GameConfigDTO;
}

/** Le moteur de Vault Code. Pur : ni base, ni HTTP, ni `Math.random`. */
export function createVaultCodeEngine(): GameEngine<VaultCodeState, VaultCodeAction> {
  return {
    id: "vault-code",
    kind: "code",
    name: "Vault Code",
    tagline: "Trouve la combinaison du coffre avant d'épuiser tes essais.",
    // On trouve ou on perd : pas d'encaissement, donc pas de méthode `cashout`.
    canCashout: false,
    actionSchema: vaultCodeActionSchema,

    config: vaultCodeConfig,

    start(modeId: string, rng: Rng): VaultCodeState {
      modeOf(modeId); // refuse un mode inconnu avant de tirer quoi que ce soit
      return { mode: modeId, code: drawCode(rng), attempts: [] };
    },

    /**
     * L'état PUBLIC. Le code n'y figure que la partie terminée — le joueur doit
     * voir la combinaison qu'il a manquée, mais pas une seconde plus tôt.
     */
    view(state: VaultCodeState) {
      const mode = modeOf(state.mode);
      const jouee = finie(state, mode);
      return {
        mode: state.mode,
        digits: CODE_LENGTH,
        essais: mode.essais,
        essaisRestants: mode.essais - state.attempts.length,
        attempts: state.attempts.map((a) => ({
          guess: [...a.guess],
          verrous: a.verrous,
          echos: a.echos,
        })),
        code: jouee ? [...state.code] : null,
      };
    },

    act(state: VaultCodeState, action: VaultCodeAction): EngineResult<VaultCodeState> {
      const mode = modeOf(state.mode);
      // Essai bien formé mais impossible ici : un refus du moteur, pas un 400.
      if (finie(state, mode)) throw new EngineError(409, "no_tries_left", { essais: mode.essais });

      const { verrous, echos } = indices(action.guess, state.code);
      const attempts = [...state.attempts, { guess: [...action.guess], verrous, echos }];
      const next: VaultCodeState = { ...state, attempts };
      const trouve = verrous === CODE_LENGTH;
      const epuise = attempts.length >= mode.essais;

      return {
        state: next,
        step: attempts.length,
        // Rien n'est acquis tant que le code n'est pas trouvé.
        multiplier: trouve ? mode.gains[attempts.length - 1] : 0,
        status: trouve ? "cashed_out" : epuise ? "lost" : "playing",
        // Le coup est joué : on peut montrer le code SI la partie est terminée.
        reveal: { verrous, echos, trouve, code: trouve || epuise ? [...state.code] : null },
      };
    },
  };
}
