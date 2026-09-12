import { test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import type { Express } from "express";
import { makeApp, ctxOf, signUp, firstSafe, firstDanger } from "./helper.ts";

const BASE = "/api/games/vault-rush";

function rows(app: Express, sql: string): any[] {
  return ctxOf(app).db.prepare(sql).all();
}

test("démarrer débite la mise et journalise dans la même transaction", async () => {
  const app = makeApp();
  const { agent, userId } = await signUp(app);

  const res = await agent.post(`${BASE}/start`).send({ betCoins: 10, mode: "safe" });
  assert.equal(res.status, 201);

  const round = res.body.round;
  assert.equal(round.betCents, 1000);
  assert.equal(round.step, 0);
  assert.equal(round.maxSteps, 6);
  assert.equal(round.mode, "safe");
  assert.equal(round.status, "playing");
  assert.equal(round.multiplier, 1);
  assert.equal(round.cashoutCents, 0);

  const solde = await agent.get("/api/wallet");
  assert.equal(solde.body.balanceCents, 99000);

  const journal = rows(app, "SELECT * FROM transactions ORDER BY id");
  assert.equal(journal.length, 1);
  assert.equal(journal[0].type, "bet");
  assert.equal(journal[0].amount_cents, 1000);
  assert.equal(journal[0].balance_after_cents, 99000);
  assert.equal(journal[0].round_id, round.id);
  assert.equal(journal[0].user_id, userId);
});

test("un second démarrage renvoie 409 avec la partie en cours", async () => {
  const app = makeApp();
  const { agent } = await signUp(app);

  const premier = await agent.post(`${BASE}/start`).send({ betCoins: 10, mode: "safe" });
  const second = await agent.post(`${BASE}/start`).send({ betCoins: 25, mode: "risk" });

  assert.equal(second.status, 409);
  assert.equal(second.body.error, "round_active");
  assert.equal(second.body.round.id, premier.body.round.id);
  assert.equal(second.body.round.betCents, 1000);

  // Rien n'a été débité une seconde fois.
  assert.equal((await agent.get("/api/wallet")).body.balanceCents, 99000);
  assert.equal(rows(app, "SELECT * FROM rounds").length, 1);
  assert.equal(rows(app, "SELECT * FROM transactions").length, 1);
});

test("current renvoie la partie en cours, puis null après la fin", async () => {
  const app = makeApp({ drawOptions: firstDanger });
  const { agent } = await signUp(app);

  assert.deepEqual((await agent.get(`${BASE}/current`)).body, { round: null });

  const start = await agent.post(`${BASE}/start`).send({ betCoins: 10, mode: "safe" });
  const current = await agent.get(`${BASE}/current`);
  assert.equal(current.status, 200);
  assert.equal(current.body.round.id, start.body.round.id);

  await agent.post(`${BASE}/play`).send({ roundId: start.body.round.id, step: 0, option: 0 });
  assert.deepEqual((await agent.get(`${BASE}/current`)).body, { round: null });
});

test("rejouer une étape déjà jouée renvoie 409 avec l'état courant (double clic sûr)", async () => {
  const app = makeApp({ drawOptions: firstSafe });
  const { agent } = await signUp(app);
  const { body } = await agent.post(`${BASE}/start`).send({ betCoins: 10, mode: "safe" });
  const roundId = body.round.id;

  const premier = await agent.post(`${BASE}/play`).send({ roundId, step: 0, option: 0 });
  assert.equal(premier.status, 200);
  assert.equal(premier.body.round.step, 1);
  assert.deepEqual(premier.body.revealed, ["safe", "safe", "danger"]);

  const rejeu = await agent.post(`${BASE}/play`).send({ roundId, step: 0, option: 0 });
  assert.equal(rejeu.status, 409);
  assert.equal(rejeu.body.error, "step_mismatch");
  assert.equal(rejeu.body.round.step, 1);

  // Le double clic n'a pas fait avancer la partie.
  assert.equal((await agent.get(`${BASE}/current`)).body.round.step, 1);
});

test("une mise de 0,001 est refusée et ne crée aucune ligne", async () => {
  const app = makeApp();
  const { agent } = await signUp(app);

  const res = await agent.post(`${BASE}/start`).send({ betCoins: "0.001", mode: "safe" });
  assert.equal(res.status, 400);

  assert.equal(rows(app, "SELECT * FROM rounds").length, 0);
  assert.equal(rows(app, "SELECT * FROM transactions").length, 0);
  assert.equal((await agent.get("/api/wallet")).body.balanceCents, 100000);
});

test("un solde insuffisant renvoie 409 sans rien écrire", async () => {
  const app = makeApp();
  const { agent, userId } = await signUp(app);
  ctxOf(app).db.prepare("UPDATE users SET balance_cents = 500 WHERE id = ?").run(userId);

  const res = await agent.post(`${BASE}/start`).send({ betCoins: 10, mode: "safe" });
  assert.equal(res.status, 409);
  assert.equal(res.body.error, "insufficient_balance");
  assert.equal(rows(app, "SELECT * FROM rounds").length, 0);
  assert.equal((await agent.get("/api/wallet")).body.balanceCents, 500);
});

test("une porte inexistante renvoie 400 sans toucher à la partie", async () => {
  const app = makeApp({ drawOptions: firstSafe });
  const { agent } = await signUp(app);
  const { body } = await agent.post(`${BASE}/start`).send({ betCoins: 10, mode: "safe" });

  const res = await agent
    .post(`${BASE}/play`)
    .send({ roundId: body.round.id, step: 0, option: 99 });
  assert.equal(res.status, 400);
  assert.equal(res.body.error, "invalid_option");
  assert.equal((await agent.get(`${BASE}/current`)).body.round.step, 0);
});

test("le dernier étage réussi encaisse automatiquement", async () => {
  const app = makeApp({ drawOptions: firstSafe });
  const { agent } = await signUp(app);
  const { body } = await agent.post(`${BASE}/start`).send({ betCoins: 10, mode: "safe" });
  const roundId = body.round.id;

  let last: any;
  for (let step = 0; step < 6; step++) {
    last = await agent.post(`${BASE}/play`).send({ roundId, step, option: 0 });
    assert.equal(last.status, 200, `étage ${step + 1}`);
  }

  const round = last.body.round;
  assert.equal(round.status, "cashed_out");
  assert.equal(round.step, 6);
  assert.equal(round.multiplier, 11.16);
  assert.equal(round.payoutCents, 11160); // 1 000 centimes × 11,16
  assert.equal(round.cashoutCents, 11160);

  assert.equal((await agent.get("/api/wallet")).body.balanceCents, 99000 + 11160);
  assert.deepEqual((await agent.get(`${BASE}/current`)).body, { round: null });

  const journal = rows(app, "SELECT * FROM transactions ORDER BY id");
  assert.deepEqual(
    journal.map((t) => [t.type, t.amount_cents, t.balance_after_cents]),
    [
      ["bet", 1000, 99000],
      ["win", 11160, 110160],
    ],
  );

  // Plus aucune porte : rejouer est refusé.
  const apres = await agent.post(`${BASE}/play`).send({ roundId, step: 6, option: 0 });
  assert.equal(apres.status, 409);
  assert.equal(apres.body.error, "round_not_active");
});

test("le gain est plafonné à 1 000 000 centimes", async () => {
  const app = makeApp({ drawOptions: firstSafe });
  const { agent } = await signUp(app);
  const { body } = await agent.post(`${BASE}/start`).send({ betCoins: 1000, mode: "safe" });
  const roundId = body.round.id;

  let last: any;
  for (let step = 0; step < 6; step++) {
    last = await agent.post(`${BASE}/play`).send({ roundId, step, option: 0 });
  }

  // 100 000 × 11,16 = 1 116 000 centimes, ramenés au plafond.
  assert.equal(last.body.round.payoutCents, 1_000_000);
  assert.equal((await agent.get("/api/wallet")).body.balanceCents, 1_000_000);
});

test("encaisser crédite le solde et journalise", async () => {
  const app = makeApp({ drawOptions: firstSafe });
  const { agent } = await signUp(app);
  const { body } = await agent.post(`${BASE}/start`).send({ betCoins: 10, mode: "safe" });
  const roundId = body.round.id;

  await agent.post(`${BASE}/play`).send({ roundId, step: 0, option: 0 });
  const res = await agent.post(`${BASE}/cashout`).send({ roundId });

  assert.equal(res.status, 200);
  assert.equal(res.body.round.status, "cashed_out");
  assert.equal(res.body.round.multiplier, 1.47);
  assert.equal(res.body.round.payoutCents, 1470);
  assert.equal(res.body.balanceCents, 99000 + 1470);

  const journal = rows(app, "SELECT * FROM transactions ORDER BY id");
  assert.equal(journal.length, 2);
  assert.equal(journal[1].type, "win");
  assert.equal(journal[1].amount_cents, 1470);
  assert.equal(journal[1].balance_after_cents, 100470);

  // Deuxième encaissement : refusé, et le solde ne bouge plus.
  const rejeu = await agent.post(`${BASE}/cashout`).send({ roundId });
  assert.equal(rejeu.status, 409);
  assert.equal((await agent.get("/api/wallet")).body.balanceCents, 100470);
});

test("encaisser avant le premier étage est refusé", async () => {
  const app = makeApp();
  const { agent } = await signUp(app);
  const { body } = await agent.post(`${BASE}/start`).send({ betCoins: 10, mode: "safe" });

  const res = await agent.post(`${BASE}/cashout`).send({ roundId: body.round.id });
  assert.equal(res.status, 409);
  assert.equal(res.body.error, "nothing_to_cashout");
});

test("perdre clôture la partie et libère la place pour la suivante", async () => {
  const app = makeApp({ drawOptions: firstDanger });
  const { agent } = await signUp(app);
  const { body } = await agent.post(`${BASE}/start`).send({ betCoins: 10, mode: "safe" });

  const perdu = await agent
    .post(`${BASE}/play`)
    .send({ roundId: body.round.id, step: 0, option: 0 });
  assert.equal(perdu.status, 200);
  assert.equal(perdu.body.round.status, "lost");
  assert.equal(perdu.body.round.payoutCents, 0);
  assert.equal(perdu.body.round.cashoutCents, 0);
  assert.deepEqual(perdu.body.revealed, ["danger", "safe", "safe"]);
  assert.equal((await agent.get("/api/wallet")).body.balanceCents, 99000);

  const suivante = await agent.post(`${BASE}/start`).send({ betCoins: 10, mode: "risk" });
  assert.equal(suivante.status, 201);
});

test("les routes de partie exigent une session", async () => {
  const app = makeApp();
  const start = await request(app).post(`${BASE}/start`).send({ betCoins: 10, mode: "safe" });
  assert.equal(start.status, 401);
  assert.equal((await request(app).get(`${BASE}/current`)).status, 401);
  const play = await request(app).post(`${BASE}/play`).send({ roundId: 1, step: 0, option: 0 });
  assert.equal(play.status, 401);
});

test("on ne peut pas jouer la partie d'un autre joueur", async () => {
  const app = makeApp({ drawOptions: firstSafe });
  const a = await signUp(app, "alice");
  const b = await signUp(app, "bob");
  const { body } = await a.agent.post(`${BASE}/start`).send({ betCoins: 10, mode: "safe" });

  const res = await b.agent
    .post(`${BASE}/play`)
    .send({ roundId: body.round.id, step: 0, option: 0 });
  assert.equal(res.status, 404);
  assert.equal(res.body.error, "round_not_found");
});

test("un jeu inconnu renvoie 404", async () => {
  const app = makeApp();
  const { agent } = await signUp(app);
  const res = await agent.post("/api/games/poker/start").send({ betCoins: 10, mode: "safe" });
  assert.equal(res.status, 404);
  assert.equal(res.body.error, "unknown_game");
});
