# Vault Rush — refonte et plateforme arcade (spec, 12/09/2026)

## Décisions prises avec Lucas

- **Monnaie virtuelle uniquement**, jamais d'argent réel. Aucun paiement, aucun retrait. Mention « coins fictifs, sans valeur » sur l'accueil et dans les CGU.
- Périmètre : **Vault Rush fiable et fini**, un **moteur commun** extrait de Vault Rush, et **un deuxième jeu, Laser Grid**, sur ce moteur ; un accueil « Arcade » qui liste les jeux ; un seul compte, un seul solde, un historique et un classement communs. Les six autres jeux, la progression (niveaux, missions, succès) et les bonus viennent ensuite, jeu par jeu.
- **Identité visuelle refaite** : trois propositions en artefact, Lucas choisit, puis jetons et composants. En attendant le choix, le serveur et le moteur avancent.
- Base de l'audit du 12/09 (`audit/AUDIT-REFONTE.md`) : ordre socle → parcours → identité → vérification.
- Dépôt `lucas04022002/vault-rush` (public), branche `refonte` → PR vers `main`. Commits en français, trailer `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Contraintes machine : pas de Docker, pas de module natif (Smart App Control). Node 25 en local ; cible Node 22 LTS en prod (`node:sqlite` est disponible depuis Node 22.5 ; vérifier le flag) ; sinon Node 24.

## 1. Socle serveur

| Sujet | Décision |
|---|---|
| Base | SQLite via `node:sqlite` (déjà en place, pas de module natif), fichier sur un volume en prod, `PRAGMA journal_mode=WAL`, `foreign_keys=ON`. Migrations versionnées `server/migrations/NNNN_*.sql` + table `schema_migrations`, appliquées au démarrage ; jamais de destruction. |
| Montants | **Entiers en centimes de coin** (`balance_cents`, `bet_cents`, `payout_cents`). Le client affiche `12,50 coins`. Toute validation se fait après normalisation en centimes ; mise min 100 (1 coin), max 100 000 (1 000 coins), multiple de 1 centime. |
| Atomicité | Chaque opération d'argent (démarrer = créer la partie + débiter + journal ; perdre = clôturer + journal ; encaisser = clôturer + créditer + journal) dans **une transaction SQLite** (`BEGIN IMMEDIATE … COMMIT`, rollback sur erreur). |
| Comptes | Pseudo + mot de passe (≥ 8 caractères), hachage argon2id via `hash-wasm`, jeton JWT HS256 (`jose`) dans un cookie `vr_session` httpOnly, SameSite=Lax, Secure en prod, 30 jours. Routes `POST /api/auth/register`, `login`, `logout`, `GET /api/auth/me`. Plus aucun `userId` fourni par le client : toutes les routes lisent la session. Limite : 10 essais de connexion par pseudo par 15 min. Comptes existants (pseudo sans mot de passe) : migration qui les marque `password_hash = NULL` ; à la première connexion, l'utilisateur **définit** son mot de passe (route `POST /api/auth/set-password` acceptée seulement quand le hash est nul). |
| Parties | Une seule partie active par joueur et par jeu. `POST /api/games/:game/start` renvoie **409 avec la partie active** s'il y en a une (démarrage idempotent par construction). `GET /api/games/:game/current` renvoie la partie active ou `null` (reprise après rechargement). Une partie active reste active jusqu'à perte ou encaissement ; pas d'expiration (règle affichée : « une partie en cours vous attend »). Chaque `play` porte un `step` attendu : si le client renvoie un étage déjà joué, 409 avec l'état courant (double clic sûr). |
| Fin de partie | Au dernier étage réussi, la partie passe **automatiquement** en `cashed_out` avec le multiplicateur final (plus de portes proposées). |
| Plafond | `MAX_PAYOUT_CENTS = 1 000 000` (10 000 coins), renvoyé dans la config du jeu et affiché avant de miser. |
| Erreurs | Validation `zod` sur chaque corps ; 400 `{ error: "…" }` lisible, 401/403/404/409 ; gestionnaire terminal 500 sans pile. Porte invalide = 400, pas 500. |
| Config API | Le serveur sert le client construit (`client/dist`) en production avec repli `index.html` ; en dev, Vite proxy `/api` vers le serveur ; le client n'a plus d'URL en dur (`fetch("/api/…")`). |
| Sécurité | `helmet`, CORS restreint à `CLIENT_URL` en dev (`credentials: true`), garde d'origine sur les mutations, `JWT_SECRET` ≥ 32 caractères obligatoire. |
| Santé | `GET /api/health` → `{ ok, db }`. |

## 2. Moteur commun et jeux

Le moteur est un « jeu d'échelle » paramétré :

```
GameDefinition {
  id: "vault-rush" | "laser-grid"
  name, tagline
  steps: number                       // étages / lignes
  modes: { id, label, options, safeOptions, houseEdge }[]
  labels: { step, option, safe, danger, cashout }   // « étage / porte / coffre / alarme »
}
```

- Multiplicateurs : `mult(n) = (1 − edge) / p^n`, `p = safeOptions / options`, arrondis à 2 décimales, calculés par le moteur et exposés par `GET /api/games/:game/config` (modes, multiplicateurs par étape, chances, plafond, gain max par mode pour une mise donnée).
- Tirage par `crypto.randomInt` à chaque étape, côté serveur ; les options révélées sont renvoyées après le choix.
- Tables : `rounds` gagne `game TEXT NOT NULL DEFAULT 'vault-rush'` et `step INTEGER` ; `transactions` inchangée (centimes) ; `users` gagne `password_hash`, `last_login_at`.
- **Vault Rush** : 6 étages ; Safe 3 portes / 2 coffres / bord 2 %, Risk 4 / 2 / 4 %, Insane 5 / 2 / 6 % (inchangé).
- **Laser Grid** : 8 lignes ; Calme 4 cases / 3 sûres / 2 %, Tendu 4 / 2 / 4 %, Mortel 5 / 2 / 6 %. Même API, mêmes écrans génériques, décor différent (grille, lasers, cases déjà franchies visibles).
- Historique `GET /api/history` (tous jeux, filtre `?game=`), classement `GET /api/leaderboard?game=` (par jeu et global : bénéfice net cumulé, pas le solde).
- Solde de départ 1 000 coins ; **recharge gratuite** quand le solde passe sous 10 coins (`POST /api/wallet/refill` → 1 000 coins, une fois par 24 h), pour que le jeu reste jouable sans jamais parler d'argent.

## 3. Client

- React 18 + Vite conservés ; ajout de `react-router` (routes `/`, `/jeux/:game`, `/historique`, `/classement`, `/compte`, `/connexion`, `/regles/:game`, `/cgu`), Vitest + Testing Library.
- Session par cookie (`credentials: "include"`), `useSession()`, gardes de route ; plus de `localStorage` d'identité.
- **Accueil « Arcade »** : les deux jeux en tuiles (nom, accroche, « Jouer », « Règles »), solde, mention coins fictifs.
- **Écran de jeu générique** piloté par `GameDefinition` : avant de miser → mise (raccourcis + saisie), mode, **tableau des récompenses** (chances, multiplicateurs par étape, gain max, plafond) ; en jeu → **progression des étapes** (réussies, courante, suivante, multiplicateur courant et suivant, somme encaissable) + options cliquables + bouton « Encaisser X coins » ; fin → **bilan** (mise, récupéré, bénéfice ou perte net, nouveau solde, étape atteinte, multiplicateur) + « Rejouer (même mise, même mode) » désactivé pendant la requête, erreurs affichées.
- **Reprise** : à l'ouverture d'un jeu, si une partie est active, elle s'affiche directement (« Partie en cours reprise »).
- Montants toujours formatés `Intl.NumberFormat("fr-FR", 2 décimales) + " coins"`.
- Accessibilité : labels, `aria-pressed` sur mises et modes, `role="status"` pour résultats et erreurs, focus déplacé au changement d'écran, `prefers-reduced-motion`, son coupé par défaut et jamais joué avant la réponse API.
- Identité visuelle : **direction B « Néon arcade »**, choisie par Lucas le 12/09/2026 parmi trois propositions (A « Chambre forte », B « Néon arcade », C « Plan du casse »). Borne d'arcade : violet profond, magenta, cyan, jaune qui brillent, boutons ronds à ombre dure, titres Bungee. Jetons dans `client/src/styles/tokens.css`, aucune couleur hors jetons (test de grep), contraste AA testé.

  | Jeton | Valeur | Usage |
  |---|---|---|
  | `--bg` | `#0F0A1E` | fond de page (avec halo radial `#2A1650` en haut) |
  | `--panel` | `#1A1133` | cartes, écran de jeu |
  | `--panel2` | `#26193F` | surfaces secondaires, cases, options |
  | `--line` | `#3A2B5C` | bordures (2 px) |
  | `--mag` | `#FF3D8A` | accent chaud : mise/mode sélectionné, ombre des titres, étiquettes |
  | `--cyan` | `#35E5FF` | accent froid : marque, options (portes/cases), boutons secondaires |
  | `--yel` | `#FFD23F` | action principale (Encaisser, Jouer), solde, étape courante ; texte dessus `#2A1B00`, ombre dure `#B58A00` |
  | `--text` | `#FFF6FA` | texte |
  | `--dim` | `#A99CC4` | texte secondaire, étiquettes |
  | `--safe` | `#41F0A5` | étape réussie, bénéfice ; texte dessus `#04261A` |
  | `--alarm` | `#FF4D4D` | alarme/laser, perte, erreurs |

  Polices Google : titres **Bungee** (marque, noms de jeux, « Encaisser »), texte **Rubik** 400/600/800, chiffres **Space Mono** 400/700 (`tabular-nums`). Rayons : boutons et puces en pilule (999 px), cartes 20 px, options 14 px. Ombres : lueur `0 0 14px rgba(255,61,138,.6)` sur la sélection, `0 0 40px rgba(255,61,138,.25)` autour de l'écran de jeu, ombre dure `0 6px 0 #B58A00` sous le bouton principal (enfoncé de 4 px au clic). Mouvement : lueur qui pulse sur l'étape courante, révélation des options par bascule, tout coupé sous `prefers-reduced-motion`. Thème unique (sombre), fond peint explicitement.

## 4. Qualité, Docker, CI, déploiement

- Tests serveur (`node:test` + supertest sur base `:memory:`) : argent (centimes, transaction, mise 0,001 refusée), démarrage idempotent, reprise, double clic (`step`), dernier étage automatique, plafond, auth (register/login/set-password/403 sans session), moteur (multiplicateurs, tirage borné), Laser Grid. Tests client (Vitest) : gardes, formatage, reprise, bilan.
- Dockerfile multi-stage `node:22-alpine` (ou 24 si `node:sqlite` l'exige), client construit et servi par Express, volume `/data` pour SQLite, `HEALTHCHECK`. CI GitHub : lint (Biome), `tsc` ×2, tests ×2, build, `docker build` + conteneur lancé : `/api/health`, `/` HTML, inscription + partie complète en API (start → play → cashout) avec vérification du solde.
- `deploy/coolify.md`, README portfolio (captures, règles, architecture, « pourquoi le hasard est côté serveur », comptes de démo).
- Pages `/cgu` et mentions légales avec `lib/legal.ts` « À COMPLÉTER » comme les autres projets ; ajouter « jeu gratuit, coins sans valeur, aucun achat ».

## 5. Hors périmètre

Les six autres jeux, la progression commune (niveaux, missions, succès, cosmétiques), les bonus (scanner, bouclier, double vault, porte dorée), les objectifs de partie, le mode démo/tutoriel interactif (un texte de règles suffit), l'argent réel (jamais).

## 6. Ordre de livraison

1. Socle serveur : migrations, centimes, transactions, comptes et cookie, parties idempotentes et reprise, erreurs, health, tests.
2. Moteur commun + Laser Grid + config/historique/classement multi-jeux.
3. Identité visuelle : propositions → choix → jetons et composants.
4. Client : routes, session, écran de jeu générique, arcade, historique, classement, compte, règles, CGU, tests.
5. Docker, CI avec smoke test, guide Coolify, README.
