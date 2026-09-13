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
 * Blackjack Express : une manche courte contre le croupier.
 *
 * Le jeu de 52 cartes est refait et rebattu À CHAQUE MANCHE : le sabot ne
 * garde aucune mémoire, donc aucun comptage n'est possible et rien de ce qui
 * s'est passé avant ne change les chances de la manche en cours.
 *
 * Le bord de la maison n'est pas un paramètre : il TOMBE des règles (le joueur
 * joue le premier et perd tout de suite s'il dépasse, le blackjack ne paie que
 * 3 pour 2, on ne double ni ne sépare). Il est mesuré, pas décrété — voir
 * `server/tests/blackjack-calibrage.test.ts`.
 *
 * Ce fichier est pur : ni base, ni HTTP, et le hasard n'entre que par `rng`.
 */

export const ENSEIGNES = ["pique", "coeur", "carreau", "trefle"] as const;
export const RANGS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "V", "D", "R"] as const;

export type Enseigne = (typeof ENSEIGNES)[number];
export type Rang = (typeof RANGS)[number];
export type Carte = { rang: Rang; enseigne: Enseigne };

/** L'as compte 1 ici ; les 10 points de plus sont ajoutés par `totalOf` s'ils tiennent. */
const VALEURS: Record<Rang, number> = {
  A: 1,
  "2": 2,
  "3": 3,
  "4": 4,
  "5": 5,
  "6": 6,
  "7": 7,
  "8": 8,
  "9": 9,
  "10": 10,
  V: 10,
  D: 10,
  R: 10,
};

/** Ce que paie chaque issue, en multiple de la mise (la mise est déjà débitée). */
export type Issue = "blackjack" | "gagne" | "egalite" | "perdu";

export const GAINS: Record<Issue, number> = {
  blackjack: 2.5,
  gagne: 2,
  egalite: 1,
  perdu: 0,
};

/** Le croupier s'arrête à ce total, 17 « souple » compris. */
export const ARRET_CROUPIER = 17;

/**
 * Le plus grand nombre de coups qu'une manche puisse porter : neuf tirages
 * (4 as, 4 deux et 3 trois font 21 en onze cartes) plus le « rester » final.
 */
export const COUPS_MAX = 10;

export const BLACKJACK_ID = "blackjack-express";

/** Une ligne du tableau des gains, telle qu'elle part au client. */
export type GainDTO = { id: Issue; label: string; multiplier: number; detail: string };

/**
 * La config de Blackjack Express : le socle commun, plus ce qu'il faut
 * afficher AVANT de miser — les gains, la valeur des cartes, la règle du
 * croupier et celle du sabot. Le service la renvoie telle quelle.
 */
export type BlackjackConfig = GameConfigDTO & {
  labels: { step: string; option: string; safe: string; danger: string; cashout: string };
  gains: GainDTO[];
  valeurs: string;
  regleCroupier: string;
  regleSabot: string;
};

export type BlackjackState = {
  mode: string;
  /** Les cartes qui restent à tirer. SECRET : jamais dans `view`. */
  sabot: Carte[];
  joueur: Carte[];
  /** `[0]` est la carte visible, `[1]` la carte cachée, puis ses tirages. */
  croupier: Carte[];
  coups: number;
  fini: boolean;
  issue: Issue | null;
};

export type BlackjackAction = { move: "hit" | "stand" };

/** `{ move }` : le champ propre au blackjack, en plus de `{ roundId, step }`. */
export const blackjackActionSchema = z.object({ move: z.enum(["hit", "stand"]) });

/* ------------------------------- Les cartes ------------------------------- */

/** Un jeu neuf de 52 cartes, dans l'ordre de la boîte. */
export function buildDeck(): Carte[] {
  const jeu: Carte[] = [];
  for (const enseigne of ENSEIGNES) {
    for (const rang of RANGS) jeu.push({ rang, enseigne });
  }
  return jeu;
}

/** Fisher-Yates, avec le seul hasard du moteur. Rend un NOUVEAU tableau. */
export function melange(jeu: Carte[], rng: Rng): Carte[] {
  const battu = [...jeu];
  for (let i = battu.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [battu[i], battu[j]] = [battu[j], battu[i]];
  }
  return battu;
}

export type Total = {
  /** Le total retenu : le plus grand qui ne dépasse pas 21. */
  total: number;
  /** Le total avec tous les as à 1. */
  dur: number;
  /** Vrai quand un as compte 11 : le total peut encore retomber. */
  souple: boolean;
};

/** Le total d'une main : l'as vaut 11 tant que ça tient, 1 ensuite. */
export function totalOf(cartes: Carte[]): Total {
  const dur = cartes.reduce((somme, carte) => somme + VALEURS[carte.rang], 0);
  const as = cartes.some((carte) => carte.rang === "A");
  const souple = as && dur + 10 <= 21;
  return { total: souple ? dur + 10 : dur, dur, souple };
}

/** « 17 », ou « 7 ou 17 » quand la main est souple : les deux lectures d'un as. */
export function texteTotal(total: Total): string {
  return total.souple ? `${total.dur} ou ${total.total}` : `${total.total}`;
}

/** Un blackjack naturel : 21 dès les deux premières cartes. */
export function estNaturel(cartes: Carte[]): boolean {
  return cartes.length === 2 && totalOf(cartes).total === 21;
}

/** Tire la carte du dessus du sabot ; le sabot est modifié. */
function tirer(sabot: Carte[]): Carte {
  const carte = sabot.pop();
  // Impossible avec 52 cartes (une manche en consomme 21 au pire), mais un
  // sabot vide ne doit jamais devenir un `undefined` glissé dans une main.
  if (!carte) throw new EngineError(409, "sabot_vide");
  return carte;
}

/* -------------------------------- La manche -------------------------------- */

/** La main du croupier, jouée jusqu'au bout : il tire tant qu'il est sous 17. */
export function joueCroupier(croupier: Carte[], sabot: Carte[]): Carte[] {
  const main = [...croupier];
  while (totalOf(main).total < ARRET_CROUPIER) main.push(tirer(sabot));
  return main;
}

/** Qui gagne, une fois les deux mains arrêtées. */
export function issueDe(joueur: Carte[], croupier: Carte[]): Issue {
  const totalJoueur = totalOf(joueur).total;
  if (totalJoueur > 21) return "perdu";

  const naturelJoueur = estNaturel(joueur);
  const naturelCroupier = estNaturel(croupier);
  if (naturelJoueur && naturelCroupier) return "egalite";
  if (naturelJoueur) return "blackjack";
  if (naturelCroupier) return "perdu";

  const totalCroupier = totalOf(croupier).total;
  if (totalCroupier > 21 || totalJoueur > totalCroupier) return "gagne";
  if (totalJoueur === totalCroupier) return "egalite";
  return "perdu";
}

/* --------------------------------- Le moteur --------------------------------- */

/** La vue d'une main, telle qu'elle part au client. */
type VueMain = { cartes: Carte[]; total: number; texte: string; brulee: boolean };

function vueMain(cartes: Carte[]): VueMain {
  const total = totalOf(cartes);
  return { cartes, total: total.total, texte: texteTotal(total), brulee: total.total > 21 };
}

export function createBlackjackEngine(): GameEngine<BlackjackState, BlackjackAction> {
  const name = "Blackjack Express";
  const tagline = "Tire ou reste, bats le croupier sans dépasser 21.";

  /** Ferme la manche sur une issue, et rend ce que le service doit écrire. */
  function terminer(state: BlackjackState, issue: Issue, tiree: Carte | null): EngineResult<BlackjackState> {
    const multiplier = GAINS[issue];
    const fini: BlackjackState = { ...state, fini: true, issue };
    return {
      state: fini,
      step: fini.coups,
      multiplier,
      status: multiplier > 0 ? "cashed_out" : "lost",
      reveal: { tiree, issue, multiplicateur: multiplier },
    };
  }

  return {
    id: BLACKJACK_ID as GameId,
    kind: "cards",
    name,
    tagline,
    // On ne se retire pas d'une main de cartes : on tire, ou on reste.
    canCashout: false,
    actionSchema: blackjackActionSchema,

    config: (): BlackjackConfig => ({
      id: BLACKJACK_ID,
      kind: "cards",
      name,
      tagline,
      canCashout: false,
      steps: COUPS_MAX,
      format: "contre le croupier",
      maxPayoutCents: MAX_PAYOUT_CENTS,
      minBetCents: MIN_BET_CENTS,
      maxBetCents: MAX_BET_CENTS,
      modes: [{ id: "express", label: "Express" }],
      // Des champs en plus, que le service renvoie tels quels au client.
      labels: {
        step: "coup",
        option: "carte",
        safe: "gagné",
        danger: "perdu",
        cashout: "Rester",
      },
      gains: [
        {
          id: "blackjack",
          label: "Blackjack",
          multiplier: GAINS.blackjack,
          detail: "21 en deux cartes, quand le croupier n'en a pas un aussi",
        },
        { id: "gagne", label: "Gagné", multiplier: GAINS.gagne, detail: "ton total bat le sien" },
        { id: "egalite", label: "Égalité", multiplier: GAINS.egalite, detail: "mise rendue" },
        { id: "perdu", label: "Perdu", multiplier: GAINS.perdu, detail: "il te bat, ou tu dépasses 21" },
      ],
      valeurs: "Les figures valent 10, l'as vaut 11 tant que la main ne dépasse pas 21, sinon 1.",
      regleCroupier:
        "Le croupier tire jusqu'à 17 inclus, puis il reste — même sur un 17 souple (as compté 11).",
      regleSabot:
        "Un jeu de 52 cartes neuf, mélangé à chaque manche : aucun comptage de cartes n'est possible.",
    }),

    /** Le mélange et la donne : le seul endroit où le hasard entre, avant le coup. */
    start(modeId: string, rng: Rng): BlackjackState {
      const sabot = melange(buildDeck(), rng);
      // Donne alternée, comme à la table : joueur, croupier, joueur, croupier.
      const joueur = [tirer(sabot)];
      const croupier = [tirer(sabot)];
      joueur.push(tirer(sabot));
      croupier.push(tirer(sabot));
      return { mode: modeId, sabot, joueur, croupier, coups: 0, fini: false, issue: null };
    },

    /**
     * L'état PUBLIC. Tant que la manche dure, le croupier ne montre QUE sa
     * première carte : ni sa carte cachée, ni le sabot ne sortent d'ici.
     */
    view(state: BlackjackState) {
      const joueur = vueMain(state.joueur);
      if (!state.fini) {
        return {
          fini: false,
          joueur,
          croupier: { visible: state.croupier[0], cartes: null, total: null, texte: null },
          // À 21 (ou au-delà) il n'y a plus rien à tenter : on ne peut que rester.
          peutTirer: joueur.total < 21,
          issue: null,
          coups: state.coups,
        };
      }
      const croupier = vueMain(state.croupier);
      return {
        fini: true,
        joueur,
        croupier: {
          visible: state.croupier[0],
          cartes: state.croupier,
          total: croupier.total,
          texte: croupier.texte,
        },
        peutTirer: false,
        issue: state.issue,
        coups: state.coups,
      };
    },

    act(state: BlackjackState, action: BlackjackAction): EngineResult<BlackjackState> {
      if (state.fini) throw new EngineError(409, "round_not_active");

      const sabot = [...state.sabot];
      const coups = state.coups + 1;

      if (action.move === "hit") {
        if (totalOf(state.joueur).total >= 21) {
          throw new EngineError(409, "cannot_hit", { total: totalOf(state.joueur).total });
        }
        const tiree = tirer(sabot);
        const joueur = [...state.joueur, tiree];
        const apres: BlackjackState = { ...state, sabot, joueur, coups };

        // Dépassement : perdu tout de suite, le croupier n'a pas à jouer.
        if (totalOf(joueur).total > 21) return terminer(apres, "perdu", tiree);

        return {
          state: apres,
          step: coups,
          multiplier: 0,
          status: "playing",
          reveal: { tiree, issue: null, multiplicateur: 0 },
        };
      }

      // « Rester » : le croupier se découvre et joue sa main d'un bloc.
      // Un blackjack naturel d'un côté ou de l'autre tranche sans qu'il tire.
      const naturel = estNaturel(state.joueur) || estNaturel(state.croupier);
      const croupier = naturel ? state.croupier : joueCroupier(state.croupier, sabot);
      const apres: BlackjackState = { ...state, sabot, croupier, coups };
      return terminer(apres, issueDe(state.joueur, croupier), null);
    },
  };
}
