import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CODE_LENGTH,
  DIGITS,
  MODES_VAULT_CODE,
  createVaultCodeEngine,
  indices,
  type VaultCodeMode,
  type VaultCodeState,
} from "../src/engine/vault-code.ts";
import type { Rng } from "../src/engine/types.ts";

/**
 * Le calibrage de Vault Code, REJOUÉ contre le vrai moteur.
 *
 * La table de gains n'a pas été décrétée : elle a été mesurée contre le
 * MEILLEUR joueur possible. Ce fichier refait la mesure et vérifie la seule
 * propriété qui compte vraiment :
 *
 *     le retour d'un joueur parfait est ≤ 1,00 — personne ne bat la maison.
 *
 * Deux joueurs sont simulés :
 *   - le solveur FORT : premier essai 0123, puis minimax — l'essai qui minimise
 *     la plus grosse classe d'équivalence restante, sur un échantillon de 300
 *     candidats quand il en reste davantage ;
 *   - le solveur MOYEN : un candidat encore compatible tiré au hasard, soit
 *     l'approximation raisonnable d'un joueur attentif mais pas méthodique.
 *
 * POURQUOI UNE ÉNUMÉRATION EXACTE, et pas seulement 600 parties tirées au sort :
 * en mode Sec le gain vaut ×29,04 au premier essai et 0 une fois sur deux ; sur
 * 600 parties l'erreur type approche 0,06, si bien qu'une mesure honnête peut
 * sortir à 1,01 alors que la vraie valeur est 0,96. Une assertion « ≤ 1,00 »
 * posée sur un échantillon de cette taille serait donc instable — elle
 * tomberait au hasard, sans qu'aucun jeton du calibrage ait bougé. Le solveur
 * fort étant DÉTERMINISTE (échantillon pris à pas régulier, pas au hasard), on
 * peut le faire jouer les 5 040 combinaisons et obtenir la valeur EXACTE, sans
 * bruit. Les 600 parties tirées au sort sont gardées à côté : elles vérifient
 * que la simulation et l'énumération racontent la même histoire, et elles
 * mesurent le joueur moyen, qui, lui, n'est pas déterministe.
 */

/** Parties tirées au sort, par mode et par solveur. */
const PARTIES = 600;
/** Candidats évalués par le minimax quand il en reste trop pour les essayer tous. */
const ECHANTILLON = 300;
/** Graine fixe : la simulation est rejouable à l'identique. */
const GRAINE = 12_345;
/** Essais joués par l'énumération : le plus généreux des modes. */
const ESSAIS_MAX = Math.max(...MODES_VAULT_CODE.map((m) => m.essais));

/** Bornes admises pour le retour EXACT du joueur parfait. */
const PLANCHER = 0.85;
const PLAFOND = 1.0;

/** Générateur déterministe (mulberry32) : aucun `Math.random` ici non plus. */
function seeded(graine: number): () => number {
  let a = graine;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function rngFrom(hasard: () => number): Rng {
  return { int: (max: number) => Math.floor(hasard() * max) };
}

/** Les 5 040 combinaisons de quatre chiffres tous différents. */
function toutesLesCombinaisons(): number[][] {
  const out: number[][] = [];
  const courant: number[] = [];
  const pris = new Array<boolean>(DIGITS).fill(false);
  const descendre = () => {
    if (courant.length === CODE_LENGTH) {
      out.push([...courant]);
      return;
    }
    for (let d = 0; d < DIGITS; d++) {
      if (pris[d]) continue;
      pris[d] = true;
      courant.push(d);
      descendre();
      courant.pop();
      pris[d] = false;
    }
  };
  descendre();
  return out;
}

const COMBINAISONS = toutesLesCombinaisons();
/** La réponse du coffre repliée en une clé 0..24, pour partitionner vite. */
const TROUVE = CODE_LENGTH * 5;

function cle(guess: number[], code: number[]): number {
  const { verrous, echos } = indices(guess, code);
  return verrous * 5 + echos;
}

/** `n` candidats pris à PAS RÉGULIER : un échantillon sans hasard, donc rejouable. */
function echantillonRegulier(liste: number[][], n: number): number[][] {
  return Array.from({ length: n }, (_, i) => liste[Math.floor((i * liste.length) / n)]);
}

/**
 * Le joueur PARFAIT. Sa réflexion ne dépend que du chemin déjà parcouru (les
 * réponses du coffre), donc on la mémorise : sans cela, énumérer 5 040 parties
 * referait 5 040 fois le même minimax.
 */
function solveurFort() {
  const memo = new Map<string, number[]>();
  return (candidats: number[][], chemin: number[]): number[] => {
    const clef = chemin.join(",");
    const connu = memo.get(clef);
    if (connu) return connu;

    let choix: number[];
    if (chemin.length === 0) choix = [0, 1, 2, 3];
    else if (candidats.length <= 2) choix = candidats[0];
    else {
      const pool =
        candidats.length <= ECHANTILLON
          ? candidats
          : echantillonRegulier(candidats, ECHANTILLON);
      let meilleur = pool[0];
      let pire = Number.POSITIVE_INFINITY;
      const classes = new Int32Array(25);
      for (const guess of pool) {
        classes.fill(0);
        let max = 0;
        for (const code of candidats) {
          const n = ++classes[cle(guess, code)];
          if (n > max) max = n;
        }
        if (max < pire) {
          pire = max;
          meilleur = guess;
        }
      }
      choix = meilleur;
    }
    memo.set(clef, choix);
    return choix;
  };
}

/** Le joueur MOYEN : un candidat compatible au hasard. */
function solveurMoyen(hasard: () => number) {
  return (candidats: number[][]): number[] => candidats[Math.floor(hasard() * candidats.length)];
}

type Choix = (candidats: number[][], chemin: number[]) => number[];

/**
 * Joue une partie complète contre LE VRAI MOTEUR et rend le multiplicateur
 * obtenu (0 si le code n'est pas trouvé). L'état de départ est fourni : c'est
 * ce qui permet à l'énumération d'imposer chaque code à son tour.
 */
function unePartie(depart: VaultCodeState, mode: VaultCodeMode, choisir: Choix): number {
  const engine = createVaultCodeEngine();
  const rng: Rng = { int: () => 0 }; // `act` ne tire rien : le hasard est déjà tombé
  let state = depart;
  let candidats = COMBINAISONS;
  const chemin: number[] = [];

  for (let essai = 0; essai < mode.essais; essai++) {
    const guess = choisir(candidats, chemin);
    const res = engine.act(state, { guess }, rng);
    state = res.state;
    if (res.status === "cashed_out") return res.multiplier;
    if (res.status === "lost") return 0;

    const reponse = cle(guess, depart.code);
    candidats = candidats.filter((code) => cle(guess, code) === reponse);
    chemin.push(reponse);
  }
  return 0;
}

/**
 * L'énumération : le joueur parfait joue LES 5 040 codes, en `ESSAIS_MAX`
 * essais, et on compte à quel essai il trouve. La distribution obtenue donne le
 * retour exact de chaque mode (un mode plus court ne fait que tronquer la même
 * distribution).
 */
function distributionDuJoueurParfait(): { trouves: number[]; echecs: number } {
  const choisir = solveurFort();
  const trouves = new Array<number>(ESSAIS_MAX + 1).fill(0);
  let echecs = 0;

  for (const secret of COMBINAISONS) {
    let candidats = COMBINAISONS;
    const chemin: number[] = [];
    let trouve = 0;
    for (let essai = 1; essai <= ESSAIS_MAX; essai++) {
      const guess = choisir(candidats, chemin);
      const reponse = cle(guess, secret);
      if (reponse === TROUVE) {
        trouve = essai;
        break;
      }
      candidats = candidats.filter((code) => cle(guess, code) === reponse);
      chemin.push(reponse);
    }
    if (trouve) trouves[trouve]++;
    else echecs++;
  }
  return { trouves, echecs };
}

/** Retour EXACT d'un mode, tiré de la distribution du joueur parfait. */
function retourExact(mode: VaultCodeMode, trouves: number[]): number {
  let somme = 0;
  for (let essai = 1; essai <= mode.essais; essai++) {
    somme += (trouves[essai] / COMBINAISONS.length) * mode.gains[essai - 1];
  }
  return somme;
}

/** Moyenne et erreur type d'une simulation de `PARTIES` parties. */
function simuler(
  mode: VaultCodeMode,
  choisir: (hasard: () => number) => Choix,
): { moyenne: number; erreurType: number } {
  const hasard = seeded(GRAINE);
  const engine = createVaultCodeEngine();
  const rng = rngFrom(hasard);
  const strategie = choisir(hasard);

  let somme = 0;
  let sommeCarres = 0;
  for (let i = 0; i < PARTIES; i++) {
    // Le code est tiré par le moteur lui-même, avec la graine du test.
    const gain = unePartie(engine.start(mode.id, rng), mode, strategie);
    somme += gain;
    sommeCarres += gain * gain;
  }
  const moyenne = somme / PARTIES;
  const variance = Math.max(0, sommeCarres / PARTIES - moyenne * moyenne);
  return { moyenne, erreurType: Math.sqrt(variance / PARTIES) };
}

/* -------------------------------------------------------------------------- */

test("les 5 040 combinaisons sont bien toutes les combinaisons distinctes", () => {
  assert.equal(COMBINAISONS.length, 10 * 9 * 8 * 7);
  assert.equal(new Set(COMBINAISONS.map((c) => c.join(""))).size, COMBINAISONS.length);
});

test("un joueur parfait ne bat jamais la maison", () => {
  const { trouves, echecs } = distributionDuJoueurParfait();
  assert.equal(
    trouves.reduce((a, b) => a + b, 0) + echecs,
    COMBINAISONS.length,
    "toutes les combinaisons doivent être jouées",
  );

  const lignes: string[] = [];
  for (const mode of MODES_VAULT_CODE) {
    const exact = retourExact(mode, trouves);

    // LA propriété : le meilleur joueur possible perd sur la durée.
    assert.ok(
      exact <= PLAFOND,
      `${mode.id} : un joueur parfait rend ${exact.toFixed(4)} > ${PLAFOND} — la maison perd`,
    );
    // …et le jeu reste jouable : une table trop dure serait une autre erreur.
    assert.ok(
      exact >= PLANCHER,
      `${mode.id} : un joueur parfait ne rend que ${exact.toFixed(4)} < ${PLANCHER}`,
    );
    lignes.push(`${mode.id} ${exact.toFixed(4)}`);
  }

  console.log(
    `Vault Code — retour EXACT du joueur parfait (5 040 codes) : ${lignes.join(" · ")}` +
      ` ; essais 1→${ESSAIS_MAX} : ${trouves.slice(1).join("/")}, jamais trouvé ${echecs}`,
  );
});

test("600 parties tirées au sort disent la même chose que l'énumération", () => {
  const { trouves } = distributionDuJoueurParfait();
  const lignes: string[] = [];

  for (const mode of MODES_VAULT_CODE) {
    const exact = retourExact(mode, trouves);
    const fort = simuler(mode, () => solveurFort());
    const moyen = simuler(mode, (hasard) => solveurMoyen(hasard));

    // La simulation doit tomber autour de la valeur exacte : 4 erreurs types.
    const marge = 4 * fort.erreurType + 0.01;
    assert.ok(
      Math.abs(fort.moyenne - exact) <= marge,
      `${mode.id} : simulation ${fort.moyenne.toFixed(4)} loin de l'exact ${exact.toFixed(4)}` +
        ` (marge ${marge.toFixed(4)})`,
    );
    // Témoin : un joueur moins méthodique ne peut pas faire mieux que le parfait.
    assert.ok(
      moyen.moyenne <= exact + 4 * moyen.erreurType,
      `${mode.id} : le joueur moyen (${moyen.moyenne.toFixed(4)}) dépasse le parfait` +
        ` (${exact.toFixed(4)})`,
    );
    lignes.push(
      `${mode.id} fort ${fort.moyenne.toFixed(4)} ±${(2 * fort.erreurType).toFixed(4)}` +
        ` / moyen ${moyen.moyenne.toFixed(4)} ±${(2 * moyen.erreurType).toFixed(4)}`,
    );
  }

  console.log(`Vault Code — ${PARTIES} parties par mode et par solveur : ${lignes.join(" · ")}`);
});

test("la simulation est déterministe : deux passages donnent le même retour", () => {
  const mode = MODES_VAULT_CODE[2]; // Sec, le plus court donc le plus rapide
  const a = simuler(mode, (hasard) => solveurMoyen(hasard));
  const b = simuler(mode, (hasard) => solveurMoyen(hasard));
  assert.equal(a.moyenne, b.moyenne);
});
