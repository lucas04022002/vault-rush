import { test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import type { Express } from "express";
import { makeApp, ctxOf, signUp } from "./helper.ts";

function setBalance(app: Express, userId: number, cents: number) {
  ctxOf(app).db.prepare("UPDATE users SET balance_cents = ? WHERE id = ?").run(cents, userId);
}

test("le solde est lu depuis la session", async () => {
  const app = makeApp();
  const { agent } = await signUp(app);
  const res = await agent.get("/api/wallet");
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { balanceCents: 100000 });
  assert.equal((await request(app).get("/api/wallet")).status, 401);
});

test("sous 10 coins, la recharge donne 1 000 coins", async () => {
  const app = makeApp();
  const { agent, userId } = await signUp(app);
  setBalance(app, userId, 420);

  const res = await agent.post("/api/wallet/refill").send({});
  assert.equal(res.status, 200);
  assert.equal(res.body.refilledCents, 100000);
  assert.equal(res.body.balanceCents, 100420);

  const journal = ctxOf(app).db.prepare("SELECT * FROM transactions ORDER BY id").all() as any[];
  assert.equal(journal.length, 1);
  assert.equal(journal[0].type, "refill");
  assert.equal(journal[0].amount_cents, 100000);
  assert.equal(journal[0].balance_after_cents, 100420);
});

test("à 500 coins, la recharge est refusée", async () => {
  const app = makeApp();
  const { agent, userId } = await signUp(app);
  setBalance(app, userId, 50000);

  const res = await agent.post("/api/wallet/refill").send({});
  assert.equal(res.status, 409);
  assert.equal(res.body.error, "balance_too_high");
  assert.equal((await agent.get("/api/wallet")).body.balanceCents, 50000);
});

test("deux recharges en 24 h : la seconde est refusée", async () => {
  const app = makeApp();
  const { agent, userId } = await signUp(app);
  setBalance(app, userId, 100);
  assert.equal((await agent.post("/api/wallet/refill").send({})).status, 200);

  setBalance(app, userId, 100);
  const res = await agent.post("/api/wallet/refill").send({});
  assert.equal(res.status, 409);
  assert.equal(res.body.error, "refill_cooldown");
  assert.equal((await agent.get("/api/wallet")).body.balanceCents, 100);
});

test("une recharge datée d'hier est à nouveau possible", async () => {
  const app = makeApp();
  const { agent, userId } = await signUp(app);
  setBalance(app, userId, 100);
  await agent.post("/api/wallet/refill").send({});

  ctxOf(app)
    .db.prepare(
      "UPDATE users SET balance_cents = 100, last_refill_at = datetime('now','-25 hours') WHERE id = ?",
    )
    .run(userId);

  const res = await agent.post("/api/wallet/refill").send({});
  assert.equal(res.status, 200);
  assert.equal(res.body.balanceCents, 100100);
});

test("la recharge exige une session", async () => {
  const app = makeApp();
  assert.equal((await request(app).post("/api/wallet/refill").send({})).status, 401);
});
