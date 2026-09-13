import { test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { makeApp, ctxOf, signUp, firstSafe, firstDanger } from "./helper.ts";

/**
 * Laser Grid joué de bout en bout par les routes génériques `/api/games/:game/…`,
 * et cohabitation des deux jeux (une partie active par jeu, pas par joueur).
 */

const LG = "/api/games/laser-grid";
const VR = "/api/games/vault-rush";

test("GET /api/games liste les jeux avec leurs modes", async () => {
  const app = makeApp();
  const res = await request(app).get("/api/games");

  assert.equal(res.status, 200);
  // Les quatre jeux d'échelle ouvrent le catalogue, dans cet ordre.
  assert.deepEqual(
    res.body.games.map((g: any) => g.id).slice(0, 4),
    ["vault-rush", "laser-grid", "getaway", "bomb-squad"],
  );

  const [vault, laser] = res.body.games;
  assert.equal(vault.name, "Vault Rush");
  assert.equal(vault.steps, 6);
  assert.equal(vault.labels.option, "porte");
  assert.deepEqual(
    vault.modes.map((m: any) => m.id),
    ["safe", "risk", "insane"],
  );

  assert.equal(laser.name, "Laser Grid");
  assert.equal(laser.steps, 8);
  assert.equal(laser.labels.cashout, "Sortir");
  assert.equal(laser.minBetCents, 100);
  assert.equal(laser.maxBetCents, 100_000);
  assert.equal(laser.maxPayoutCents, 1_000_000);
  assert.deepEqual(laser.modes[0].multipliers, [
    1.31, 1.74, 2.32, 3.1, 4.13, 5.51, 7.34, 9.79,
  ]);
});

test("GET /api/games/:game/config est public et décrit un seul jeu", async () => {
  const app = makeApp();
  const res = await request(app).get(`${LG}/config`);
  assert.equal(res.status, 200);
  assert.equal(res.body.game.id, "laser-grid");
  assert.equal(res.body.game.modes.length, 3);
  assert.equal(res.body.game.modes[2].chancePerStep, 0.4);
});

test("un jeu inconnu renvoie 404 unknown_game sur toutes les routes", async () => {
  const app = makeApp();
  const { agent } = await signUp(app);

  const config = await request(app).get("/api/games/poker/config");
  assert.equal(config.status, 404);
  assert.equal(config.body.error, "unknown_game");

  const appels = [
    () => agent.get("/api/games/poker/current"),
    () => agent.post("/api/games/poker/start").send({ betCoins: 10, mode: "calme" }),
    () => agent.post("/api/games/poker/play").send({ roundId: 1, step: 0, option: 0 }),
    () => agent.post("/api/games/poker/cashout").send({ roundId: 1 }),
  ];
  for (const appel of appels) {
    const res = await appel();
    assert.equal(res.status, 404);
    assert.equal(res.body.error, "unknown_game");
  }
});

test("une partie complète de Laser Grid (8 lignes) encaisse automatiquement", async () => {
  const app = makeApp({ drawOptions: firstSafe });
  const { agent } = await signUp(app);

  const start = await agent.post(`${LG}/start`).send({ betCoins: 10, mode: "calme" });
  assert.equal(start.status, 201);
  assert.equal(start.body.round.game, "laser-grid");
  assert.equal(start.body.round.mode, "calme");
  assert.equal(start.body.round.maxSteps, 8);
  assert.equal(start.body.round.betCents, 1000);
  assert.equal(start.body.round.multiplier, 1);
  assert.equal(start.body.round.nextMultiplier, 1.31);
  assert.equal(start.body.round.cashoutCents, 0);
  assert.equal(start.body.round.finishedAt, undefined);

  const roundId = start.body.round.id;
  let dernier: any;
  for (let step = 0; step < 8; step++) {
    dernier = await agent.post(`${LG}/play`).send({ roundId, step, option: 0 });
    assert.equal(dernier.status, 200, `ligne ${step + 1}`);
    assert.equal(dernier.body.outcome, "safe");
    // 4 cases, 3 passages : le tirage renvoyé est complet.
    assert.equal(dernier.body.revealed.length, 4);
    assert.equal(dernier.body.revealed.filter((o: string) => o === "safe").length, 3);
  }

  const round = dernier.body.round;
  assert.equal(round.status, "cashed_out");
  assert.equal(round.step, 8);
  assert.equal(round.multiplier, 9.79);
  assert.equal(round.nextMultiplier, null);
  assert.equal(round.payoutCents, 9790); // 1 000 centimes × 9,79
  assert.equal(round.cashoutCents, 9790);
  assert.ok(typeof round.finishedAt === "string");

  assert.equal((await agent.get("/api/wallet")).body.balanceCents, 100_000 - 1000 + 9790);
  assert.deepEqual((await agent.get(`${LG}/current`)).body, { round: null });
});

test("encaisser en cours de route paie le multiplicateur atteint", async () => {
  const app = makeApp({ drawOptions: firstSafe });
  const { agent } = await signUp(app);
  const { body } = await agent.post(`${LG}/start`).send({ betCoins: 20, mode: "mortel" });
  const roundId = body.round.id;

  const ligne1 = await agent.post(`${LG}/play`).send({ roundId, step: 0, option: 0 });
  assert.equal(ligne1.body.round.multiplier, 2.35);
  assert.equal(ligne1.body.round.nextMultiplier, 5.87);
  assert.equal(ligne1.body.round.cashoutCents, 4700);
  assert.equal(ligne1.body.revealed.length, 5);

  const encaisse = await agent.post(`${LG}/cashout`).send({ roundId });
  assert.equal(encaisse.status, 200);
  assert.equal(encaisse.body.round.status, "cashed_out");
  assert.equal(encaisse.body.round.payoutCents, 4700); // 2 000 × 2,35
  assert.equal(encaisse.body.balanceCents, 100_000 - 2000 + 4700);
});

test("toucher un laser clôture la partie", async () => {
  const app = makeApp({ drawOptions: firstDanger });
  const { agent } = await signUp(app);
  const { body } = await agent.post(`${LG}/start`).send({ betCoins: 10, mode: "tendu" });

  const perdu = await agent
    .post(`${LG}/play`)
    .send({ roundId: body.round.id, step: 0, option: 0 });
  assert.equal(perdu.status, 200);
  assert.equal(perdu.body.outcome, "danger");
  assert.deepEqual(perdu.body.revealed, ["danger", "danger", "safe", "safe"]);
  assert.equal(perdu.body.round.status, "lost");
  assert.equal(perdu.body.round.payoutCents, 0);
  assert.equal(perdu.body.round.cashoutCents, 0);
  assert.ok(typeof perdu.body.round.finishedAt === "string");
});

test("les deux jeux ont chacun leur partie active en même temps", async () => {
  const app = makeApp({ drawOptions: firstSafe });
  const { agent } = await signUp(app);

  const vault = await agent.post(`${VR}/start`).send({ betCoins: 10, mode: "safe" });
  const laser = await agent.post(`${LG}/start`).send({ betCoins: 5, mode: "tendu" });
  assert.equal(vault.status, 201);
  assert.equal(laser.status, 201);

  // Chaque jeu ne voit que sa partie.
  assert.equal((await agent.get(`${VR}/current`)).body.round.id, vault.body.round.id);
  assert.equal((await agent.get(`${LG}/current`)).body.round.id, laser.body.round.id);

  // Mais une seconde partie du même jeu reste refusée.
  const doublon = await agent.post(`${LG}/start`).send({ betCoins: 5, mode: "tendu" });
  assert.equal(doublon.status, 409);
  assert.equal(doublon.body.error, "round_active");
  assert.equal(doublon.body.round.id, laser.body.round.id);

  // Les deux mises ont bien été débitées.
  assert.equal((await agent.get("/api/wallet")).body.balanceCents, 100_000 - 1000 - 500);

  // On ne joue pas une partie de Vault Rush par la route de Laser Grid.
  const melange = await agent
    .post(`${LG}/play`)
    .send({ roundId: vault.body.round.id, step: 0, option: 0 });
  assert.equal(melange.status, 404);
  assert.equal(melange.body.error, "round_not_found");
});

test("un mode inconnu pour ce jeu est refusé sans rien écrire", async () => {
  const app = makeApp();
  const { agent } = await signUp(app);

  const res = await agent.post(`${LG}/start`).send({ betCoins: 10, mode: "safe" });
  assert.equal(res.status, 400);
  assert.equal(res.body.error, "unknown_mode");
  assert.deepEqual(res.body.modes, ["calme", "tendu", "mortel"]);

  assert.equal(ctxOf(app).db.prepare("SELECT * FROM rounds").all().length, 0);
  assert.equal((await agent.get("/api/wallet")).body.balanceCents, 100_000);
});

test("une case hors de la grille renvoie 400 sans toucher à la partie", async () => {
  const app = makeApp({ drawOptions: firstSafe });
  const { agent } = await signUp(app);
  const { body } = await agent.post(`${LG}/start`).send({ betCoins: 10, mode: "calme" });

  const res = await agent
    .post(`${LG}/play`)
    .send({ roundId: body.round.id, step: 0, option: 4 });
  assert.equal(res.status, 400);
  assert.equal(res.body.error, "invalid_option");
  assert.equal(res.body.options, 4);
  assert.equal((await agent.get(`${LG}/current`)).body.round.step, 0);
});

test("les routes de partie de Laser Grid exigent une session", async () => {
  const app = makeApp();
  assert.equal((await request(app).get(`${LG}/current`)).status, 401);
  assert.equal(
    (await request(app).post(`${LG}/start`).send({ betCoins: 10, mode: "calme" })).status,
    401,
  );
});

test("avec le VRAI hasard, une partie finit toujours dans un état cohérent", async () => {
  // Aucun tirage injecté : c'est le chemin de production (crypto.randomInt).
  const app = makeApp();
  const { agent } = await signUp(app);
  let solde = 100_000;

  for (let partie = 0; partie < 20; partie++) {
    const start = await agent.post(`${LG}/start`).send({ betCoins: 10, mode: "tendu" });
    assert.equal(start.status, 201);
    solde -= 1000;

    const roundId = start.body.round.id;
    let round = start.body.round;
    while (round.status === "playing" && round.step < round.maxSteps) {
      const coup = await agent.post(`${LG}/play`).send({ roundId, step: round.step, option: 0 });
      assert.equal(coup.status, 200);
      // Le tirage reste honnête : 4 cases, 2 passages, à chaque coup.
      assert.equal(coup.body.revealed.length, 4);
      assert.equal(coup.body.revealed.filter((o: string) => o === "safe").length, 2);
      assert.ok(coup.body.outcome === "safe" || coup.body.outcome === "danger");
      assert.equal(coup.body.round.step, round.step + (coup.body.outcome === "safe" ? 1 : 0));
      round = coup.body.round;
    }

    assert.ok(["lost", "cashed_out"].includes(round.status), `statut ${round.status}`);
    assert.equal(round.nextMultiplier, null);
    assert.equal(round.payoutCents, round.status === "lost" ? 0 : round.cashoutCents);
    solde += round.payoutCents;

    assert.equal((await agent.get("/api/wallet")).body.balanceCents, solde);
    assert.deepEqual((await agent.get(`${LG}/current`)).body, { round: null });
  }
});
