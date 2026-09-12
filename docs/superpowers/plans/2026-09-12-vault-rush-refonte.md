# Vault Rush — refonte et plateforme arcade : plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rendre Vault Rush fiable (argent atomique, comptes, reprise), en extraire un moteur commun, ajouter Laser Grid, refaire le client avec une identité choisie par Lucas, et livrer Docker + CI + déploiement.

**Architecture:** Serveur Express 4 + `node:sqlite` (migrations versionnées, centimes entiers, transactions), auth argon2id (hash-wasm) + JWT (jose) en cookie httpOnly, moteur « jeu d'échelle » paramétré par `GameDefinition`. Client React 18 + Vite + react-router, écran de jeu générique, jetons de design. Un seul conteneur en prod (Express sert `client/dist`).

**Tech Stack:** Node 22 LTS (prod) / 25 (local), Express 4, `node:sqlite`, zod, hash-wasm, jose, helmet, `node:test` + supertest, React 18, Vite 5, react-router 7, Vitest + Testing Library, Biome, Docker, GitHub Actions.

## Global Constraints

- Spec : `docs/superpowers/specs/2026-09-12-vault-rush-refonte-design.md`. Dépôt `C:\Users\lucas\OneDrive\Desktop\casino` (remote `lucas04022002/vault-rush`), branche `refonte`, jamais `main`. Commits en français, trailer `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- **Monnaie fictive uniquement.** Vocabulaire interdit dans le client : « argent réel », « retrait », « dépôt », « payer », « acheter » (grep en CI).
- Pas de Docker ni de module natif en local. Le serveur tourne avec `node src/app.ts` (Node 25 exécute le TypeScript) : garder cette convention en dev ; en prod, vérifier que Node 22 LTS exécute `node:sqlite` sans flag (sinon `--experimental-sqlite` ou image Node 24).
- Montants en **centimes entiers** partout côté serveur et base ; jamais de `REAL` pour l'argent. Mise min 100, max 100 000 centimes. Plafond `MAX_PAYOUT_CENTS = 1_000_000`.
- Toute opération d'argent dans une transaction `BEGIN IMMEDIATE … COMMIT` avec rollback.
- Cookie `vr_session` : JWT HS256, 30 jours, httpOnly, SameSite=Lax, Secure en prod (`COOKIE_SECURE=0` autorisé hors prod), `JWT_SECRET` ≥ 32 caractères obligatoire. Aucune route ne lit un `userId` du client.
- Une partie active par joueur et par jeu ; `start` → 409 + partie active ; `play` porte `step` attendu → 409 + état courant si déjà joué ; dernière étape réussie = encaissement automatique.
- Tests serveur sur `DB_PATH=:memory:` ; suite complète verte à chaque tâche (`npm test` racine lance les deux workspaces ; créer un `package.json` racine avec workspaces `client`, `server`).
- Aucune couleur hors jetons dans `client/src` après la tâche 3 ; contraste AA testé.

---

## Carte des fichiers

| Fichier | Rôle |
|---|---|
| `package.json` (racine) | workspaces, scripts `dev`, `build`, `test`, `lint`, `typecheck` |
| `server/migrations/0001_init.sql`, `0002_cents_and_auth.sql` | schéma initial reproduisant l'existant ; conversion en centimes + colonnes auth + `game`/`step` |
| `server/src/database/{db,migrate,store}.ts` | connexion, runner, requêtes (centimes) |
| `server/src/money.ts` | `parseCoinsToCents`, `formatCents`, bornes |
| `server/src/auth/{password,jwt,session,rateLimit}.ts` | argon2id, JWT, `requireUser`, limiteur |
| `server/src/http/{validate,errors,origin}.ts` | zod, `HttpError`, gestionnaire terminal, garde d'origine |
| `server/src/engine/{ladder,definitions}.ts` | moteur générique, `GAMES` (vault-rush, laser-grid) |
| `server/src/modules/{auth,games,wallet,history,leaderboard,health}/*` | contrôleurs/services par domaine |
| `server/src/router.ts`, `server/src/app.ts` | routes, helmet, CORS, statique, erreurs |
| `server/tests/*.test.ts` | `node:test` + supertest |
| `client/src/{router,session,api}.ts`, `client/src/styles/tokens.css`, `client/src/components/*`, `client/src/screens/*`, `client/src/games/*` | client (tâches 3–4) |
| `Dockerfile`, `.dockerignore`, `docker-compose.yml`, `.github/workflows/ci.yml`, `deploy/coolify.md`, `README.md` | infra (tâche 5) |

---

### Task 1 : Socle serveur (migrations, centimes, transactions, comptes, parties fiables)

**Files:**
- Create: `package.json` racine (workspaces), `server/migrations/0001_init.sql`, `server/migrations/0002_cents_and_auth.sql`, `server/src/database/migrate.ts`, `server/src/money.ts`, `server/src/auth/{password,jwt,session,rateLimit}.ts`, `server/src/http/{validate,errors,origin}.ts`, `server/src/modules/auth/auth.controller.ts`, `server/src/modules/health/health.controller.ts`, `server/tests/{money,migrate,auth,rounds,wallet}.test.ts`, `server/.env.example`
- Modify: `server/src/database/{db,store}.ts` (centimes, transactions, `password_hash`, `game`, `step`), `server/src/modules/game/{game.service,game.controller}.ts` (session, idempotence, reprise, `step`, dernier étage auto, erreurs 400/409), `server/src/modules/wallet/wallet.service.ts`, `server/src/router.ts`, `server/src/app.ts` (helmet, CORS credentials, garde d'origine, statique prod, gestionnaire d'erreurs, `JWT_SECRET` obligatoire), `server/package.json` (deps : zod, hash-wasm, jose, helmet, cookie-parser, supertest, @types/*)
- Delete: `server/src/modules/user/*` (remplacé par `auth`)

**Interfaces:**
- `money.ts` : `toCents(input: unknown): number` (accepte `"12.5"`, `12.5`, `"12,50"` ; lance `HttpError(400)` si non fini, < 100, > 100 000 ou plus de 2 décimales), `fromCents(c: number): string` (`"12.50"`).
- `db.ts` : `openDb(path)`, `withTransaction<T>(fn: () => T): T` (`BEGIN IMMEDIATE`, `COMMIT`/`ROLLBACK`).
- `migrate.ts` : `runMigrations(db, dir): string[]` (table `schema_migrations(name PRIMARY KEY, applied_at)`), appelée au démarrage ; `0001_init.sql` reproduit les tables actuelles ; `0002` : ajoute `users.password_hash TEXT NULL`, `users.last_login_at`, `users.balance_cents INTEGER NOT NULL DEFAULT 100000` puis `UPDATE users SET balance_cents = CAST(ROUND(balance*100) AS INTEGER)` et supprime `balance` (SQLite : recréer la table), idem `rounds.bet_cents/payout_cents`, ajoute `rounds.game TEXT NOT NULL DEFAULT 'vault-rush'`, `rounds.step INTEGER NOT NULL DEFAULT 0`, `transactions.amount_cents`, `balance_after_cents`. Index unique partiel `rounds(user_id, game) WHERE status='playing'` (une partie active par jeu).
- `auth/session.ts` : `requireUser(req): SessionUser` (`{ id, username }`) via cookie `vr_session` ; `setSessionCookie(res, token)`, `clearSessionCookie(res)`.
- Routes : `POST /api/auth/register {username, password}` → 201 + cookie ; `POST /api/auth/login` → 200 + cookie, 401 générique, 429 après 10 essais / pseudo / 15 min ; `POST /api/auth/set-password` (compte existant à hash nul, exige `username` + `newPassword`, pose le hash **puis** ouvre la session ; 409 si un hash existe) ; `POST /api/auth/logout` ; `GET /api/auth/me`. Comptes existants sans hash : `login` répond 409 `{ error: "password_required" }` pour que le client propose de définir le mot de passe.
- Parties (jeu `vault-rush` pour l'instant, préfixe `/api/games/vault-rush/…`, l'ancien préfixe `/api/game/*` supprimé) : `POST …/start {betCoins, mode}` → 201 `{ round }` ou 409 `{ error: "round_active", round }` ; `GET …/current` → `{ round | null }` ; `POST …/play {roundId, step, option}` → 200 `{ round, revealed }` ; si `step !== round.step` → 409 `{ error: "step_mismatch", round }` ; dernier étage réussi → `round.status = "cashed_out"` automatiquement avec `payout_cents` ; `POST …/cashout {roundId}` → 200 `{ round, balanceCents }`. Toutes les réponses de partie exposent `betCents`, `multiplier`, `cashoutCents` (plafonné), `step`, `maxSteps`, `mode`, `status`.
- `GET /api/wallet` → `{ balanceCents }` ; `POST /api/wallet/refill` → 1 000 coins si solde < 1 000 centimes et pas de recharge depuis 24 h (table `refills` ou colonne `last_refill_at`), sinon 409.
- `GET /api/health` → `{ ok: true, db: true }`.

- [ ] **Step 1 : Tests (échec d'abord)**, sur `DB_PATH=:memory:` avec l'app exportée (`server/src/app.ts` exporte `createApp()` ; `main` écoute) :
  - `money.test.ts` : `toCents("0.001")` → 400 ; `toCents("12,50")` = 1250 ; `toCents(0.1 + 0.2)` géré (arrondi) ; bornes.
  - `migrate.test.ts` : base vide → 0001 + 0002 appliquées, `schema_migrations` à 2 lignes ; deuxième appel : rien ; base avec `users.balance = 12.34` avant 0002 → `balance_cents = 1234` après.
  - `auth.test.ts` : register → cookie httpOnly ; login mauvais mot de passe → 401 ; 11e essai → 429 ; compte sans hash → 409 `password_required` puis `set-password` → 200 + cookie ; `me` sans cookie → 401 ; garde d'origine cross-site → 403.
  - `rounds.test.ts` : start débite (transaction : le solde et le journal changent ensemble) ; second start → 409 avec la même partie ; `current` la renvoie ; `play` avec `step` en retard → 409 ; mise `0.001` → 400 et **aucune** ligne créée ; solde insuffisant → 409 ; 6 étapes réussies (moteur forcé « safe » par une graine ou un mock de `randomInt`) → statut `cashed_out` automatique, `payout_cents = min(bet × mult, 1 000 000)` ; cashout crédite et journalise dans une transaction ; porte 99 → 400.
  - `wallet.test.ts` : refill sous 10 coins → +1 000 ; refill à 500 coins → 409 ; deux refills en 24 h → 409.
- [ ] **Step 2 : Implémenter** (helmet avec CSP désactivée pour l'instant ; CORS `{ origin: CLIENT_URL, credentials: true }` seulement si `CLIENT_URL` est défini ; en prod, statique `client/dist` + repli `index.html` hors `/api`).
- [ ] **Step 3 : `server/.env.example`** (`PORT`, `DB_PATH`, `JWT_SECRET`, `CLIENT_URL`, `COOKIE_SECURE`, `NODE_ENV`), README provisoire « lancer le serveur ».
- [ ] **Step 4 : Lancer** `npm test --workspace=server` ; commit `feat(serveur): migrations, centimes, transactions, comptes avec mot de passe et cookie, parties idempotentes avec reprise`.

---

### Task 2 : Moteur commun, Laser Grid, historique et classement multi-jeux

**Files:**
- Create: `server/src/engine/ladder.ts`, `server/src/engine/definitions.ts`, `server/src/modules/games/games.controller.ts` (routes génériques `/api/games/:game/{config,start,current,play,cashout}`), `server/src/modules/history/history.controller.ts`, `server/src/modules/leaderboard/leaderboard.service.ts`, `server/tests/{engine,laser-grid,history-leaderboard}.test.ts`
- Modify: `server/src/modules/game/*` → fondu dans `games/` (supprimer `game.algorithm.ts` après extraction, garder ses tests adaptés), `server/src/router.ts`, `server/src/database/store.ts`

**Interfaces:**
- `engine/ladder.ts` : `buildMultipliers(safe, options, edge, steps)`, `drawOptions(def, mode): ("safe"|"danger")[]`, `playStep(def, mode, step, option): { outcome, nextStep, multiplier, revealed }`, `cashoutCents(betCents, multiplier)` (plafond), `configFor(def): { modes: { id, label, options, safeOptions, chancePerStep, multipliers[], maxWinForCents(bet) }[], steps, maxPayoutCents, labels }`.
- `engine/definitions.ts` : `GAMES: Record<GameId, GameDefinition>` avec `vault-rush` (6 étapes, safe 3/2/2 %, risk 4/2/4 %, insane 5/2/6 %, labels étage/porte/coffre/alarme) et `laser-grid` (8 lignes, calme 4/3/2 %, tendu 4/2/4 %, mortel 5/2/6 %, labels ligne/case/passage/laser). `isGameId(x)`.
- Routes : `GET /api/games` (liste), `GET /api/games/:game/config`, les 4 routes de partie, `GET /api/history?game=&limit=` (colonnes : jeu, mode, mise, résultat, bénéfice net en centimes, étape atteinte, date), `GET /api/leaderboard?game=` (top 10 par bénéfice net cumulé sur 30 jours ; `game` absent = global).

- [ ] **Step 1 : Tests (échec d'abord)** : multiplicateurs de Vault Rush identiques à l'existant (régression sur les 3 modes × 6 étapes) ; Laser Grid : 8 étapes, chances par mode, tirage borné (10 000 tirages : proportion sûre à ±3 %) ; parties Laser Grid via les routes génériques ; une partie active par jeu (Vault Rush et Laser Grid simultanées autorisées) ; historique mélangé filtrable ; classement par bénéfice net (un joueur qui a beaucoup perdu n'est pas en tête).
- [ ] **Step 2 : Implémenter**, supprimer les anciennes routes, garder les tests d'algorithme.
- [ ] **Step 3 : Commit** `feat(moteur): jeu d'échelle générique, Laser Grid, historique et classement multi-jeux`.

---

### Task 3 : Identité visuelle (après le choix de Lucas)

**Entrée :** la direction choisie parmi les trois propositions (artefact), avec ses jetons (couleurs, polices, rayons, ombres, mouvement) et sa signature.

**Files:**
- Create: `client/src/styles/tokens.css`, `client/src/styles/base.css`, `client/src/components/{Button,Field,Amount,StepTrack,OptionGrid,RewardTable,Balance,Toast,PageTitle,GameCard}.tsx`, `client/tests/{tokens,contrast,vocabulary,components}.test.tsx`, `client/vitest.config.ts`
- Modify: `client/package.json` (react-router, vitest, jsdom, testing-library), `client/index.html` (polices), `client/src/styles.css` → remplacé

- [ ] **Step 1 : Gardes** : grep « aucune couleur hors jetons », contraste AA sur les paires réellement utilisées, vocabulaire interdit (argent réel, retrait, dépôt, payer, acheter).
- [ ] **Step 2 : Composants** avec tests : `Amount` (formatage fr-FR 2 décimales + « coins »), `StepTrack` (étapes réussies/courante/suivante, multiplicateurs), `OptionGrid` (N options, révélation après réponse, désactivé pendant la requête, `aria-pressed`), `RewardTable` (depuis `config`), `Button` (`primary|secondary|danger|quiet`, `pending`), `Toast` (`role="status"`).
- [ ] **Step 3 : Commit** `feat(client): jetons et composants de la direction « … »`.

---

### Task 4 : Client complet

**Files:**
- Create: `client/src/router.tsx`, `client/src/session.tsx` (`useSession`, `RequireSession`), `client/src/api.ts` (réécrit : `fetch("/api/…", { credentials: "include" })`, types depuis les réponses serveur), `client/src/games/useLadderGame.ts` (état : `idle | active | finished`, reprise via `current`, `start`, `play(step, option)`, `cashout`, `replay`, erreurs), `client/src/screens/{Arcade,Game,Rules,History,Leaderboard,Account,Login,SetPassword,Terms,Legal}.tsx`, `client/src/lib/legal.ts`, `client/tests/*.test.tsx`
- Modify: `vite.config.ts` (proxy `/api` → `http://127.0.0.1:3001`), `client/src/App.tsx`, `client/src/main.tsx`
- Delete: `client/src/screens/{Home,Playing,Result,Game}.tsx` (remplacés), `client/src/session.ts`, `client/src/modes.ts`, `client/src/hooks/useGame.ts`

- [ ] **Step 1 : Tests (échec d'abord)** : `useLadderGame` (start → active ; `current` non nul au montage → reprise ; `play` envoie `step` ; 409 `step_mismatch` remplace l'état par celui du serveur ; erreur affichée ; `replay` désactivé pendant la requête ; dernière étape → `finished` avec bilan) ; `Amount` ; écran de jeu (tableau des récompenses avant mise, progression pendant, bilan à la fin avec mise / récupéré / net / nouveau solde) ; gardes de route ; connexion avec `password_required` → écran « Définir un mot de passe ».
- [ ] **Step 2 : Implémenter** les écrans selon spec §3, son coupé par défaut et joué après réponse seulement, `prefers-reduced-motion`, focus géré, mention « coins fictifs » sur l'accueil et le pied.
- [ ] **Step 3 : Lancer** `npm test`, `typecheck`, `lint`, `build` ; vérifier au navigateur (dev : serveur + Vite) : partie complète, reprise après rechargement, double clic sûr, Laser Grid. **Commit** `feat(client): arcade, écran de jeu générique, reprise, historique, classement, compte`.

---

### Task 5 : Docker, CI, déploiement, README

**Files:**
- Create: `Dockerfile` (multi-stage node:22-alpine ou 24 ; runner copie `server/` (src + migrations) + `client/dist` + node_modules prod ; `VOLUME /data` ; `ENV DB_PATH=/data/vault.db` ; `HEALTHCHECK`), `.dockerignore`, `docker-compose.yml`, `.github/workflows/ci.yml` (lint, tsc ×2, tests ×2, build, image : `docker run` + `/api/health` + `/` + inscription + start/play/cashout en API avec contrôle du solde, gardes `.env`, vocabulaire), `deploy/coolify.md`, `README.md` (captures, règles, architecture, « le hasard est côté serveur », comptes de démo, crédits), `biome.json`
- Modify: `package.json` racine (scripts CI)

- [ ] **Step 1 :** vérifier que l'image Node choisie exécute `node:sqlite` et le TypeScript (`node --experimental-strip-types` sur 22 ; natif sur 24) ; sinon compiler le serveur avec `tsc` (préférer la compilation si le doute existe).
- [ ] **Step 2 :** CI verte, README, guide ; **Commit** `chore: Dockerfile, CI avec smoke test, guide Coolify, README`.

---

## Auto-revue

- Spec §1 → T1 ; §2 → T2 ; §3 → T3 + T4 ; §4 → T5 (+ tests T1–T4) ; §5 respecté ; §6 ordre respecté (T3 attend le choix de Lucas, T1–T2 avancent en parallèle).
- Noms constants : cookie `vr_session`, `toCents/fromCents`, `withTransaction`, `runMigrations`, `requireUser`, `GAMES`, `GameDefinition`, `playStep`, `configFor`, routes `/api/games/:game/{config,start,current,play,cashout}`, erreurs `round_active`, `step_mismatch`, `password_required`.
