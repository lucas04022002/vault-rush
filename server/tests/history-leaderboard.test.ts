import { test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import type { Express } from "express";
import { makeApp, ctxOf, signUp, firstSafe } from "./helper.ts";

/**
 * Historique du joueur et classement public : les deux lisent les parties
 * terminées, tous jeux confondus ou filtrées par jeu.
 */

type FausseManche = {
  userId: number;
  game: string;
  mode: string;
  betCents: number;
  payoutCents: number;
  status?: "lost" | "cashed_out" | "playing";
  step?: number;
  multiplier?: number;
  /** Expression SQLite, par défaut maintenant. */
  createdAt?: string;
};

/** Fabrique une manche directement en base (pour dater ou varier les joueurs). */
function insereManche(app: Express, m: FausseManche): void {
  ctxOf(app)
    .db.prepare(
      `INSERT INTO rounds (user_id, game, bet_cents, mode, step, multiplier, status, payout_cents, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ${m.createdAt ?? "datetime('now')"})`,
    )
    .run(
      m.userId,
      m.game,
      m.betCents,
      m.mode,
      m.step ?? 1,
      m.multiplier ?? 1,
      m.status ?? "cashed_out",
      m.payoutCents,
    );
}

// --- Historique ---------------------------------------------------------

test("l'historique mélange les jeux, du plus récent au plus ancien", async () => {
  const app = makeApp({ drawOptions: firstSafe });
  const { agent, userId } = await signUp(app);

  // Une vraie partie de Vault Rush menée jusqu'au bout (encaissement automatique).
  const vault = await agent.post("/api/games/vault-rush/start").send({ betCoins: 10, mode: "safe" });
  for (let step = 0; step < 6; step++) {
    await agent
      .post("/api/games/vault-rush/play")
      .send({ roundId: vault.body.round.id, step, option: 0 });
  }

  // Une vraie partie de Laser Grid encaissée après une ligne.
  const laser = await agent.post("/api/games/laser-grid/start").send({ betCoins: 10, mode: "calme" });
  await agent
    .post("/api/games/laser-grid/play")
    .send({ roundId: laser.body.round.id, step: 0, option: 0 });
  await agent.post("/api/games/laser-grid/cashout").send({ roundId: laser.body.round.id });

  // Une partie perdue, et une partie encore en cours (qui ne doit PAS apparaître).
  insereManche(app, {
    userId,
    game: "laser-grid",
    mode: "mortel",
    betCents: 5000,
    payoutCents: 0,
    status: "lost",
    step: 2,
    multiplier: 5.87,
  });
  await agent.post("/api/games/vault-rush/start").send({ betCoins: 10, mode: "risk" });

  const res = await agent.get("/api/history");
  assert.equal(res.status, 200);
  assert.equal(res.body.rounds.length, 3);

  const [perdue, laserFini, vaultFini] = res.body.rounds;
  assert.deepEqual(
    { game: perdue.game, status: perdue.status, netCents: perdue.netCents, step: perdue.step },
    { game: "laser-grid", status: "lost", netCents: -5000, step: 2 },
  );
  assert.equal(perdue.maxSteps, 8);
  assert.equal(perdue.mode, "mortel");
  assert.equal(perdue.betCents, 5000);
  assert.equal(perdue.multiplier, 5.87);
  assert.ok(typeof perdue.createdAt === "string");

  assert.equal(laserFini.game, "laser-grid");
  assert.equal(laserFini.status, "cashed_out");
  assert.equal(laserFini.netCents, 1310 - 1000);
  assert.equal(laserFini.maxSteps, 8);

  assert.equal(vaultFini.game, "vault-rush");
  assert.equal(vaultFini.netCents, 11160 - 1000);
  assert.equal(vaultFini.step, 6);
  assert.equal(vaultFini.maxSteps, 6);
});

test("l'historique se filtre par jeu et se limite en nombre", async () => {
  const app = makeApp();
  const { agent, userId } = await signUp(app);
  for (let i = 0; i < 4; i++) {
    insereManche(app, { userId, game: "vault-rush", mode: "safe", betCents: 100, payoutCents: 147 });
    insereManche(app, { userId, game: "laser-grid", mode: "calme", betCents: 100, payoutCents: 131 });
  }

  const laser = await agent.get("/api/history?game=laser-grid");
  assert.equal(laser.body.rounds.length, 4);
  assert.ok(laser.body.rounds.every((r: any) => r.game === "laser-grid"));

  const limite = await agent.get("/api/history?limit=3");
  assert.equal(limite.body.rounds.length, 3);

  // Plafond à 100 : une limite absurde ne fait pas exploser la requête.
  assert.equal((await agent.get("/api/history?limit=99999")).body.rounds.length, 8);

  const inconnu = await agent.get("/api/history?game=poker");
  assert.equal(inconnu.status, 404);
  assert.equal(inconnu.body.error, "unknown_game");
});

test("l'historique ne montre que ses propres parties et exige une session", async () => {
  const app = makeApp();
  const alice = await signUp(app, "alice");
  const bob = await signUp(app, "bob");
  insereManche(app, {
    userId: alice.userId,
    game: "vault-rush",
    mode: "safe",
    betCents: 100,
    payoutCents: 147,
  });

  assert.equal((await bob.agent.get("/api/history")).body.rounds.length, 0);
  assert.equal((await alice.agent.get("/api/history")).body.rounds.length, 1);
  assert.equal((await request(app).get("/api/history")).status, 401);
});

// --- Classement ---------------------------------------------------------

test("le classement trie par bénéfice net, pas par gain brut", async () => {
  const app = makeApp();
  const alice = await signUp(app, "alice");
  const bob = await signUp(app, "bob");
  const carole = await signUp(app, "carole");

  // Alice : un gros gain et une perte -> +48 000.
  insereManche(app, {
    userId: alice.userId,
    game: "vault-rush",
    mode: "insane",
    betCents: 1000,
    payoutCents: 50_000,
    step: 6,
  });
  insereManche(app, {
    userId: alice.userId,
    game: "vault-rush",
    mode: "insane",
    betCents: 1000,
    payoutCents: 0,
    status: "lost",
  });
  // Bob a beaucoup misé et beaucoup gagné en brut, mais perd sur le net.
  insereManche(app, {
    userId: bob.userId,
    game: "vault-rush",
    mode: "risk",
    betCents: 100_000,
    payoutCents: 60_000,
    step: 3,
  });
  // Carole : petit joueur bénéficiaire, sur l'autre jeu.
  insereManche(app, {
    userId: carole.userId,
    game: "laser-grid",
    mode: "calme",
    betCents: 1000,
    payoutCents: 2000,
  });

  const res = await request(app).get("/api/leaderboard");
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.entries, [
    { username: "alice", netCents: 48_000, rounds: 2, bestPayoutCents: 50_000 },
    { username: "carole", netCents: 1000, rounds: 1, bestPayoutCents: 2000 },
    { username: "bob", netCents: -40_000, rounds: 1, bestPayoutCents: 60_000 },
  ]);
});

test("le classement ignore les parties de plus de 30 jours et celles en cours", async () => {
  const app = makeApp();
  const alice = await signUp(app, "alice");
  const ancienne = await signUp(app, "ancienne");
  const encours = await signUp(app, "encours");

  insereManche(app, {
    userId: alice.userId,
    game: "vault-rush",
    mode: "safe",
    betCents: 1000,
    payoutCents: 2000,
  });
  // Un joueur dominant... il y a 40 jours : hors fenêtre.
  insereManche(app, {
    userId: ancienne.userId,
    game: "vault-rush",
    mode: "insane",
    betCents: 1000,
    payoutCents: 900_000,
    createdAt: "datetime('now', '-40 days')",
  });
  // Une partie encore en cours ne compte pas.
  insereManche(app, {
    userId: encours.userId,
    game: "vault-rush",
    mode: "safe",
    betCents: 1000,
    payoutCents: 0,
    status: "playing",
  });

  const { body } = await request(app).get("/api/leaderboard");
  assert.deepEqual(
    body.entries.map((e: any) => e.username),
    ["alice"],
  );

  // La même partie, datée d'hier, revient dans le classement.
  insereManche(app, {
    userId: ancienne.userId,
    game: "vault-rush",
    mode: "insane",
    betCents: 1000,
    payoutCents: 900_000,
    createdAt: "datetime('now', '-1 days')",
  });
  const apres = await request(app).get("/api/leaderboard");
  assert.deepEqual(
    apres.body.entries.map((e: any) => e.username),
    ["ancienne", "alice"],
  );
});

test("le classement se filtre par jeu et refuse un jeu inconnu", async () => {
  const app = makeApp();
  const alice = await signUp(app, "alice");
  const bob = await signUp(app, "bob");
  insereManche(app, {
    userId: alice.userId,
    game: "vault-rush",
    mode: "safe",
    betCents: 1000,
    payoutCents: 9000,
  });
  insereManche(app, {
    userId: bob.userId,
    game: "laser-grid",
    mode: "calme",
    betCents: 1000,
    payoutCents: 3000,
  });

  const laser = await request(app).get("/api/leaderboard?game=laser-grid");
  assert.deepEqual(
    laser.body.entries.map((e: any) => [e.username, e.netCents]),
    [["bob", 2000]],
  );

  const vault = await request(app).get("/api/leaderboard?game=vault-rush");
  assert.deepEqual(
    vault.body.entries.map((e: any) => [e.username, e.netCents]),
    [["alice", 8000]],
  );

  const inconnu = await request(app).get("/api/leaderboard?game=poker");
  assert.equal(inconnu.status, 404);
  assert.equal(inconnu.body.error, "unknown_game");
});

test("le classement s'arrête à dix joueurs", async () => {
  const app = makeApp();
  for (let i = 0; i < 12; i++) {
    const { userId } = await signUp(app, `joueur${i}`);
    insereManche(app, {
      userId,
      game: "vault-rush",
      mode: "safe",
      betCents: 1000,
      payoutCents: 1000 + i * 100,
    });
  }

  const { body } = await request(app).get("/api/leaderboard");
  assert.equal(body.entries.length, 10);
  assert.equal(body.entries[0].username, "joueur11");
  assert.equal(body.entries[0].netCents, 1100);

  const trois = await request(app).get("/api/leaderboard?limit=3");
  assert.equal(trois.body.entries.length, 3);
});
