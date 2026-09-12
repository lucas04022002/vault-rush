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

test("derrière un proxy TLS déclaré, une origine https sur le même hôte passe", async () => {
  process.env.TRUSTED_PROXY_HOPS = "1";
  const app = makeApp();
  delete process.env.TRUSTED_PROXY_HOPS;

  const res = await request(app)
    .post("/api/auth/register")
    .set("Host", "vault-rush.example")
    .set("X-Forwarded-Proto", "https")
    .set("Origin", "https://vault-rush.example")
    .send({ username: "derriereproxy", password: "motdepasse1" });

  assert.equal(res.status, 201);
});

test("sans proxy déclaré, la même requête est refusée (fermé par défaut)", async () => {
  const app = makeApp();

  const res = await request(app)
    .post("/api/auth/register")
    .set("Host", "vault-rush.example")
    .set("X-Forwarded-Proto", "https")
    .set("Origin", "https://vault-rush.example")
    .send({ username: "sansproxy", password: "motdepasse1" });

  assert.equal(res.status, 403);
  assert.equal(res.body.error, "bad_origin");
});

test("TRUSTED_PROXY_HOPS non entier est ignoré (0, fermé par défaut)", () => {
  const avertissements: string[] = [];
  const vrai = console.warn;
  console.warn = (...args: unknown[]) => avertissements.push(args.join(" "));
  try {
    process.env.TRUSTED_PROXY_HOPS = "1.5";
    const flottant = makeApp();
    assert.equal(flottant.get("trust proxy"), false);

    process.env.TRUSTED_PROXY_HOPS = "abc";
    assert.equal(makeApp().get("trust proxy"), false);

    process.env.TRUSTED_PROXY_HOPS = "-1";
    assert.equal(makeApp().get("trust proxy"), false);

    process.env.TRUSTED_PROXY_HOPS = "2";
    assert.equal(makeApp().get("trust proxy"), 2);
  } finally {
    delete process.env.TRUSTED_PROXY_HOPS;
    console.warn = vrai;
  }

  assert.equal(avertissements.length, 3, "un avertissement par valeur refusée");
  assert.match(avertissements[0], /TRUSTED_PROXY_HOPS/);
});

test("le solde d'ouverture est journalisé : rejouer le journal donne le solde", async () => {
  const app = makeApp();
  const { agent, userId } = await signUp(app, "ouverture");

  const journal = ctxOf(app)
    .db.prepare("SELECT * FROM transactions WHERE user_id = ? ORDER BY id")
    .all(userId) as any[];

  assert.equal(journal.length, 1, "une seule ligne juste après l'inscription");
  assert.equal(journal[0].type, "opening");
  assert.equal(journal[0].amount_cents, 100000);
  assert.equal(journal[0].balance_after_cents, 100000);
  assert.equal(journal[0].round_id, null);

  // Rejoué depuis zéro, le journal retombe exactement sur le solde affiché.
  const signe = (t: any) => (t.type === "bet" ? -t.amount_cents : t.amount_cents);
  const rejeu = journal.reduce((somme, t) => somme + signe(t), 0);
  assert.equal(rejeu, (await agent.get("/api/wallet")).body.balanceCents);

  // Et après une partie perdue, le rejeu suit toujours le solde.
  await agent.post("/api/games/vault-rush/start").send({ betCoins: 10, mode: "safe" });
  const complet = ctxOf(app)
    .db.prepare("SELECT * FROM transactions WHERE user_id = ? ORDER BY id")
    .all(userId) as any[];
  assert.equal(
    complet.reduce((somme, t) => somme + signe(t), 0),
    (await agent.get("/api/wallet")).body.balanceCents,
  );
});

test("un cookie valide pour un compte supprimé donne 401, pas 500", async () => {
  const app = makeApp();
  const { agent, userId } = await signUp(app, "disparue");
  // Suppression à la main, comme les CGU le promettent : le compte et sa trace.
  ctxOf(app).db.prepare("DELETE FROM transactions WHERE user_id = ?").run(userId);
  ctxOf(app).db.prepare("DELETE FROM users WHERE id = ?").run(userId);

  // Le chemin qui partait en 500 : `start` écrivait la partie avant de lire le solde.
  const start = await agent.post("/api/games/vault-rush/start").send({ betCoins: 10, mode: "safe" });
  assert.equal(start.status, 401);
  assert.equal(start.body.error, "unauthorized");
  // La session est retirée dans la foulée : le cookie renvoyé est vide.
  const vide = (start.headers["set-cookie"] as unknown as string[] | undefined) ?? [];
  assert.ok(
    vide.some((c) => /^vr_session=;/.test(c)),
    "le cookie de session est effacé",
  );

  assert.equal((await agent.get("/api/auth/me")).status, 401);

  // Aucune partie n'a été créée au passage.
  assert.equal((ctxOf(app).db.prepare("SELECT * FROM rounds").all() as any[]).length, 0);
});

test("un JSON malformé renvoie 400, un corps trop gros 413", async () => {
  const app = makeApp();

  const casse = await request(app)
    .post("/api/auth/register")
    .set("Content-Type", "application/json")
    .send('{"username": "oops"');
  assert.equal(casse.status, 400);
  assert.equal(casse.body.error, "invalid_json");

  const enorme = await request(app)
    .post("/api/auth/register")
    .set("Content-Type", "application/json")
    .send(JSON.stringify({ username: "grosse", password: "x".repeat(32 * 1024) }));
  assert.equal(enorme.status, 413);
  assert.equal(enorme.body.error, "payload_too_large");
});

test("la CSP est envoyée sur l'API et sur la page en production", async () => {
  const sante = await request(makeApp()).get("/api/health");
  assert.match(String(sante.headers["content-security-policy"]), /default-src 'self'/);

  const avant = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  const prod = makeApp();
  process.env.NODE_ENV = avant;

  const page = await request(prod).get("/");
  const csp = String(page.headers["content-security-policy"]);
  assert.match(csp, /default-src 'self'/);
  assert.match(csp, /script-src 'self'/);
  // Aucune origine tierce n'est autorisée : les polices sont auto-hébergées.
  assert.ok(!/googleapis|gstatic/.test(csp));
});

test("les messages de saisie invalide sont en français", async () => {
  const app = makeApp();

  const pseudo = await request(app)
    .post("/api/auth/register")
    .send({ username: "pseudo-avec-tiret", password: "motdepasse1" });
  assert.equal(pseudo.status, 400);
  assert.equal(pseudo.body.error, "invalid_body");
  assert.match(pseudo.body.details[0].message, /pas de tiret ni d'espace/);

  const trop_long = await request(app)
    .post("/api/auth/register")
    .send({ username: "longue", password: "x".repeat(201) });
  assert.equal(trop_long.status, 400);
  assert.match(trop_long.body.details[0].message, /caractères au maximum/);

  const trop_court = await request(app)
    .post("/api/auth/register")
    .send({ username: "courte", password: "court" });
  assert.match(trop_court.body.details[0].message, /caractères minimum/);
});

test("la recharge refusée dit dans combien de temps réessayer", async () => {
  const app = makeApp();
  const { agent, userId } = await signUp(app, "rechargeuse");
  const solde = (cents: number) =>
    ctxOf(app).db.prepare("UPDATE users SET balance_cents = ? WHERE id = ?").run(cents, userId);

  solde(100);
  assert.equal((await agent.post("/api/wallet/refill").send({})).status, 200);

  solde(100);
  const res = await agent.post("/api/wallet/refill").send({});
  assert.equal(res.status, 409);
  assert.equal(res.body.error, "refill_cooldown");
  const secondes = res.body.retryAfterSeconds;
  assert.ok(Number.isInteger(secondes), `retryAfterSeconds entier attendu, reçu ${secondes}`);
  // 24 h moins le temps écoulé depuis la recharge : on reste juste sous le plafond.
  assert.ok(secondes > 23 * 3600 && secondes <= 24 * 3600, `valeur inattendue : ${secondes}`);
});
