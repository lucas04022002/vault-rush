# Serveur Vault Rush (provisoire)

API Express 4 + SQLite (`node:sqlite`). Jeu en **coins fictifs**, jamais d'argent réel.

## Lancer le serveur

```bash
npm install                 # à la racine du dépôt (workspaces client + server)
cp server/.env.example server/.env
# remplacer JWT_SECRET par un secret d'au moins 32 caractères
npm run dev                 # racine : lance le serveur sur http://127.0.0.1:3001
npm run dev:client          # dans un autre terminal : le client Vite
```

Sans fichier `.env` (par exemple en une ligne) :

```bash
JWT_SECRET=32-caracteres-minimum-pour-signer DB_PATH=:memory: node server/src/app.ts
```

Node 25 exécute le TypeScript directement : il n'y a **pas** d'étape de compilation.

## Tests

```bash
npm test --workspace=server   # node:test + supertest, base SQLite en mémoire
```

## Variables d'environnement

Voir `server/.env.example`. `JWT_SECRET` (≥ 32 caractères) est obligatoire : sans lui,
le serveur refuse de démarrer.

## Migrations

`server/migrations/NNNN_*.sql`, appliquées au démarrage dans l'ordre alphabétique et
enregistrées dans `schema_migrations`. Elles ne détruisent jamais de données ; pour en
ajouter une, créer un nouveau fichier numéroté (ne jamais modifier un fichier déjà appliqué).

## Routes

| Méthode | Route | Rôle |
|---|---|---|
| GET | `/api/health` | `{ ok, db }` |
| POST | `/api/auth/register` | pseudo + mot de passe (≥ 8), ouvre la session |
| POST | `/api/auth/login` | 401 générique, 429 après 10 essais / 15 min, 409 `password_required` pour un compte hérité |
| POST | `/api/auth/set-password` | pose le mot de passe d'un compte hérité, puis ouvre la session |
| POST | `/api/auth/logout` | ferme la session |
| GET | `/api/auth/me` | compte connecté + solde |
| GET | `/api/wallet` | `{ balanceCents }` |
| POST | `/api/wallet/refill` | +1 000 coins sous 10 coins, une fois par 24 h |
| GET | `/api/games/vault-rush/current` | partie en cours ou `null` (reprise) |
| POST | `/api/games/vault-rush/start` | `{ betCoins, mode }`, 409 `round_active` si une partie tourne |
| POST | `/api/games/vault-rush/play` | `{ roundId, step, option }`, 409 `step_mismatch` si l'étape est déjà jouée |
| POST | `/api/games/vault-rush/cashout` | `{ roundId }` |
| GET | `/api/leaderboard` | top 10 par bénéfice net |

L'identité vient **toujours** du cookie de session `vr_session` : aucune route n'accepte
d'identifiant de joueur envoyé par le client. Tous les montants sont des entiers en centimes.
