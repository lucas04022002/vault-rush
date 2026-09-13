import { test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { z } from "zod";
import { makeApp, ctxOf, signUp, firstSafe } from "./helper.ts";
import { EngineError, type GameEngine, type GameId, type Rng } from "../src/engine/types.ts";
import { MAX_BET_CENTS, MAX_PAYOUT_CENTS, MIN_BET_CENTS } from "../src/money.ts";

/**
 * Le socle multi-moteurs : ce que le service garantit à TOUT jeu, pas seulement
 * au jeu d'échelle. Un moteur factice (enregistré uniquement ici) tient le rôle
 * des jeux à venir : pas d'encaissement, une action qui n'est pas « une option ».
 */

const VR = "/api/games/vault-rush";
const DEV = "/api/games/devinette";

type DevineState = { mode: string; secret: number; essais: number };
type DevineAction = { guess: number };

/** Moteur factice : trouver un nombre, sans encaissement possible. */
const devinette: GameEngine<DevineState, DevineAction> = {
  id: "devinette" as GameId,
  kind: "code",
  name: "Devinette",
  tagline: "Trouve le nombre.",
  canCashout: false,
  actionSchema: z.object({ guess: z.number().int().min(0).max(9) }),
  config: () => ({
    id: "devinette",
    kind: "code",
    name: "Devinette",
    tagline: "Trouve le nombre.",
    canCashout: false,
    steps: 3,
    format: "3 essais",
    maxPayoutCents: MAX_PAYOUT_CENTS,
    minBetCents: MIN_BET_CENTS,
    maxBetCents: MAX_BET_CENTS,
    modes: [{ id: "unique", label: "Unique" }],
  }),
  start: (modeId: string, _rng: Rng) => ({ mode: modeId, secret: 7, essais: 0 }),
  // Le secret NE SORT PAS : la vue ne montre que le nombre d'essais.
  view: (state: DevineState) => ({ essais: state.essais }),
  act: (state: DevineState, action: DevineAction) => {
    if (state.essais >= 3) throw new EngineError(409, "no_more_tries");
    const essais = state.essais + 1;
    const trouve = action.guess === state.secret;
    return {
      state: { ...state, essais },
      step: essais,
      multiplier: trouve ? 2 : 0,
      status: trouve ? "cashed_out" : essais >= 3 ? "lost" : "playing",
      reveal: { trouve },
    };
  },
};

function withDevinette() {
  return makeApp({ engines: { devinette } });
}

test("la config expose kind et canCashout", async () => {
  const app = makeApp();
  const res = await request(app).get(`${VR}/config`);
  assert.equal(res.status, 200);
  assert.equal(res.body.game.kind, "ladder");
  assert.equal(res.body.game.canCashout, true);

  // Chaque jeu du catalogue annonce un genre connu, et l'encaissement en cours
  // de partie n'appartient qu'au jeu d'échelle.
  const liste = await request(app).get("/api/games");
  assert.ok(liste.body.games.length >= 4);
  for (const jeu of liste.body.games) {
    assert.ok(["ladder", "code", "drop", "cards"].includes(jeu.kind), `${jeu.id}: ${jeu.kind}`);
    // Seul un jeu d'échelle laisse encaisser en cours de partie.
    assert.equal(jeu.canCashout, jeu.kind === "ladder", jeu.id);
  }
});

test("le catalogue sert les SEPT jeux, dans l'ordre, chacun avec son format", async () => {
  const app = makeApp();
  const { body } = await request(app).get("/api/games");

  assert.deepEqual(
    body.games.map((jeu: { id: string }) => jeu.id),
    [
      "vault-rush",
      "laser-grid",
      "getaway",
      "bomb-squad",
      "vault-code",
      "diamond-drop",
      "blackjack-express",
    ],
  );

  // Le format est écrit par le jeu et part tel quel : l'arcade ne devine
  // aucun pluriel (« 1 lâchers » venait de là).
  assert.deepEqual(
    body.games.map((jeu: { format: string }) => jeu.format),
    [
      "6 étages",
      "8 lignes",
      "5 tronçons",
      "4 étapes",
      "4 chiffres, 5 à 7 essais",
      "8 à 16 rangées",
      "contre le croupier",
    ],
  );

  // Et chaque jeu du catalogue en porte un non vide, quel que soit son genre.
  for (const jeu of body.games) {
    assert.equal(typeof jeu.format, "string", jeu.id);
    assert.ok(jeu.format.length > 0, jeu.id);
  }
});

test("l'historique et le classement acceptent les sept jeux", async () => {
  const app = makeApp();
  const { agent } = await signUp(app);
  const { body } = await request(app).get("/api/games");

  for (const jeu of body.games) {
    const histoire = await agent.get(`/api/history?game=${jeu.id}`);
    assert.equal(histoire.status, 200, `${jeu.id} historique`);
    const classement = await request(app).get(`/api/leaderboard?game=${jeu.id}`);
    assert.equal(classement.status, 200, `${jeu.id} classement`);
  }

  // Un jeu inconnu reste refusé : le filtre n'est pas devenu permissif.
  assert.equal((await agent.get("/api/history?game=poker")).status, 404);
});

test("le nombre d'étapes affiché est celui du MODE, pas du jeu", async () => {
  const app = makeApp();
  const { agent } = await signUp(app);

  // Vault Code : 7 essais en Confort, 5 en Sec. La config annonce le maximum…
  const config = await request(app).get("/api/games/vault-code/config");
  assert.equal(config.body.game.steps, 7);
  assert.deepEqual(
    config.body.game.modes.map((m: { id: string; steps: number }) => [m.id, m.steps]),
    [
      ["confort", 7],
      ["tendu", 6],
      ["sec", 5],
    ],
  );

  // … mais une partie en mode Sec dit « sur 5 », pas « sur 7 ».
  const sec = await agent
    .post("/api/games/vault-code/start")
    .send({ betCoins: 10, mode: "sec" });
  assert.equal(sec.body.round.maxSteps, 5);

  // Un jeu dont tous les modes ont la même longueur garde celle du jeu.
  const echelle = await agent
    .post("/api/games/vault-rush/start")
    .send({ betCoins: 10, mode: "safe" });
  assert.equal(echelle.body.round.maxSteps, 6);
});

test("une partie porte sa vue publique", async () => {
  const app = makeApp({ drawOptions: firstSafe });
  const { agent } = await signUp(app);
  const { body } = await agent.post(`${VR}/start`).send({ betCoins: 10, mode: "safe" });
  assert.deepEqual(body.round.view, { step: 0, multiplier: 1, revealed: null });

  const joue = await agent.post(`${VR}/play`).send({ roundId: body.round.id, step: 0, option: 0 });
  assert.equal(joue.body.round.view.step, 1);
  assert.deepEqual(joue.body.round.view.revealed, ["safe", "safe", "danger"]);
});

test("le secret ne sort jamais : rien des options non révélées", async () => {
  const app = makeApp(); // vrai hasard : rien ne doit fuir avant le coup
  const { agent } = await signUp(app);

  const start = await agent.post(`${VR}/start`).send({ betCoins: 10, mode: "safe" });
  const texte = JSON.stringify(start.body);
  assert.ok(!texte.includes("danger"), `les options ont fuité : ${texte}`);
  assert.ok(!texte.includes("state_json"), texte);
  assert.ok(!texte.includes("stateJson"), texte);

  const current = JSON.stringify((await agent.get(`${VR}/current`)).body);
  assert.ok(!current.includes("danger"), `les options ont fuité : ${current}`);
});

test("le secret d'un moteur quelconque ne sort jamais", async () => {
  const app = withDevinette();
  const { agent } = await signUp(app);

  const start = await agent.post(`${DEV}/start`).send({ betCoins: 10, mode: "unique" });
  assert.equal(start.status, 201);
  assert.deepEqual(start.body.round.view, { essais: 0 });
  assert.ok(!JSON.stringify(start.body).includes("secret"), JSON.stringify(start.body));

  const joue = await agent
    .post(`${DEV}/play`)
    .send({ roundId: start.body.round.id, step: 0, guess: 3 });
  assert.equal(joue.status, 200);
  assert.equal(joue.body.trouve, false);
  assert.deepEqual(joue.body.round.view, { essais: 1 });
  assert.ok(!JSON.stringify(joue.body).includes("secret"), JSON.stringify(joue.body));
});

test("un moteur sans encaissement répond 400 cashout_not_allowed", async () => {
  const app = withDevinette();
  const { agent } = await signUp(app);
  const start = await agent.post(`${DEV}/start`).send({ betCoins: 10, mode: "unique" });

  const res = await agent.post(`${DEV}/cashout`).send({ roundId: start.body.round.id });
  assert.equal(res.status, 400);
  assert.equal(res.body.error, "cashout_not_allowed");

  // La partie n'a pas bougé et le solde non plus.
  assert.equal((await agent.get(`${DEV}/current`)).body.round.status, "playing");
  assert.equal((await agent.get("/api/wallet")).body.balanceCents, 99_000);
});

test("une action qui ne respecte pas le schéma du moteur renvoie 400 invalid_body", async () => {
  const app = withDevinette();
  const { agent } = await signUp(app);
  const start = await agent.post(`${DEV}/start`).send({ betCoins: 10, mode: "unique" });
  const roundId = start.body.round.id;

  const sansChamp = await agent.post(`${DEV}/play`).send({ roundId, step: 0 });
  assert.equal(sansChamp.status, 400);
  assert.equal(sansChamp.body.error, "invalid_body");

  const horsBornes = await agent.post(`${DEV}/play`).send({ roundId, step: 0, guess: 42 });
  assert.equal(horsBornes.status, 400);
  assert.equal(horsBornes.body.error, "invalid_body");

  // Rien n'a été joué.
  assert.deepEqual((await agent.get(`${DEV}/current`)).body.round.view, { essais: 0 });
});

test("un refus du moteur devient une réponse HTTP", async () => {
  const app = withDevinette();
  const { agent } = await signUp(app);
  const start = await agent.post(`${DEV}/start`).send({ betCoins: 10, mode: "unique" });
  const roundId = start.body.round.id;

  for (let step = 0; step < 3; step++) {
    const res = await agent.post(`${DEV}/play`).send({ roundId, step, guess: 1 });
    assert.equal(res.status, 200, `essai ${step + 1}`);
  }
  assert.equal((await agent.get(`${DEV}/current`)).body.round, null);
});

test("une partie héritée sans state_json reste jouable", async () => {
  const app = makeApp({ drawOptions: firstSafe });
  const { agent, userId } = await signUp(app);
  const db = ctxOf(app).db;

  // Une partie ouverte avant la migration 0003 : state_json vaut NULL.
  db.prepare(
    `INSERT INTO rounds (user_id, game, bet_cents, mode, step, multiplier, status, payout_cents)
     VALUES (?, 'vault-rush', 1000, 'safe', 2, 2.21, 'playing', 0)`,
  ).run(userId);
  const roundId = (db.prepare("SELECT MAX(id) AS id FROM rounds").get() as { id: number }).id;
  assert.equal(
    (db.prepare("SELECT state_json AS s FROM rounds WHERE id = ?").get(roundId) as { s: unknown }).s,
    null,
  );

  // Elle se reprend…
  const current = await agent.get(`${VR}/current`);
  assert.equal(current.body.round.step, 2);
  assert.equal(current.body.round.multiplier, 2.21);
  assert.deepEqual(current.body.round.view, { step: 2, multiplier: 2.21, revealed: null });

  // …et se joue comme les autres.
  const joue = await agent.post(`${VR}/play`).send({ roundId, step: 2, option: 0 });
  assert.equal(joue.status, 200);
  assert.equal(joue.body.round.step, 3);
  assert.equal(joue.body.round.multiplier, 3.31);

  const encaisse = await agent.post(`${VR}/cashout`).send({ roundId });
  assert.equal(encaisse.status, 200);
  assert.equal(encaisse.body.round.payoutCents, 3310);
});
