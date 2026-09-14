import { test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { makeApp, signUp, firstSafe, firstDanger } from "./helper.ts";

/**
 * Getaway et Bomb Squad joués de bout en bout par les MÊMES routes génériques
 * `/api/games/:game/…` : ajouter un jeu ne doit rien demander au serveur qu'un
 * jeu de paramètres. Ce fichier le prouve — routes, historique, classement.
 */

const GW = "/api/games/getaway";
const BS = "/api/games/bomb-squad";

test("GET /api/games/getaway/config décrit le jeu de la cavale", async () => {
  const app = makeApp();
  const res = await request(app).get(`${GW}/config`);

  assert.equal(res.status, 200);
  const jeu = res.body.game;
  assert.equal(jeu.id, "getaway");
  assert.equal(jeu.name, "Getaway");
  assert.equal(jeu.steps, 5);
  assert.equal(jeu.labels.step, "tronçon");
  assert.equal(jeu.labels.option, "route");
  assert.equal(jeu.labels.safe, "voie libre");
  assert.equal(jeu.labels.danger, "barrage");
  assert.equal(jeu.labels.cashout, "Se planquer");
  assert.deepEqual(
    jeu.modes.map((m: any) => m.id),
    ["tranquille", "nerveux", "cavale"],
  );
  assert.deepEqual(jeu.modes[0].multipliers, [1.31, 1.74, 2.32, 3.1, 4.13]);
  assert.deepEqual(jeu.modes[1].multipliers, [1.44, 2.16, 3.24, 4.86, 7.29]);
  assert.deepEqual(jeu.modes[2].multipliers, [1.88, 3.76, 7.52, 15.04, 30.08]);
  assert.equal(jeu.modes[1].chancePerStep, 2 / 3);
});

test("GET /api/games/bomb-squad/config décrit le jeu du boîtier", async () => {
  const app = makeApp();
  const res = await request(app).get(`${BS}/config`);

  assert.equal(res.status, 200);
  const jeu = res.body.game;
  assert.equal(jeu.id, "bomb-squad");
  assert.equal(jeu.name, "Bomb Squad");
  assert.equal(jeu.steps, 4);
  assert.equal(jeu.labels.step, "étape");
  assert.equal(jeu.labels.option, "câble");
  assert.equal(jeu.labels.safe, "neutralisé");
  assert.equal(jeu.labels.danger, "explosion");
  assert.equal(jeu.labels.cashout, "Se retirer");
  assert.deepEqual(
    jeu.modes.map((m: any) => m.id),
    ["novice", "confirme", "demineur"],
  );
  assert.deepEqual(jeu.modes[0].multipliers, [1.31, 1.74, 2.32, 3.1]);
  assert.deepEqual(jeu.modes[1].multipliers, [1.92, 3.84, 7.68, 15.36]);
  assert.deepEqual(jeu.modes[2].multipliers, [2.35, 5.87, 14.69, 36.72]);
  assert.equal(jeu.modes[2].chancePerStep, 0.4);
});

test("une partie complète de Getaway (5 tronçons) encaisse automatiquement", async () => {
  const app = makeApp({ drawOptions: firstSafe });
  const { agent } = await signUp(app);

  const start = await agent.post(`${GW}/start`).send({ betCoins: 10, mode: "cavale" });
  assert.equal(start.status, 201);
  assert.equal(start.body.round.game, "getaway");
  assert.equal(start.body.round.mode, "cavale");
  assert.equal(start.body.round.maxSteps, 5);
  assert.equal(start.body.round.multiplier, 1);
  assert.equal(start.body.round.nextMultiplier, 1.88);

  const roundId = start.body.round.id;
  let dernier: any;
  for (let step = 0; step < 5; step++) {
    dernier = await agent.post(`${GW}/play`).send({ roundId, step, option: 0 });
    assert.equal(dernier.status, 200, `tronçon ${step + 1}`);
    assert.equal(dernier.body.outcome, "safe");
    // 4 routes, 2 voies libres : le tirage renvoyé est complet et honnête.
    assert.equal(dernier.body.revealed.length, 4);
    assert.equal(dernier.body.revealed.filter((o: string) => o === "safe").length, 2);
  }

  const round = dernier.body.round;
  assert.equal(round.status, "cashed_out");
  assert.equal(round.step, 5);
  assert.equal(round.multiplier, 30.08);
  assert.equal(round.nextMultiplier, null);
  assert.equal(round.payoutCents, 30_080); // 1 000 centimes × 30,08
  assert.equal((await agent.get("/api/wallet")).body.balanceCents, 100_000 - 1000 + 30_080);
  assert.deepEqual((await agent.get(`${GW}/current`)).body, { round: null });
});

test("un barrage clôture la partie de Getaway", async () => {
  const app = makeApp({ drawOptions: firstDanger });
  const { agent } = await signUp(app);
  const { body } = await agent.post(`${GW}/start`).send({ betCoins: 10, mode: "nerveux" });

  const perdu = await agent
    .post(`${GW}/play`)
    .send({ roundId: body.round.id, step: 0, option: 0 });
  assert.equal(perdu.status, 200);
  assert.equal(perdu.body.outcome, "danger");
  assert.deepEqual(perdu.body.revealed, ["danger", "safe", "safe"]);
  assert.equal(perdu.body.round.status, "lost");
  assert.equal(perdu.body.round.payoutCents, 0);
  assert.ok(typeof perdu.body.round.finishedAt === "string");
});

test("une partie complète de Bomb Squad (4 étapes) encaisse automatiquement", async () => {
  const app = makeApp({ drawOptions: firstSafe });
  const { agent } = await signUp(app);

  const start = await agent.post(`${BS}/start`).send({ betCoins: 20, mode: "demineur" });
  assert.equal(start.status, 201);
  assert.equal(start.body.round.game, "bomb-squad");
  assert.equal(start.body.round.maxSteps, 4);
  assert.equal(start.body.round.nextMultiplier, 2.35);

  const roundId = start.body.round.id;
  let dernier: any;
  for (let step = 0; step < 4; step++) {
    dernier = await agent.post(`${BS}/play`).send({ roundId, step, option: 0 });
    assert.equal(dernier.status, 200, `étape ${step + 1}`);
    assert.equal(dernier.body.outcome, "safe");
    assert.equal(dernier.body.revealed.length, 5);
    assert.equal(dernier.body.revealed.filter((o: string) => o === "safe").length, 2);
  }

  const round = dernier.body.round;
  assert.equal(round.status, "cashed_out");
  assert.equal(round.step, 4);
  assert.equal(round.multiplier, 36.72);
  assert.equal(round.payoutCents, 73_440); // 2 000 centimes × 36,72
  assert.equal((await agent.get("/api/wallet")).body.balanceCents, 100_000 - 2000 + 73_440);
});

test("se retirer en cours de route paie le multiplicateur atteint", async () => {
  const app = makeApp({ drawOptions: firstSafe });
  const { agent } = await signUp(app);
  const { body } = await agent.post(`${BS}/start`).send({ betCoins: 10, mode: "confirme" });
  const roundId = body.round.id;

  const étape1 = await agent.post(`${BS}/play`).send({ roundId, step: 0, option: 0 });
  assert.equal(étape1.body.round.multiplier, 1.92);
  assert.equal(étape1.body.round.nextMultiplier, 3.84);
  assert.equal(étape1.body.round.cashoutCents, 1920);

  const retire = await agent.post(`${BS}/cashout`).send({ roundId });
  assert.equal(retire.status, 200);
  assert.equal(retire.body.round.status, "cashed_out");
  assert.equal(retire.body.round.payoutCents, 1920);
  assert.equal(retire.body.balanceCents, 100_000 - 1000 + 1920);
});

test("une explosion clôture la partie de Bomb Squad", async () => {
  const app = makeApp({ drawOptions: firstDanger });
  const { agent } = await signUp(app);
  const { body } = await agent.post(`${BS}/start`).send({ betCoins: 10, mode: "novice" });

  const perdu = await agent
    .post(`${BS}/play`)
    .send({ roundId: body.round.id, step: 0, option: 0 });
  assert.equal(perdu.body.outcome, "danger");
  assert.deepEqual(perdu.body.revealed, ["danger", "safe", "safe", "safe"]);
  assert.equal(perdu.body.round.status, "lost");
  assert.equal(perdu.body.round.cashoutCents, 0);
});

test("un mode d'un autre jeu est refusé sur ces deux jeux", async () => {
  const app = makeApp();
  const { agent } = await signUp(app);

  const gw = await agent.post(`${GW}/start`).send({ betCoins: 10, mode: "calme" });
  assert.equal(gw.status, 400);
  assert.equal(gw.body.error, "unknown_mode");
  assert.deepEqual(gw.body.modes, ["tranquille", "nerveux", "cavale"]);

  const bs = await agent.post(`${BS}/start`).send({ betCoins: 10, mode: "cavale" });
  assert.equal(bs.status, 400);
  assert.equal(bs.body.error, "unknown_mode");
  assert.deepEqual(bs.body.modes, ["novice", "confirme", "demineur"]);

  assert.equal((await agent.get("/api/wallet")).body.balanceCents, 100_000);
});

test("un câble hors du boîtier renvoie 400 sans toucher à la partie", async () => {
  const app = makeApp({ drawOptions: firstSafe });
  const { agent } = await signUp(app);
  const { body } = await agent.post(`${BS}/start`).send({ betCoins: 10, mode: "novice" });

  const res = await agent
    .post(`${BS}/play`)
    .send({ roundId: body.round.id, step: 0, option: 4 });
  assert.equal(res.status, 400);
  assert.equal(res.body.error, "invalid_option");
  assert.equal(res.body.options, 4);
  assert.equal((await agent.get(`${BS}/current`)).body.round.step, 0);
});

test("les quatre jeux ont chacun leur partie active en même temps", async () => {
  const app = makeApp({ drawOptions: firstSafe });
  const { agent } = await signUp(app);

  const parties = [
    ["/api/games/vault-rush", "safe"],
    ["/api/games/laser-grid", "tendu"],
    [GW, "tranquille"],
    [BS, "novice"],
  ] as const;

  const ids: number[] = [];
  for (const [base, mode] of parties) {
    const res = await agent.post(`${base}/start`).send({ betCoins: 5, mode });
    assert.equal(res.status, 201, base);
    ids.push(res.body.round.id);
  }
  assert.equal(new Set(ids).size, 4);

  for (const [i, [base]] of parties.entries()) {
    assert.equal((await agent.get(`${base}/current`)).body.round.id, ids[i], base);
  }
  assert.equal((await agent.get("/api/wallet")).body.balanceCents, 100_000 - 4 * 500);

  // Une partie de Getaway ne se joue pas par la route de Bomb Squad.
  const mélange = await agent.post(`${BS}/play`).send({ roundId: ids[2], step: 0, option: 0 });
  assert.equal(mélange.status, 404);
  assert.equal(mélange.body.error, "round_not_found");
});

test("l'historique et le classement filtrent sur les deux nouveaux jeux", async () => {
  const app = makeApp({ drawOptions: firstSafe });
  const { agent } = await signUp(app);

  // Une partie encaissée dans chaque nouveau jeu.
  const gw = await agent.post(`${GW}/start`).send({ betCoins: 10, mode: "tranquille" });
  await agent.post(`${GW}/play`).send({ roundId: gw.body.round.id, step: 0, option: 0 });
  await agent.post(`${GW}/cashout`).send({ roundId: gw.body.round.id });

  const bs = await agent.post(`${BS}/start`).send({ betCoins: 10, mode: "novice" });
  await agent.post(`${BS}/play`).send({ roundId: bs.body.round.id, step: 0, option: 0 });
  await agent.post(`${BS}/cashout`).send({ roundId: bs.body.round.id });

  const tout = await agent.get("/api/history");
  assert.equal(tout.body.rounds.length, 2);

  const cavale = await agent.get("/api/history?game=getaway");
  assert.equal(cavale.status, 200);
  assert.equal(cavale.body.rounds.length, 1);
  assert.equal(cavale.body.rounds[0].game, "getaway");
  assert.equal(cavale.body.rounds[0].netCents, 310); // 1 000 × 1,31 − 1 000

  const boitier = await agent.get("/api/history?game=bomb-squad");
  assert.equal(boitier.body.rounds.length, 1);
  assert.equal(boitier.body.rounds[0].game, "bomb-squad");

  // Le classement filtré ne compte que les parties du jeu demandé.
  const classement = await request(app).get("/api/leaderboard?game=bomb-squad");
  assert.equal(classement.status, 200);
  assert.deepEqual(
    classement.body.entries.map((e: any) => [e.username, e.netCents, e.rounds]),
    [["joueuse", 310, 1]],
  );
});

test("les routes de partie des deux jeux exigent une session", async () => {
  const app = makeApp();
  for (const base of [GW, BS]) {
    assert.equal((await request(app).get(`${base}/current`)).status, 401, base);
    assert.equal(
      (await request(app).post(`${base}/start`).send({ betCoins: 10, mode: "novice" })).status,
      401,
      base,
    );
  }
});

test("avec le VRAI hasard, Getaway finit toujours dans un état cohérent", async () => {
  const app = makeApp();
  const { agent } = await signUp(app);
  let solde = 100_000;

  for (let partie = 0; partie < 15; partie++) {
    const start = await agent.post(`${GW}/start`).send({ betCoins: 10, mode: "cavale" });
    assert.equal(start.status, 201);
    solde -= 1000;

    const roundId = start.body.round.id;
    let round = start.body.round;
    while (round.status === "playing" && round.step < round.maxSteps) {
      const coup = await agent.post(`${GW}/play`).send({ roundId, step: round.step, option: 0 });
      assert.equal(coup.status, 200);
      assert.equal(coup.body.revealed.length, 4);
      assert.equal(coup.body.revealed.filter((o: string) => o === "safe").length, 2);
      round = coup.body.round;
    }

    assert.ok(["lost", "cashed_out"].includes(round.status), `statut ${round.status}`);
    assert.equal(round.nextMultiplier, null);
    solde += round.payoutCents;
    assert.equal((await agent.get("/api/wallet")).body.balanceCents, solde);
  }
});
