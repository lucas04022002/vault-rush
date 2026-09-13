import { test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { makeApp, ctxOf, signUp } from "./helper.ts";
import { MODES_VAULT_CODE, indices, createVaultCodeEngine } from "../src/engine/vault-code.ts";
import type { VaultCodeState } from "../src/engine/vault-code.ts";
import { EngineError, type Rng } from "../src/engine/types.ts";

/**
 * Vault Code : le moteur, la fuite, et les refus.
 *
 * Le code du coffre est tiré au démarrage et gardé en base : la règle qui
 * compte est qu'il ne sorte JAMAIS d'une réponse HTTP tant que la partie est
 * en cours. Le reste (indices, gains, essais épuisés) se vérifie sur le moteur
 * lui-même, sans base ni HTTP.
 */

const VC = "/api/games/vault-code";

/** Un `Rng` qui rend les valeurs demandées, puis 0 : le tirage devient prévisible. */
function scriptedRng(...valeurs: number[]): Rng {
  let i = 0;
  return { int: (max: number) => (i < valeurs.length ? valeurs[i++] % max : 0) };
}

/* ------------------------------ Les indices ------------------------------ */

test("les indices comptent verrous et échos", () => {
  assert.deepEqual(indices([0, 1, 2, 3], [0, 1, 2, 3]), { verrous: 4, echos: 0 });
  assert.deepEqual(indices([3, 2, 1, 0], [0, 1, 2, 3]), { verrous: 0, echos: 4 });
  assert.deepEqual(indices([0, 1, 4, 5], [0, 1, 2, 3]), { verrous: 2, echos: 0 });
  assert.deepEqual(indices([0, 2, 1, 9], [0, 1, 2, 3]), { verrous: 1, echos: 2 });
  assert.deepEqual(indices([4, 5, 6, 7], [0, 1, 2, 3]), { verrous: 0, echos: 0 });
});

/* ------------------------------- Le moteur ------------------------------- */

test("le code tiré a quatre chiffres tous différents", () => {
  const engine = createVaultCodeEngine();
  for (let graine = 0; graine < 40; graine++) {
    const state = engine.start("confort", scriptedRng(graine, graine + 3, graine + 7, graine + 1));
    assert.equal(state.code.length, 4);
    assert.equal(new Set(state.code).size, 4, JSON.stringify(state.code));
    for (const chiffre of state.code) {
      assert.ok(Number.isInteger(chiffre) && chiffre >= 0 && chiffre <= 9, String(chiffre));
    }
  }
});

test("trouver le code au premier essai paie le plus gros multiplicateur", () => {
  const engine = createVaultCodeEngine();
  const state: VaultCodeState = { mode: "sec", code: [1, 2, 3, 4], attempts: [] };
  const res = engine.act(state, { guess: [1, 2, 3, 4] }, scriptedRng());
  assert.equal(res.status, "cashed_out");
  assert.equal(res.multiplier, 29.04);
  assert.equal(res.step, 1);
  assert.deepEqual(res.reveal, { verrous: 4, echos: 0, trouve: true, code: [1, 2, 3, 4] });
});

test("le multiplicateur décroît avec le nombre d'essais, et la table est celle du calibrage", () => {
  const engine = createVaultCodeEngine();
  for (const mode of MODES_VAULT_CODE) {
    let state: VaultCodeState = { mode: mode.id, code: [1, 2, 3, 4], attempts: [] };
    for (let essai = 1; essai <= mode.essais; essai++) {
      const restant: VaultCodeState = { ...state, attempts: [...state.attempts] };
      const gagnant = engine.act(restant, { guess: [1, 2, 3, 4] }, scriptedRng());
      assert.equal(gagnant.status, "cashed_out", `${mode.id} essai ${essai}`);
      assert.equal(gagnant.multiplier, mode.gains[essai - 1], `${mode.id} essai ${essai}`);

      // …et on avance d'un essai raté pour le tour suivant.
      const rate = engine.act(state, { guess: [5, 6, 7, 8] }, scriptedRng());
      state = rate.state;
    }
    assert.ok(mode.gains.every((g, i) => i === 0 || g < mode.gains[i - 1]), mode.id);
  }
});

test("épuiser les essais perd la partie et révèle le code", () => {
  const engine = createVaultCodeEngine();
  let state: VaultCodeState = { mode: "sec", code: [1, 2, 3, 4], attempts: [] };
  for (let essai = 1; essai <= 5; essai++) {
    const res = engine.act(state, { guess: [5, 6, 7, 8] }, scriptedRng());
    state = res.state;
    if (essai < 5) {
      assert.equal(res.status, "playing", `essai ${essai}`);
      assert.equal(res.multiplier, 0);
      assert.equal((engine.view(state) as { code: unknown }).code, null);
    } else {
      assert.equal(res.status, "lost");
      assert.equal(res.multiplier, 0);
      assert.deepEqual((engine.view(state) as { code: unknown }).code, [1, 2, 3, 4]);
    }
  }
});

test("un essai de trop est un refus du moteur, pas un corps invalide", () => {
  const engine = createVaultCodeEngine();
  let state: VaultCodeState = { mode: "sec", code: [1, 2, 3, 4], attempts: [] };
  for (let essai = 0; essai < 5; essai++) {
    state = engine.act(state, { guess: [5, 6, 7, 8] }, scriptedRng()).state;
  }
  assert.throws(
    () => engine.act(state, { guess: [0, 1, 2, 3] }, scriptedRng()),
    (err: unknown) => err instanceof EngineError && err.status === 409 && err.code === "no_tries_left",
  );
});

test("un mode inconnu est refusé par le moteur", () => {
  const engine = createVaultCodeEngine();
  assert.throws(
    () => engine.start("impossible", scriptedRng()),
    (err: unknown) => err instanceof EngineError && err.code === "unknown_mode",
  );
});

test("le moteur n'a pas d'encaissement", () => {
  const engine = createVaultCodeEngine();
  assert.equal(engine.canCashout, false);
  assert.equal(engine.cashout, undefined);
  assert.equal(engine.nextMultiplier, undefined);
});

/* ------------------------------ La config ------------------------------ */

test("la config porte tout ce qu'il faut avant de miser", async () => {
  const res = await request(makeApp()).get(`${VC}/config`);
  assert.equal(res.status, 200);
  const jeu = res.body.game;
  assert.equal(jeu.id, "vault-code");
  assert.equal(jeu.kind, "code");
  assert.equal(jeu.canCashout, false);
  assert.equal(jeu.digits, 4);
  assert.equal(jeu.steps, 7);
  assert.equal(jeu.minBetCents, 100);
  assert.equal(jeu.maxBetCents, 100_000);
  assert.equal(jeu.maxPayoutCents, 1_000_000);
  assert.deepEqual(
    jeu.modes.map((m: { id: string; essais: number }) => [m.id, m.essais]),
    [
      ["confort", 7],
      ["tendu", 6],
      ["sec", 5],
    ],
  );
  assert.deepEqual(jeu.modes[2].multipliers, [29.04, 13.07, 5.88, 2.65, 1.19]);
});

test("le jeu apparaît dans le catalogue", async () => {
  const res = await request(makeApp()).get("/api/games");
  const ids = res.body.games.map((jeu: { id: string }) => jeu.id);
  assert.ok(ids.includes("vault-code"), ids.join(", "));
});

/* ------------------------------- La fuite ------------------------------- */

test("le code ne sort d'aucune réponse tant que la partie est en cours", async () => {
  const app = makeApp(); // vrai hasard : rien ne doit fuir
  const { agent } = await signUp(app);

  const start = await agent.post(`${VC}/start`).send({ betCoins: 10, mode: "confort" });
  assert.equal(start.status, 201);

  // Le code réel, lu en base : c'est LUI qui ne doit apparaître nulle part.
  const ligne = ctxOf(app)
    .db.prepare("SELECT state_json AS s FROM rounds WHERE id = ?")
    .get(start.body.round.id) as { s: string };
  const code = (JSON.parse(ligne.s) as VaultCodeState).code;
  const empreinte = JSON.stringify(code);
  assert.equal(code.length, 4);

  const interdit = (corps: unknown, ou: string) => {
    const texte = JSON.stringify(corps);
    assert.ok(!texte.includes(empreinte), `${ou} : le code ${empreinte} a fuité — ${texte}`);
    assert.ok(!texte.includes('"code":['), `${ou} : un code non nul est sorti — ${texte}`);
    assert.ok(!texte.includes("state_json"), texte);
  };

  interdit(start.body, "start");
  assert.deepEqual(start.body.round.view.attempts, []);
  assert.equal(start.body.round.view.essaisRestants, 7);
  assert.equal(start.body.round.view.code, null);

  interdit((await agent.get(`${VC}/current`)).body, "current");

  // Trois essais volontairement faux : la partie reste en cours, le code reste secret.
  const faux = [
    [0, 1, 2, 3],
    [4, 5, 6, 7],
    [8, 9, 0, 1],
  ].filter((g) => JSON.stringify(g) !== empreinte);

  for (let i = 0; i < faux.length; i++) {
    const joue = await agent
      .post(`${VC}/play`)
      .send({ roundId: start.body.round.id, step: i, guess: faux[i] });
    assert.equal(joue.status, 200, joue.text);
    assert.equal(joue.body.round.status, "playing");
    interdit(joue.body, `play ${i + 1}`);
    assert.equal(joue.body.round.view.attempts.length, i + 1);
    assert.equal(joue.body.round.view.essaisRestants, 7 - (i + 1));
  }

  interdit((await agent.get(`${VC}/current`)).body, "current après 3 essais");
});

test("le code est révélé une fois la partie perdue", async () => {
  const app = makeApp();
  const { agent } = await signUp(app);
  const start = await agent.post(`${VC}/start`).send({ betCoins: 10, mode: "sec" });
  const roundId = start.body.round.id;
  const code = (
    JSON.parse(
      (ctxOf(app).db.prepare("SELECT state_json AS s FROM rounds WHERE id = ?").get(roundId) as {
        s: string;
      }).s,
    ) as VaultCodeState
  ).code;

  // Cinq essais qui ne peuvent pas être le code : on force la défaite.
  const faux = essaisPerdants(code, 5);
  let dernier: request.Response | null = null;
  for (let i = 0; i < 5; i++) {
    dernier = await agent.post(`${VC}/play`).send({ roundId, step: i, guess: faux[i] });
    assert.equal(dernier.status, 200, dernier.text);
  }
  assert.equal(dernier?.body.round.status, "lost");
  assert.equal(dernier?.body.round.payoutCents, 0);
  assert.deepEqual(dernier?.body.round.view.code, code);
  assert.deepEqual(dernier?.body.code, code);
  assert.equal(dernier?.body.trouve, false);

  // Le solde n'a été débité que de la mise.
  assert.equal((await agent.get("/api/wallet")).body.balanceCents, 99_000);
});

test("trouver le code crédite le gain", async () => {
  const app = makeApp();
  const { agent } = await signUp(app);
  const start = await agent.post(`${VC}/start`).send({ betCoins: 10, mode: "tendu" });
  const roundId = start.body.round.id;
  const code = (
    JSON.parse(
      (ctxOf(app).db.prepare("SELECT state_json AS s FROM rounds WHERE id = ?").get(roundId) as {
        s: string;
      }).s,
    ) as VaultCodeState
  ).code;

  const joue = await agent.post(`${VC}/play`).send({ roundId, step: 0, guess: code });
  assert.equal(joue.status, 200, joue.text);
  assert.equal(joue.body.round.status, "cashed_out");
  assert.equal(joue.body.trouve, true);
  assert.equal(joue.body.round.multiplier, 11.31);
  assert.equal(joue.body.round.payoutCents, 11_310);
  assert.deepEqual(joue.body.round.view.code, code);
  assert.equal((await agent.get("/api/wallet")).body.balanceCents, 99_000 + 11_310);
});

/* ------------------------------- Les refus ------------------------------- */

test("un essai mal formé est un 400 invalid_body, et ne consomme rien", async () => {
  const app = makeApp();
  const { agent } = await signUp(app);
  const start = await agent.post(`${VC}/start`).send({ betCoins: 10, mode: "confort" });
  const roundId = start.body.round.id;

  const corps = [
    { roundId, step: 0 },
    { roundId, step: 0, guess: [1, 2, 3] },
    { roundId, step: 0, guess: [1, 2, 3, 4, 5] },
    { roundId, step: 0, guess: [1, 1, 2, 3] },
    { roundId, step: 0, guess: [1, 2, 3, 10] },
    { roundId, step: 0, guess: [-1, 2, 3, 4] },
    { roundId, step: 0, guess: ["1", "2", "3", "4"] },
    { roundId, step: 0, guess: "1234" },
  ];
  for (const body of corps) {
    const res = await agent.post(`${VC}/play`).send(body);
    assert.equal(res.status, 400, JSON.stringify(body));
    assert.equal(res.body.error, "invalid_body", JSON.stringify(body));
  }

  assert.deepEqual((await agent.get(`${VC}/current`)).body.round.view.attempts, []);
});

test("un essai en trop est un 409, pas un 400", async () => {
  const app = makeApp();
  const { agent } = await signUp(app);
  const start = await agent.post(`${VC}/start`).send({ betCoins: 10, mode: "sec" });
  const roundId = start.body.round.id;
  const code = (
    JSON.parse(
      (ctxOf(app).db.prepare("SELECT state_json AS s FROM rounds WHERE id = ?").get(roundId) as {
        s: string;
      }).s,
    ) as VaultCodeState
  ).code;

  const faux = essaisPerdants(code, 5);
  for (let i = 0; i < 5; i++) {
    await agent.post(`${VC}/play`).send({ roundId, step: i, guess: faux[i] });
  }
  // La partie est close : le service refuse avant même d'appeler le moteur.
  const res = await agent.post(`${VC}/play`).send({ roundId, step: 5, guess: [0, 1, 2, 3] });
  assert.equal(res.status, 409);
  assert.equal(res.body.error, "round_not_active");
});

test("l'encaissement est refusé : on trouve ou on perd", async () => {
  const app = makeApp();
  const { agent } = await signUp(app);
  const start = await agent.post(`${VC}/start`).send({ betCoins: 10, mode: "confort" });

  const res = await agent.post(`${VC}/cashout`).send({ roundId: start.body.round.id });
  assert.equal(res.status, 400);
  assert.equal(res.body.error, "cashout_not_allowed");
  assert.equal((await agent.get(`${VC}/current`)).body.round.status, "playing");
});

/* -------------------------------------------------------------------------- */

/**
 * `n` essais dont aucun ne peut être le code : on part de combinaisons fixes et
 * on en écarte celle qui tomberait juste.
 */
function essaisPerdants(code: number[], n: number): number[][] {
  const empreinte = JSON.stringify(code);
  const pool: number[][] = [];
  for (let a = 0; a < 10 && pool.length < n + 2; a++) {
    const essai = [a, (a + 1) % 10, (a + 2) % 10, (a + 3) % 10];
    if (JSON.stringify(essai) !== empreinte) pool.push(essai);
  }
  return pool.slice(0, n);
}
