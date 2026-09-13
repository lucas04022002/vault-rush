import { test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { makeApp, signUp } from "./helper.ts";
import {
  DROP_MODES,
  createDropEngine,
  dropConfig,
  exactReturn,
  slotMultipliers,
  slotProbabilities,
  type DropMode,
  type DropState,
} from "../src/engine/drop.ts";
import { EngineError, type Rng } from "../src/engine/types.ts";
import { MAX_BET_CENTS, MAX_PAYOUT_CENTS } from "../src/money.ts";

/**
 * Diamond Drop : le plateau de clous.
 *
 * Le calibrage n'est pas recopié, il est RECALCULÉ par le moteur puis comparé
 * aux tables figées du rapport : si la formule dérive, ces tests tombent.
 */

const DD = "/api/games/diamond-drop";

/** Les tables figées (calibrage du 13/09/2026), de la case gauche à la droite. */
const TABLES: Record<string, number[]> = {
  doux: [6.03, 2.13, 1.14, 0.8, 0.72, 0.8, 1.14, 2.13, 6.03],
  nerveux: [50.54, 10.05, 3.31, 1.51, 0.89, 0.65, 0.59, 0.65, 0.89, 1.51, 3.31, 10.05, 50.54],
  fou: [
    604.39, 75.54, 16.67, 5.25, 2.16, 1.12, 0.71, 0.54, 0.5, 0.54, 0.71, 1.12, 2.16, 5.25, 16.67,
    75.54, 604.39,
  ],
};

/** Les retours exacts attendus, mode par mode. */
const RETOURS: Record<string, number> = { doux: 0.97648, nerveux: 0.95202, fou: 0.93559 };

function modeOf(id: string): DropMode {
  const mode = DROP_MODES.find((m) => m.id === id);
  if (!mode) throw new Error(`mode inconnu : ${id}`);
  return mode;
}

/** Un `Rng` déterministe (mulberry32) : la mesure d'uniformité est rejouable. */
function seededRng(seed: number): Rng {
  let state = seed >>> 0;
  return {
    int(maxExclusive: number): number {
      state = (state + 0x6d2b79f5) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      const unit = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      return Math.floor(unit * maxExclusive);
    },
  };
}

/** Un `Rng` qui répond toujours la même chose : 1 = toujours à droite. */
function fixedRng(value: number): Rng {
  return { int: () => value };
}

/* ------------------------------- Le calibrage ------------------------------- */

test("les tables de gains sont celles du calibrage figé", () => {
  for (const mode of DROP_MODES) {
    assert.deepEqual(slotMultipliers(mode), TABLES[mode.id], mode.id);
    // Une case par chemin possible : R rangées donnent R+1 cases.
    assert.equal(slotMultipliers(mode).length, mode.rows + 1, mode.id);
  }
});

test("le retour exact de chaque mode tient dans [1 − bord − 0,01 ; 1 − bord]", () => {
  for (const mode of DROP_MODES) {
    const retour = exactReturn(mode);
    assert.ok(
      retour <= 1 - mode.houseEdge,
      `${mode.id} : retour ${retour} au-dessus de ${1 - mode.houseEdge}`,
    );
    assert.ok(
      retour >= 1 - mode.houseEdge - 0.01,
      `${mode.id} : retour ${retour} sous ${1 - mode.houseEdge - 0.01}`,
    );
    // La valeur exacte du rapport, au cinquième chiffre.
    assert.equal(Number(retour.toFixed(5)), RETOURS[mode.id], mode.id);
  }
});

test("la case centrale est le plus faible multiplicateur du plateau", () => {
  for (const mode of DROP_MODES) {
    const slots = slotMultipliers(mode);
    const centre = slots[mode.rows / 2];
    assert.equal(centre, Math.min(...slots), mode.id);
    // Et elle est strictement plus basse que ses voisines : le centre ne paie pas.
    assert.ok(centre < slots[mode.rows / 2 - 1], mode.id);
    assert.ok(centre < slots[mode.rows / 2 + 1], mode.id);
  }
});

test("les probabilités de case somment à 1 et sont symétriques", () => {
  for (const mode of DROP_MODES) {
    const p = slotProbabilities(mode.rows);
    assert.ok(Math.abs(p.reduce((s, x) => s + x, 0) - 1) < 1e-12, mode.id);
    for (let k = 0; k <= mode.rows; k++) {
      assert.ok(Math.abs(p[k] - p[mode.rows - k]) < 1e-15, `${mode.id} case ${k}`);
    }
  }
});

/* -------------------------------- Le tirage -------------------------------- */

test("le chemin tiré au démarrage est uniforme (20 000 tirages, graine fixe)", () => {
  const engine = createDropEngine();
  const mode = modeOf("doux");
  const N = 20_000;
  const rng = seededRng(20260913);

  const parRangee = Array.from({ length: mode.rows }, () => 0);
  const parCase = Array.from({ length: mode.rows + 1 }, () => 0);
  for (let i = 0; i < N; i++) {
    const state = engine.start(mode.id, rng) as DropState;
    assert.equal(state.path.length, mode.rows);
    let droites = 0;
    state.path.forEach((droite, rangee) => {
      if (droite) {
        parRangee[rangee] += 1;
        droites += 1;
      }
    });
    parCase[droites] += 1;
  }

  // Chaque rangée : Binomiale(N, 1/2). Tolérance = 4 écarts-types, pas un nombre magique.
  const sdRangee = Math.sqrt(N * 0.25);
  for (let rangee = 0; rangee < mode.rows; rangee++) {
    assert.ok(
      Math.abs(parRangee[rangee] - N / 2) <= 4 * sdRangee,
      `rangée ${rangee} : ${parRangee[rangee]} droites sur ${N} (± ${(4 * sdRangee).toFixed(1)})`,
    );
  }

  // Chaque case : Binomiale(N, P(k)), même règle de tolérance.
  const p = slotProbabilities(mode.rows);
  for (let k = 0; k <= mode.rows; k++) {
    const attendu = N * p[k];
    const sd = Math.sqrt(N * p[k] * (1 - p[k]));
    assert.ok(
      Math.abs(parCase[k] - attendu) <= 4 * sd,
      `case ${k} : ${parCase[k]} au lieu de ${attendu.toFixed(1)} (± ${(4 * sd).toFixed(1)})`,
    );
  }
});

test("le retour mesuré sur 20 000 lâchers colle au retour exact", () => {
  const engine = createDropEngine();
  const mode = modeOf("nerveux");
  const N = 20_000;
  const rng = seededRng(77);

  let total = 0;
  let carres = 0;
  for (let i = 0; i < N; i++) {
    const state = engine.start(mode.id, rng) as DropState;
    const { multiplier } = engine.act(state, {}, rng);
    total += multiplier;
    carres += multiplier * multiplier;
  }
  const moyenne = total / N;
  const exact = exactReturn(mode);
  // Tolérance dérivée de l'écart-type mesuré, pas décrétée.
  const sd = Math.sqrt(Math.max(carres / N - moyenne * moyenne, 0) / N);
  assert.ok(
    Math.abs(moyenne - exact) <= 4 * sd,
    `retour mesuré ${moyenne.toFixed(4)} vs exact ${exact.toFixed(5)} (± ${(4 * sd).toFixed(4)})`,
  );
});

/* --------------------------------- Le moteur --------------------------------- */

test("la vue ne montre rien du chemin avant le lâcher", () => {
  const engine = createDropEngine();
  const gauche = engine.start("fou", fixedRng(0));
  const droite = engine.start("fou", fixedRng(1));

  // Deux chemins opposés, une seule et même vue : elle ne porte aucune information.
  assert.deepEqual(engine.view(gauche), engine.view(droite));
  const vue = engine.view(gauche) as Record<string, unknown>;
  assert.equal(vue.dropped, false);
  assert.equal(vue.path, null);
  assert.equal(vue.slot, null);
  assert.equal(vue.multiplier, null);
  assert.equal(vue.rows, 16);
  assert.deepEqual(vue.slots, TABLES.fou);
});

test("la vue montre le chemin, la case et le gain APRÈS le lâcher", () => {
  const engine = createDropEngine();
  const state = engine.start("doux", fixedRng(1)) as DropState;
  const result = engine.act(state, {}, fixedRng(1));

  assert.equal(result.status, "cashed_out");
  assert.equal(result.step, 1);
  assert.equal(result.multiplier, 6.03);
  assert.deepEqual(result.reveal, {
    path: [true, true, true, true, true, true, true, true],
    slot: 8,
    multiplier: 6.03,
  });

  const vue = engine.view(result.state) as Record<string, unknown>;
  assert.equal(vue.dropped, true);
  assert.deepEqual(vue.path, [true, true, true, true, true, true, true, true]);
  assert.equal(vue.slot, 8);
  assert.equal(vue.multiplier, 6.03);
});

test("un second lâcher sur une partie finie est un EngineError", () => {
  const engine = createDropEngine();
  const state = engine.start("doux", fixedRng(0));
  const result = engine.act(state, {}, fixedRng(0));
  assert.throws(
    () => engine.act(result.state, {}, fixedRng(0)),
    (err: unknown) => err instanceof EngineError && err.status === 409,
  );
});

test("le corps d'un lâcher est un objet vide, et le moteur n'encaisse pas", () => {
  const engine = createDropEngine();
  assert.equal(engine.canCashout, false);
  assert.equal(engine.cashout, undefined);
  assert.equal(engine.nextMultiplier, undefined);
  assert.equal(engine.kind, "drop");
  assert.equal(engine.id, "diamond-drop");

  assert.equal(engine.actionSchema.safeParse({}).success, true);
  // L'enveloppe du coup passe : le schéma du jeu n'ajoute aucun champ.
  assert.equal(engine.actionSchema.safeParse({ roundId: 1, step: 0 }).success, true);
  assert.equal(engine.actionSchema.safeParse("lâcher").success, false);
});

test("la config porte les rangées, les cases, le plafond et les bornes de mise", () => {
  const config = dropConfig();
  // Le moteur ne sert rien d'autre que cette config.
  assert.deepEqual(createDropEngine().config(), config);
  assert.equal(config.kind, "drop");
  assert.equal(config.canCashout, false);
  assert.equal(config.steps, 1);
  assert.equal(config.maxPayoutCents, MAX_PAYOUT_CENTS);
  assert.equal(config.minBetCents, 100);
  assert.equal(config.maxBetCents, MAX_BET_CENTS);
  assert.deepEqual(
    config.modes.map((m) => m.id),
    ["doux", "nerveux", "fou"],
  );
  assert.deepEqual(
    config.modes.map((m) => m.label),
    ["Doux", "Nerveux", "Fou"],
  );
  for (const mode of config.modes) {
    assert.equal(mode.slots.length, mode.rows + 1, mode.id);
    assert.deepEqual(mode.slots, TABLES[mode.id], mode.id);
  }
});

/* ---------------------------------- L'API ---------------------------------- */

test("le chemin ne fuite pas dans la réponse HTTP avant le lâcher", async () => {
  const app = makeApp(); // vrai hasard : rien ne doit sortir du tirage
  const { agent } = await signUp(app);

  const vues = new Set<string>();
  for (let i = 0; i < 25; i++) {
    const start = await agent.post(`${DD}/start`).send({ betCoins: 1, mode: "fou" });
    assert.equal(start.status, 201);
    const texte = JSON.stringify(start.body);
    assert.ok(!texte.includes('"path":['), `le chemin a fuité : ${texte}`);
    assert.ok(!texte.includes("state_json"), texte);
    vues.add(JSON.stringify(start.body.round.view));

    const current = await agent.get(`${DD}/current`);
    assert.ok(!JSON.stringify(current.body).includes('"path":['), JSON.stringify(current.body));

    await agent.post(`${DD}/play`).send({ roundId: start.body.round.id, step: 0 });
  }
  // 25 chemins différents, UNE seule vue : la réponse ne porte aucun bit du tirage.
  assert.equal(vues.size, 1, `la vue varie avec le tirage : ${[...vues].join(" | ")}`);
});

test("un lâcher renvoie le chemin, la case et le multiplicateur", async () => {
  const app = makeApp({ rng: fixedRng(0) }); // toujours à gauche : case 0
  const { agent } = await signUp(app);
  const start = await agent.post(`${DD}/start`).send({ betCoins: 10, mode: "doux" });

  const joue = await agent.post(`${DD}/play`).send({ roundId: start.body.round.id, step: 0 });
  assert.equal(joue.status, 200);
  assert.equal(joue.body.slot, 0);
  assert.equal(joue.body.multiplier, 6.03);
  assert.deepEqual(joue.body.path, [false, false, false, false, false, false, false, false]);
  assert.equal(joue.body.round.status, "cashed_out");
  assert.equal(joue.body.round.step, 1);
  assert.equal(joue.body.round.payoutCents, 6030);

  // Une seule action par partie : la partie est close.
  assert.equal((await agent.get(`${DD}/current`)).body.round, null);
});

test("un second lâcher sur la même partie est refusé", async () => {
  const app = makeApp({ rng: fixedRng(1) });
  const { agent } = await signUp(app);
  const start = await agent.post(`${DD}/start`).send({ betCoins: 10, mode: "doux" });
  const roundId = start.body.round.id;

  assert.equal((await agent.post(`${DD}/play`).send({ roundId, step: 0 })).status, 200);
  const encore = await agent.post(`${DD}/play`).send({ roundId, step: 0 });
  assert.equal(encore.status, 409);
  assert.equal(encore.body.error, "round_not_active");
});

test("le jeu ne s'encaisse pas en cours de partie", async () => {
  const app = makeApp();
  const { agent } = await signUp(app);
  const start = await agent.post(`${DD}/start`).send({ betCoins: 10, mode: "doux" });

  const res = await agent.post(`${DD}/cashout`).send({ roundId: start.body.round.id });
  assert.equal(res.status, 400);
  assert.equal(res.body.error, "cashout_not_allowed");
  assert.equal((await agent.get(`${DD}/current`)).body.round.status, "playing");
});

test("le plafond de 10 000 coins mord sur la case extrême en mode Fou", async () => {
  // 1 000 coins sur ×604,39 vaudraient 604 390 coins : le plafond ramène à 10 000.
  const app = makeApp({ rng: fixedRng(1) });
  const { agent } = await signUp(app);
  const start = await agent.post(`${DD}/start`).send({ betCoins: 1000, mode: "fou" });
  assert.equal(start.status, 201);
  assert.equal((await agent.get("/api/wallet")).body.balanceCents, 0);

  const joue = await agent.post(`${DD}/play`).send({ roundId: start.body.round.id, step: 0 });
  assert.equal(joue.body.slot, 16);
  assert.equal(joue.body.multiplier, 604.39);
  assert.equal(joue.body.round.multiplier, 604.39);
  // Sans plafond : 100 000 × 604,39 = 60 439 000 centimes.
  assert.equal(joue.body.round.payoutCents, MAX_PAYOUT_CENTS);
  assert.equal(MAX_BET_CENTS * 604.39 > MAX_PAYOUT_CENTS, true);
  // Le montant CRÉDITÉ est le montant plafonné, pas le gain théorique.
  assert.equal((await agent.get("/api/wallet")).body.balanceCents, MAX_PAYOUT_CENTS);
});

test("le jeu apparaît dans le catalogue avec son genre", async () => {
  const app = makeApp();
  const liste = await request(app).get("/api/games");
  const jeu = liste.body.games.find((g: { id: string }) => g.id === "diamond-drop");
  assert.ok(jeu, "Diamond Drop absent du catalogue");
  assert.equal(jeu.kind, "drop");
  assert.equal(jeu.canCashout, false);
  assert.equal(jeu.name, "Diamond Drop");
  assert.equal(jeu.tagline, "Lâche le diamant, laisse les clous décider.");
});
