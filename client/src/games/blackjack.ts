import type { GameConfig, Round } from "../api.ts";

/**
 * Ce que le client sait de Blackjack Express : la forme de sa vue, et la façon
 * de DIRE une carte. Rien ici ne décide d'une règle — le serveur tranche, cet
 * écran ne fait que montrer et nommer.
 */

export type Enseigne = "pique" | "coeur" | "carreau" | "trefle";
export type Carte = { rang: string; enseigne: Enseigne };
export type Issue = "blackjack" | "gagne" | "egalite" | "perdu";
export type Move = "hit" | "stand";

export type VueMain = { cartes: Carte[]; total: number; texte: string; brulee: boolean };

export type VueCroupier = {
  /** La seule carte visible tant que la manche dure. */
  visible: Carte;
  /** La main entière, une fois la manche finie ; `null` avant. */
  cartes: Carte[] | null;
  total: number | null;
  texte: string | null;
};

export type VueBlackjack = {
  fini: boolean;
  joueur: VueMain;
  croupier: VueCroupier;
  peutTirer: boolean;
  issue: Issue | null;
  coups: number;
};

export type GainLigne = { id: Issue; label: string; multiplier: number; detail: string };

/** La config du jeu, avec ce que son moteur ajoute au socle commun. */
export type BlackjackConfig = GameConfig & {
  gains: GainLigne[];
  valeurs: string;
  regleCroupier: string;
  regleSabot: string;
};

/** La réponse d'un coup : la manche, plus ce que CE coup a montré. */
export type ReponseCoup = {
  round: Round;
  /** La carte qui vient d'être tirée, `null` quand le joueur reste. */
  tiree: Carte | null;
  issue: Issue | null;
};

/** Le pip d'une enseigne. `︎` force le dessin TEXTE, jamais une émoticône. */
export const PIP: Record<Enseigne, string> = {
  pique: "♠︎",
  coeur: "♥︎",
  carreau: "♦︎",
  trefle: "♣︎",
};

/** Cœur et carreau se lisent en rouge, pique et trèfle en noir. */
export function estRouge(enseigne: Enseigne): boolean {
  return enseigne === "coeur" || enseigne === "carreau";
}

const NOM_ENSEIGNE: Record<Enseigne, string> = {
  pique: "pique",
  coeur: "cœur",
  carreau: "carreau",
  trefle: "trèfle",
};

const NOM_RANG: Record<string, string> = { A: "as", V: "valet", D: "dame", R: "roi" };

/** « roi de cœur », « 7 de pique » : ce qu'un lecteur d'écran doit entendre. */
export function nomCarte(carte: Carte): string {
  return `${NOM_RANG[carte.rang] ?? carte.rang} de ${NOM_ENSEIGNE[carte.enseigne]}`;
}

/** « Tes cartes : roi de cœur, 7 de pique, total 17 ». */
export function direMainJoueur(main: VueMain): string {
  const fin = main.brulee ? `total ${main.total}, dépassé` : `total ${main.texte}`;
  return `Tes cartes : ${main.cartes.map(nomCarte).join(", ")}, ${fin}`;
}

/** La main du croupier : sa carte cachée est dite comme telle, pas devinée. */
export function direMainCroupier(croupier: VueCroupier): string {
  if (!croupier.cartes) {
    return `Cartes du croupier : ${nomCarte(croupier.visible)}, et une carte cachée`;
  }
  const total = croupier.total !== null && croupier.total > 21 ? `total ${croupier.total}, dépassé` : `total ${croupier.texte}`;
  return `Cartes du croupier : ${croupier.cartes.map(nomCarte).join(", ")}, ${total}`;
}

/** Le mot de la fin, exactement celui de l'écran de bilan. */
export const MOT_ISSUE: Record<Issue, string> = {
  blackjack: "Blackjack !",
  gagne: "Gagné",
  egalite: "Égalité",
  perdu: "Perdu",
};

/** La vue d'une manche, ou `null` si la partie n'en porte pas encore. */
export function vueDe(view: unknown): VueBlackjack | null {
  if (!view || typeof view !== "object") return null;
  const vue = view as Partial<VueBlackjack>;
  return vue.joueur && vue.croupier ? (vue as VueBlackjack) : null;
}
