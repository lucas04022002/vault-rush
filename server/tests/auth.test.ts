import { test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { makeApp, ctxOf, signUp } from "./helper.ts";

function sessionCookie(res: request.Response): string {
  const raw = res.headers["set-cookie"] as unknown as string[] | undefined;
  const cookie = (raw ?? []).find((c) => c.startsWith("vr_session="));
  assert.ok(cookie, "cookie vr_session attendu");
  return cookie;
}

test("l'inscription ouvre une session dans un cookie httpOnly", async () => {
  const app = makeApp();
  const res = await request(app)
    .post("/api/auth/register")
    .send({ username: "lucas", password: "motdepasse1" });

  assert.equal(res.status, 201);
  assert.equal(res.body.user.username, "lucas");
  assert.equal(res.body.balanceCents, 100000);
  assert.ok(!("password" in res.body.user) && !("passwordHash" in res.body.user));

  const cookie = sessionCookie(res);
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /SameSite=Lax/i);
});

test("un pseudo déjà pris renvoie 409", async () => {
  const app = makeApp();
  await signUp(app, "lucas");
  const res = await request(app)
    .post("/api/auth/register")
    .send({ username: "lucas", password: "motdepasse1" });
  assert.equal(res.status, 409);
  assert.equal(res.body.error, "username_taken");
});

test("un mot de passe trop court est refusé (400)", async () => {
  const app = makeApp();
  const res = await request(app)
    .post("/api/auth/register")
    .send({ username: "lucas", password: "court" });
  assert.equal(res.status, 400);
});

test("un mauvais mot de passe renvoie 401 générique", async () => {
  const app = makeApp();
  await signUp(app, "lucas", "motdepasse1");
  const res = await request(app)
    .post("/api/auth/login")
    .send({ username: "lucas", password: "mauvais_mot_de_passe" });

  assert.equal(res.status, 401);
  assert.equal(res.body.error, "invalid_credentials");

  // Un pseudo inconnu donne exactement la même réponse (pas d'énumération de comptes).
  const inconnu = await request(app)
    .post("/api/auth/login")
    .send({ username: "personne", password: "mauvais_mot_de_passe" });
  assert.equal(inconnu.status, 401);
  assert.equal(inconnu.body.error, "invalid_credentials");
});

test("le 11e essai de connexion est bloqué (429)", async () => {
  const app = makeApp();
  await signUp(app, "lucas", "motdepasse1");

  for (let i = 0; i < 10; i++) {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ username: "lucas", password: "mauvais_mot_de_passe" });
    assert.equal(res.status, 401, `essai ${i + 1} devrait être un 401`);
  }

  const bloque = await request(app)
    .post("/api/auth/login")
    .send({ username: "lucas", password: "mauvais_mot_de_passe" });
  assert.equal(bloque.status, 429);
  assert.equal(bloque.body.error, "too_many_attempts");

  // Le bon mot de passe est bloqué aussi tant que la fenêtre court.
  const bonMdp = await request(app)
    .post("/api/auth/login")
    .send({ username: "lucas", password: "motdepasse1" });
  assert.equal(bonMdp.status, 429);
});

test("un ancien compte sans mot de passe passe par set-password", async () => {
  const app = makeApp();
  const { db } = ctxOf(app);
  db.prepare("INSERT INTO users (username, balance_cents) VALUES (?, ?)").run("ancienne", 4200);

  const refus = await request(app)
    .post("/api/auth/login")
    .send({ username: "ancienne", password: "motdepasse1" });
  assert.equal(refus.status, 409);
  assert.equal(refus.body.error, "password_required");

  const agent = request.agent(app);
  const pose = await agent
    .post("/api/auth/set-password")
    .send({ username: "ancienne", newPassword: "motdepasse1" });
  assert.equal(pose.status, 200);
  sessionCookie(pose);
  assert.equal(pose.body.balanceCents, 4200, "le solde existant est conservé");

  const moi = await agent.get("/api/auth/me");
  assert.equal(moi.status, 200);
  assert.equal(moi.body.user.username, "ancienne");

  // Deuxième pose de mot de passe : refusée.
  const rejeu = await request(app)
    .post("/api/auth/set-password")
    .send({ username: "ancienne", newPassword: "autremotdepasse" });
  assert.equal(rejeu.status, 409);
  assert.equal(rejeu.body.error, "password_already_set");
});

test("me sans cookie renvoie 401, et logout referme la session", async () => {
  const app = makeApp();
  const anonyme = await request(app).get("/api/auth/me");
  assert.equal(anonyme.status, 401);
  assert.equal(anonyme.body.error, "unauthorized");

  const { agent } = await signUp(app, "lucas");
  assert.equal((await agent.get("/api/auth/me")).status, 200);

  const out = await agent.post("/api/auth/logout").send({});
  assert.equal(out.status, 200);
  assert.equal((await agent.get("/api/auth/me")).status, 401);
});

test("un cookie forgé est rejeté", async () => {
  const app = makeApp();
  const res = await request(app).get("/api/auth/me").set("Cookie", "vr_session=nimportequoi");
  assert.equal(res.status, 401);
});

test("la garde d'origine bloque une mutation cross-site (403)", async () => {
  const app = makeApp();
  await signUp(app, "lucas", "motdepasse1");

  const res = await request(app)
    .post("/api/auth/login")
    .set("Origin", "https://site-malveillant.example")
    .send({ username: "lucas", password: "motdepasse1" });
  assert.equal(res.status, 403);
  assert.equal(res.body.error, "bad_origin");

  // Une lecture depuis la même origine passe.
  const ok = await request(app).get("/api/health");
  assert.equal(ok.status, 200);
});

test("health répond ok avec la base", async () => {
  const app = makeApp();
  const res = await request(app).get("/api/health");
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { ok: true, db: true });
});

test("une route d'API inconnue renvoie 404 en JSON", async () => {
  const app = makeApp();
  const res = await request(app).get("/api/nexistepas");
  assert.equal(res.status, 404);
  assert.equal(res.body.error, "not_found");
});

test("les anciennes routes sans session ont disparu", async () => {
  const app = makeApp();
  assert.equal((await request(app).post("/api/game/start").send({ userId: 1 })).status, 404);
  assert.equal((await request(app).get("/api/wallet/balance/1")).status, 404);
});
