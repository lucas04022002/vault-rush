import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createBlackjackEngine,
  totalOf,
  type BlackjackState,
  type Carte,
  type Issue,
} from "../src/engine/blackjack.ts";
import type { Rng } from "../src/engine/types.ts";

/**
 * Le retour au joueur de Blackjack Express n'est pas décrété : il est MESURÉ.
 *
 * Un joueur de référence (la stratégie de base tirer/rester, celle d'un jeu
 * sans doubler ni séparer) joue des dizaines de milliers de mains contre le
 * moteur réel, avec un tirage déterministe. Ce que la mesure dit fait foi :
 * si elle passait au-dessus de 1, ce sont les RÈGLES qui sont fausses, et le
 * jeu ne se publie pas.
 *
 * Bornes : le contrat de la tâche demande `[0,93 ; 1,00]`, et la fréquence de
 * blackjack naturel doit tomber sur les 4,83 % théoriques d'un jeu de 52
 * cartes — `2 × (4/52) × (16/51)` — à quatre écarts-types près.
 */

const MAINS = 40_000;
const GRAINE = 20260913;

/** Générateur déterministe (mulberry32) : la même graine rejoue la même partie. */
function grainRng(graine: number): Rng {
  let etat = graine >>> 0;
  return {
    int(maxExclusive: number): number {
      etat = (etat + 0x6d2b79f5) | 0;
      let t = Math.imul(etat ^ (etat >>> 15), 1 | etat);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      const unite = ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
      return Math.floor(unite * maxExclusive);
    },
  };
}

/**
 * La stratégie de base, volet tirer/rester (croupier qui reste à 17 souple,
 * pas de doublement ni de séparation) :
 *   - main souple : tirer jusqu'à 17 ; 18 se couche sauf contre 9, 10 ou As ;
 *   - main dure : rester dès 17 ; 13 à 16 contre 2-6 ; 12 contre 4, 5, 6.
 */
export function strategieDeBase(joueur: Carte[], visible: Carte): "hit" | "stand" {
  const { total, souple } = totalOf(joueur);
  const croupier = valeurVisible(visible);

  if (souple) {
    if (total >= 19) return "stand";
    if (total === 18) return croupier >= 9 ? "hit" : "stand";
    return "hit";
  }
  if (total >= 17) return "stand";
  if (total >= 13) return croupier <= 6 ? "stand" : "hit";
  if (total === 12) return croupier >= 4 && croupier <= 6 ? "stand" : "hit";
  return "hit";
}

/** La carte visible du croupier, l'as compté 11 comme dans la table de référence. */
function valeurVisible(carte: Carte): number {
  if (carte.rang === "A") return 11;
  if (carte.rang === "R" || carte.rang === "D" || carte.rang === "V") return 10;
  return Number(carte.rang);
}

type Mesure = {
  retour: number;
  naturels: number;
  issues: Record<Issue, number>;
  coupsMax: number;
};

/** Fait jouer la stratégie de base contre le moteur, et compte ce qui sort. */
function mesurer(mains: number, rng: Rng): Mesure {
  const moteur = createBlackjackEngine();
  const issues: Record<Issue, number> = { blackjack: 0, gagne: 0, egalite: 0, perdu: 0 };
  let rendu = 0;
  let naturels = 0;
  let coupsMax = 0;

  for (let main = 0; main < mains; main++) {
    let state = moteur.start("express", rng) as BlackjackState;
    if (totalOf(state.joueur).total === 21) naturels += 1;

    let multiplicateur = 0;
    for (;;) {
      const vue = moteur.view(state) as { peutTirer: boolean };
      const move = vue.peutTirer ? strategieDeBase(state.joueur, state.croupier[0]) : "stand";
      const coup = moteur.act(state, { move }, rng);
      state = coup.state;
      multiplicateur = coup.multiplier;
      if (coup.status !== "playing") {
        coupsMax = Math.max(coupsMax, coup.step);
        break;
      }
    }

    if (state.issue) issues[state.issue] += 1;
    rendu += multiplicateur;
  }

  return { retour: rendu / mains, naturels: naturels / mains, issues, coupsMax };
}

test("mesure : la stratégie de base rend entre 93 % et 100 % de la mise", () => {
  const mesure = mesurer(MAINS, grainRng(GRAINE));
  const pourcent = (x: number) => `${(x * 100).toFixed(2)} %`;

  console.log(
    `[blackjack] ${MAINS} mains, graine ${GRAINE} — retour ${pourcent(mesure.retour)} · ` +
      `blackjacks ${pourcent(mesure.naturels)} · ` +
      `issues ${JSON.stringify(mesure.issues)} · coups max ${mesure.coupsMax}`,
  );

  // La maison garde son bord : un jeu battable ne se publie pas.
  assert.ok(
    mesure.retour <= 1,
    `retour ${pourcent(mesure.retour)} : les règles sont fausses, le jeu serait battable`,
  );
  assert.ok(mesure.retour >= 0.93, `retour ${pourcent(mesure.retour)} : trop dur pour un blackjack`);

  // Toutes les issues arrivent : la mesure n'est pas un jeu dégénéré.
  for (const issue of ["blackjack", "gagne", "egalite", "perdu"] as Issue[]) {
    assert.ok(mesure.issues[issue] > 0, `aucune issue « ${issue} » en ${MAINS} mains`);
  }
  // Le contrat annonce 10 coups au plus : la mesure ne doit jamais le dépasser.
  assert.ok(mesure.coupsMax <= createBlackjackEngine().config().steps, `coups max ${mesure.coupsMax}`);
});

test("mesure : le blackjack naturel tombe sur ses 4,83 % théoriques", () => {
  const mesure = mesurer(MAINS, grainRng(GRAINE + 1));
  const p = 2 * (4 / 52) * (16 / 51);
  // Quatre écarts-types d'une binomiale : le seul bruit admis est celui du tirage.
  const tolerance = 4 * Math.sqrt((p * (1 - p)) / MAINS);

  assert.ok(
    Math.abs(mesure.naturels - p) < tolerance,
    `blackjacks ${(mesure.naturels * 100).toFixed(2)} % contre ${(p * 100).toFixed(2)} % ` +
      `(tolérance ±${(tolerance * 100).toFixed(2)} points)`,
  );
});

test("mesure : le mélange est uniforme, chaque rang sort autant que les autres", () => {
  const moteur = createBlackjackEngine();
  const rng = grainRng(GRAINE + 2);
  const TIRAGES = 20_000;
  const parRang = new Map<string, number>();

  for (let i = 0; i < TIRAGES; i++) {
    const state = moteur.start("express", rng) as BlackjackState;
    // La première carte distribuée : si Fisher-Yates boitait, elle serait biaisée.
    const rang = state.joueur[0].rang;
    parRang.set(rang, (parRang.get(rang) ?? 0) + 1);
  }

  assert.equal(parRang.size, 13);
  const p = 1 / 13;
  const tolerance = 4 * Math.sqrt((p * (1 - p)) / TIRAGES);
  for (const [rang, nombre] of parRang) {
    const observe = nombre / TIRAGES;
    assert.ok(
      Math.abs(observe - p) < tolerance,
      `rang ${rang} : ${(observe * 100).toFixed(2)} % contre ${(p * 100).toFixed(2)} %`,
    );
  }
});
