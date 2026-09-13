import { test } from "node:test";
import assert from "node:assert/strict";
import { makeApp, signUp } from "./helper.ts";
import {
  GAINS,
  RANGS,
  buildDeck,
  createBlackjackEngine,
  melange,
  texteTotal,
  totalOf,
  type BlackjackState,
  type Carte,
} from "../src/engine/blackjack.ts";
import { EngineError, type Rng } from "../src/engine/types.ts";

/**
 * Blackjack Express : les règles, et la carte cachée du croupier.
 *
 * Le moteur prend un état et rend un état : les tests le pilotent donc en
 * fabriquant la main qu'ils veulent, sans dépendre d'un tirage. Le hasard,
 * lui, est jugé par la mesure (`blackjack-calibrage.test.ts`).
 */

const BJ = "/api/games/blackjack-express";
const moteur = createBlackjackEngine();

/** Un tirage qui ne mélange rien : `j = i` à chaque tour de Fisher-Yates. */
const rngIdentite: Rng = { int: (max: number) => max - 1 };

/** Une carte, écrite court : `c("R", "coeur")`. */
function c(rang: string, enseigne = "pique"): Carte {
  return { rang, enseigne } as Carte;
}

/** Un état de manche fabriqué à la main ; `sabot` est écrit dans l'ordre de pioche. */
function etat(joueur: Carte[], croupier: Carte[], sabot: Carte[] = []): BlackjackState {
  return {
    mode: "express",
    sabot: [...sabot].reverse(),
    joueur,
    croupier,
    coups: 0,
    fini: false,
    issue: null,
  };
}

/* ------------------------------- Les cartes ------------------------------- */

test("un jeu de 52 cartes, toutes différentes", () => {
  const jeu = buildDeck();
  assert.equal(jeu.length, 52);
  assert.equal(new Set(jeu.map((carte) => `${carte.rang}${carte.enseigne}`)).size, 52);
  assert.equal(jeu.filter((carte) => carte.rang === "A").length, 4);
  assert.equal(RANGS.length, 13);
});

test("le mélange garde les 52 cartes et ne touche pas l'original", () => {
  const jeu = buildDeck();
  const battu = melange(jeu, { int: (max) => Math.floor(Math.random() * max) });
  assert.equal(battu.length, 52);
  assert.equal(new Set(battu.map((carte) => `${carte.rang}${carte.enseigne}`)).size, 52);
  assert.deepEqual(jeu, buildDeck());
});

test("l'as vaut 11 puis 1, et le total souple s'écrit « 7 ou 17 »", () => {
  assert.deepEqual(totalOf([c("A"), c("6")]), { total: 17, dur: 7, souple: true });
  assert.equal(texteTotal(totalOf([c("A"), c("6")])), "7 ou 17");

  // L'as retombe à 1 dès que 11 ferait dépasser.
  assert.deepEqual(totalOf([c("A"), c("6"), c("9")]), { total: 16, dur: 16, souple: false });
  assert.equal(texteTotal(totalOf([c("A"), c("6"), c("9")])), "16");

  // Deux as : un seul peut valoir 11.
  assert.equal(totalOf([c("A"), c("A")]).total, 12);
  assert.equal(totalOf([c("A"), c("A"), c("9")]).total, 21);

  // Les figures valent 10.
  assert.equal(totalOf([c("R"), c("D")]).total, 20);
  assert.equal(totalOf([c("V"), c("A")]).total, 21);
});

/* -------------------------------- Les règles -------------------------------- */

test("le croupier tire jusqu'à 17 inclus et reste, 17 souple compris", () => {
  // 16 : il tire, reçoit un 2, s'arrête à 18.
  const dur = moteur.act(
    etat([c("R"), c("9")], [c("9"), c("7")], [c("2"), c("8")]),
    { move: "stand" },
    rngIdentite,
  );
  assert.equal(dur.state.croupier.length, 3);
  assert.equal(totalOf(dur.state.croupier).total, 18);

  // 17 souple (A + 6) : il RESTE, il ne cherche pas mieux.
  const souple = moteur.act(
    etat([c("R"), c("9")], [c("A"), c("6")], [c("2")]),
    { move: "stand" },
    rngIdentite,
  );
  assert.equal(souple.state.croupier.length, 2);
  assert.equal(souple.state.issue, "gagne");
});

test("les gains : blackjack ×2,5, victoire ×2, égalité ×1, défaite ×0", () => {
  assert.deepEqual(GAINS, { blackjack: 2.5, gagne: 2, egalite: 1, perdu: 0 });

  const naturel = moteur.act(
    etat([c("A"), c("R")], [c("9"), c("7")], [c("5")]),
    { move: "stand" },
    rngIdentite,
  );
  assert.equal(naturel.state.issue, "blackjack");
  assert.equal(naturel.multiplier, 2.5);
  assert.equal(naturel.status, "cashed_out");

  const gagne = moteur.act(etat([c("R"), c("9")], [c("R"), c("8")]), { move: "stand" }, rngIdentite);
  assert.equal(gagne.state.issue, "gagne");
  assert.equal(gagne.multiplier, 2);

  const egalite = moteur.act(
    etat([c("R"), c("9")], [c("R"), c("9")]),
    { move: "stand" },
    rngIdentite,
  );
  assert.equal(egalite.state.issue, "egalite");
  assert.equal(egalite.multiplier, 1);
  assert.equal(egalite.status, "cashed_out");

  const perdu = moteur.act(etat([c("R"), c("8")], [c("R"), c("9")]), { move: "stand" }, rngIdentite);
  assert.equal(perdu.state.issue, "perdu");
  assert.equal(perdu.multiplier, 0);
  assert.equal(perdu.status, "lost");
});

test("le blackjack du croupier : défaite contre 20, égalité contre un blackjack", () => {
  const contre20 = moteur.act(
    etat([c("R"), c("R")], [c("A"), c("D")]),
    { move: "stand" },
    rngIdentite,
  );
  assert.equal(contre20.state.issue, "perdu");
  assert.equal(contre20.multiplier, 0);
  // Le croupier ne tire pas : son blackjack tranche tout de suite.
  assert.equal(contre20.state.croupier.length, 2);

  const deuxNaturels = moteur.act(
    etat([c("A"), c("R")], [c("A"), c("D")]),
    { move: "stand" },
    rngIdentite,
  );
  assert.equal(deuxNaturels.state.issue, "egalite");
  assert.equal(deuxNaturels.multiplier, 1);

  // 21 en trois cartes n'est PAS un blackjack naturel : victoire simple.
  const tardif = moteur.act(
    { ...etat([c("7"), c("7"), c("7")], [c("R"), c("9")]), coups: 1 },
    { move: "stand" },
    rngIdentite,
  );
  assert.equal(tardif.state.issue, "gagne");
  assert.equal(tardif.multiplier, 2);
});

test("tirer : la carte s'ajoute, et dépasser 21 perd tout de suite", () => {
  const encore = moteur.act(
    etat([c("5"), c("6")], [c("R"), c("7")], [c("4")]),
    { move: "hit" },
    rngIdentite,
  );
  assert.equal(encore.status, "playing");
  assert.equal(encore.state.joueur.length, 3);
  assert.equal(totalOf(encore.state.joueur).total, 15);
  assert.equal(encore.step, 1);
  assert.equal(encore.multiplier, 0);

  const brulee = moteur.act(
    etat([c("R"), c("9")], [c("6"), c("7")], [c("8")]),
    { move: "hit" },
    rngIdentite,
  );
  assert.equal(brulee.status, "lost");
  assert.equal(brulee.multiplier, 0);
  assert.equal(brulee.state.issue, "perdu");
  // Le croupier ne joue pas : la main du joueur est déjà morte.
  assert.equal(brulee.state.croupier.length, 2);
});

test("un coup impossible est un refus du moteur, pas un corps invalide", () => {
  // Tirer sur 21 : le joueur ne peut que rester.
  assert.throws(
    () =>
      moteur.act(etat([c("A"), c("R")], [c("9"), c("7")], [c("5")]), { move: "hit" }, rngIdentite),
    (err: unknown) => err instanceof EngineError && err.code === "cannot_hit" && err.status === 409,
  );

  const fini = moteur.act(etat([c("R"), c("9")], [c("R"), c("8")]), { move: "stand" }, rngIdentite);
  assert.throws(
    () => moteur.act(fini.state, { move: "hit" }, rngIdentite),
    (err: unknown) => err instanceof EngineError && err.code === "round_not_active",
  );
});

test("le schéma d'action n'accepte que hit et stand", () => {
  assert.ok(moteur.actionSchema.safeParse({ move: "hit" }).success);
  assert.ok(moteur.actionSchema.safeParse({ move: "stand" }).success);
  assert.ok(!moteur.actionSchema.safeParse({ move: "double" }).success);
  assert.ok(!moteur.actionSchema.safeParse({}).success);
  assert.ok(!moteur.actionSchema.safeParse({ move: 1 }).success);
});

/* --------------------------------- La vue --------------------------------- */

test("la vue en cours ne montre qu'une carte du croupier", () => {
  const state = etat(
    [c("R", "coeur"), c("7", "pique")],
    [c("9", "trefle"), c("A", "carreau")],
    [c("2")],
  );
  const vue = moteur.view(state) as Record<string, unknown>;

  assert.equal(vue.fini, false);
  assert.deepEqual(vue.joueur, {
    cartes: [c("R", "coeur"), c("7", "pique")],
    total: 17,
    texte: "17",
    brulee: false,
  });
  assert.deepEqual(vue.croupier, {
    visible: c("9", "trefle"),
    cartes: null,
    total: null,
    texte: null,
  });
  assert.equal(vue.peutTirer, true);
  assert.equal(vue.issue, null);

  // Ni la carte cachée ni le sabot n'apparaissent nulle part.
  const texte = JSON.stringify(vue);
  assert.ok(!texte.includes("carreau"), texte);
  assert.ok(!texte.includes("sabot"), texte);
});

test("à la fin, la vue montre la main du croupier et l'issue", () => {
  const fin = moteur.act(
    etat([c("R", "coeur"), c("9", "pique")], [c("R", "trefle"), c("8", "carreau")]),
    { move: "stand" },
    rngIdentite,
  );
  const vue = moteur.view(fin.state) as Record<string, unknown>;

  assert.equal(vue.fini, true);
  assert.equal(vue.issue, "gagne");
  assert.equal(vue.peutTirer, false);
  assert.deepEqual(vue.croupier, {
    visible: c("R", "trefle"),
    cartes: [c("R", "trefle"), c("8", "carreau")],
    total: 18,
    texte: "18",
  });
});

test("à 21, le joueur ne peut plus tirer", () => {
  const vue = moteur.view(etat([c("A"), c("R")], [c("9"), c("7")], [c("2")])) as {
    peutTirer: boolean;
  };
  assert.equal(vue.peutTirer, false);
});

/* -------------------------------- La config -------------------------------- */

test("la config porte les gains, la règle du croupier et les bornes de mise", () => {
  const config = moteur.config() as unknown as Record<string, unknown>;
  assert.equal(config.id, "blackjack-express");
  assert.equal(config.kind, "cards");
  assert.equal(config.name, "Blackjack Express");
  assert.equal(config.canCashout, false);
  assert.deepEqual(config.modes, [{ id: "express", label: "Express" }]);
  assert.equal(config.minBetCents, 100);
  assert.equal(config.maxBetCents, 100_000);
  assert.equal(config.maxPayoutCents, 1_000_000);

  const gains = config.gains as { id: string; multiplier: number }[];
  assert.deepEqual(
    gains.map((gain) => [gain.id, gain.multiplier]),
    [
      ["blackjack", 2.5],
      ["gagne", 2],
      ["egalite", 1],
      ["perdu", 0],
    ],
  );
  assert.match(String(config.regleCroupier), /17/);
  assert.match(String(config.regleSabot), /52/);
  assert.equal(moteur.canCashout, false);
  assert.equal(moteur.cashout, undefined);
});

/* --------------------------------- Par HTTP --------------------------------- */

test("une manche complète : le sabot figé donne deux mains de 20, donc une égalité", async () => {
  // `int: max - 1` ne permute rien : le sabot reste dans l'ordre de fabrication.
  const app = makeApp({ rng: rngIdentite });
  const { agent } = await signUp(app);

  const start = await agent.post(`${BJ}/start`).send({ betCoins: 10, mode: "express" });
  assert.equal(start.status, 201);
  const vue = start.body.round.view;
  assert.deepEqual(vue.joueur.cartes, [c("R", "trefle"), c("V", "trefle")]);
  assert.equal(vue.joueur.total, 20);
  assert.deepEqual(vue.croupier.visible, c("D", "trefle"));
  assert.equal(vue.croupier.cartes, null);
  assert.equal((await agent.get("/api/wallet")).body.balanceCents, 99_000);

  const coup = await agent
    .post(`${BJ}/play`)
    .send({ roundId: start.body.round.id, step: 0, move: "stand" });
  assert.equal(coup.status, 200);
  assert.equal(coup.body.issue, "egalite");
  assert.equal(coup.body.round.status, "cashed_out");
  assert.equal(coup.body.round.multiplier, 1);
  assert.equal(coup.body.round.payoutCents, 1000);
  assert.deepEqual(coup.body.round.view.croupier.cartes, [c("D", "trefle"), c("10", "trefle")]);

  // Mise rendue : le solde revient à son point de départ.
  assert.equal((await agent.get("/api/wallet")).body.balanceCents, 100_000);
});

test("la carte cachée et le sabot ne sortent jamais pendant la manche", async () => {
  const app = makeApp(); // vrai hasard : rien ne doit fuir
  const { agent } = await signUp(app);

  for (let manche = 0; manche < 30; manche++) {
    const start = await agent.post(`${BJ}/start`).send({ betCoins: 1, mode: "express" });
    assert.equal(start.status, 201);

    for (const corps of [start.body, (await agent.get(`${BJ}/current`)).body]) {
      const texte = JSON.stringify(corps);
      assert.ok(!texte.includes("sabot"), texte);
      assert.ok(!texte.includes("state_json"), texte);
      // La preuve : exactement les cartes montrées, pas une de plus.
      const cartes = texte.split('"rang"').length - 1;
      const montrees = corps.round.view.joueur.cartes.length + 1;
      assert.equal(cartes, montrees, `manche ${manche} : ${cartes} cartes dans ${texte}`);
    }

    await agent.post(`${BJ}/play`).send({ roundId: start.body.round.id, step: 0, move: "stand" });
  }
});

test("aucun encaissement : 400 cashout_not_allowed, et la manche ne bouge pas", async () => {
  const app = makeApp();
  const { agent } = await signUp(app);
  const start = await agent.post(`${BJ}/start`).send({ betCoins: 10, mode: "express" });

  const res = await agent.post(`${BJ}/cashout`).send({ roundId: start.body.round.id });
  assert.equal(res.status, 400);
  assert.equal(res.body.error, "cashout_not_allowed");
  assert.equal((await agent.get(`${BJ}/current`)).body.round.status, "playing");
  assert.equal((await agent.get("/api/wallet")).body.balanceCents, 99_000);
});

test("un coup mal formé est un 400 invalid_body", async () => {
  const app = makeApp({ rng: rngIdentite });
  const { agent } = await signUp(app);
  const start = await agent.post(`${BJ}/start`).send({ betCoins: 10, mode: "express" });
  const roundId = start.body.round.id;

  const inconnu = await agent.post(`${BJ}/play`).send({ roundId, step: 0, move: "split" });
  assert.equal(inconnu.status, 400);
  assert.equal(inconnu.body.error, "invalid_body");

  const sansMove = await agent.post(`${BJ}/play`).send({ roundId, step: 0 });
  assert.equal(sansMove.status, 400);
  assert.equal(sansMove.body.error, "invalid_body");

  // Rien n'a été joué : la manche est intacte.
  assert.equal((await agent.get(`${BJ}/current`)).body.round.step, 0);
});

test("tirer sur 20 dépasse : la manche est perdue et le croupier se découvre", async () => {
  // Sabot figé : R, V de trèfle au joueur (20), puis un 9 qui le fait dépasser.
  const app = makeApp({ rng: rngIdentite });
  const { agent } = await signUp(app);
  const start = await agent.post(`${BJ}/start`).send({ betCoins: 10, mode: "express" });

  const res = await agent
    .post(`${BJ}/play`)
    .send({ roundId: start.body.round.id, step: 0, move: "hit" });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.tiree, c("9", "trefle"));
  assert.equal(res.body.issue, "perdu");
  assert.equal(res.body.round.status, "lost");
  assert.equal(res.body.round.payoutCents, 0);
  assert.equal(res.body.round.view.joueur.brulee, true);
  assert.equal(res.body.round.view.joueur.total, 29);
  assert.deepEqual(res.body.round.view.croupier.cartes, [c("D", "trefle"), c("10", "trefle")]);

  // Un coup de plus sur une manche close : 409, et rien ne bouge.
  const encore = await agent
    .post(`${BJ}/play`)
    .send({ roundId: start.body.round.id, step: 1, move: "stand" });
  assert.equal(encore.status, 409);
  assert.equal(encore.body.error, "round_not_active");
  assert.equal((await agent.get("/api/wallet")).body.balanceCents, 99_000);
});

test("le multiplicateur et le gain suivent l'issue, manche après manche", async () => {
  const app = makeApp();
  const { agent } = await signUp(app);
  const attendu: Record<string, number> = { blackjack: 2.5, gagne: 2, egalite: 1, perdu: 0 };

  for (let manche = 0; manche < 40; manche++) {
    const start = await agent.post(`${BJ}/start`).send({ betCoins: 1, mode: "express" });
    const coup = await agent
      .post(`${BJ}/play`)
      .send({ roundId: start.body.round.id, step: 0, move: "stand" });
    assert.equal(coup.status, 200);

    const { issue, round } = coup.body;
    assert.equal(round.multiplier, attendu[issue], `issue ${issue}`);
    assert.equal(round.payoutCents, Math.round(100 * attendu[issue]));
    assert.equal(round.status, issue === "perdu" ? "lost" : "cashed_out");
    assert.equal(round.view.fini, true);
    assert.ok(round.view.croupier.cartes.length >= 2);
  }
});
