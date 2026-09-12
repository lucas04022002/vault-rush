# Déployer Vault Rush sur un VPS Hetzner avec Coolify

Une seule image, un seul conteneur : Express sert l'API **et** le client construit.
La base SQLite vit sur un volume, donc les comptes et les parties survivent à chaque
redéploiement.

Durée : ~15 minutes. Prérequis : un VPS avec Coolify installé et un nom de domaine
dont l'enregistrement `A` pointe sur l'IP du VPS.

---

## 1. Créer la ressource

Dans Coolify : **Projects → (ton projet) → + New Resource → Public Repository**
(ou *Private Repository (GitHub App)* si le dépôt devient privé).

| Champ | Valeur |
|---|---|
| Repository | `https://github.com/lucas04022002/vault-rush` |
| Branch | `main` |
| Build Pack | **Dockerfile** |
| Dockerfile location | `/Dockerfile` |
| Base directory | `/` |
| Ports Exposes | `3001` |

Ne pas choisir « Nixpacks » : le `Dockerfile` du dépôt fait déjà tout (installation,
construction du client, image finale sans outillage de développement, utilisateur non
root).

## 2. Variables d'environnement

Onglet **Environment Variables**. À saisir à la main — aucune de ces valeurs n'est
dans le dépôt, et aucune n'entre dans l'image.

| Variable | Valeur | Pourquoi |
|---|---|---|
| `JWT_SECRET` | **à générer, 48 caractères aléatoires** | signe les cookies de session ; le serveur refuse de démarrer en dessous de 32 caractères |
| `NODE_ENV` | `production` | le serveur sert `client/dist` et pose un cookie `Secure` |
| `COOKIE_SECURE` | `1` | le site est en HTTPS |
| `TRUSTED_PROXY_HOPS` | `1` | un seul proxy (Traefik de Coolify) devant le conteneur |
| `DB_PATH` | `/data/vault.db` | le fichier SQLite, sur le volume |
| `PORT` | `3001` | port d'écoute (déjà la valeur par défaut de l'image) |

Générer le secret sur ta machine, puis le coller dans Coolify :

```bash
node -e "console.log(require('node:crypto').randomBytes(36).toString('base64url'))"
```

Ne **pas** définir `CLIENT_URL` en production : le client est servi par le même
serveur, donc à la même origine. `CLIENT_URL` n'existe que pour le Vite de
développement, et l'activer ouvrirait du CORS pour rien.

## 3. Volume persistant

Onglet **Storages → + Add**, type *Volume Mount* :

| Champ | Valeur |
|---|---|
| Name | `vault-data` |
| Destination Path | `/data` |

Sans ce volume, la base repart à zéro à chaque déploiement (l'image, elle, est
jetable par construction). Le dossier `/data` appartient à l'utilisateur `node`
du conteneur : aucune permission à régler.

## 4. Domaine et HTTPS

Onglet **General → Domains** : `https://vault-rush.mon-domaine.fr` (le schéma
`https://` suffit pour que Coolify demande le certificat Let's Encrypt via Traefik).
Vérifier que **Ports Exposes** vaut bien `3001`.

## 5. Sonde de santé

L'image porte déjà son `HEALTHCHECK` (`/api/health` toutes les 30 s, via Node).
Dans Coolify, onglet **Healthchecks**, laisser l'option *Health Check Enabled* et,
si un chemin est demandé : `/api/health`, port `3001`, code attendu `200`.
La réponse est `{ "ok": true, "db": true }` — `db: false` veut dire que le serveur
répond mais que la base ne répond plus (volume perdu ou disque plein).

## 6. Déployer, puis vérifier

**Deploy**, puis suivre les journaux. Au premier démarrage, les migrations
s'appliquent toutes seules et le journal affiche la ligne d'écoute.

Vérifications, dans cet ordre :

1. `curl https://vault-rush.mon-domaine.fr/api/health` → `{"ok":true,"db":true}`.
2. Ouvrir le site : l'arcade s'affiche (c'est le client construit qui est servi).
3. **S'inscrire** (pseudo + mot de passe) : si l'inscription répond `403 bad_origin`,
   voir le point 1 des pièges ci-dessous.
4. **Jouer une partie** : miser, franchir une étape, encaisser — le solde doit bouger
   de `−mise` puis `+gain`.
5. **Recharger la page en pleine partie** : la partie doit être reprise à la bonne
   étape (c'est le serveur qui tient l'état, pas le navigateur).
6. Redéployer, puis se reconnecter avec le même compte : il est toujours là (volume).

## Deux pièges connus

1. **`403 bad_origin` sur toutes les mutations.** La garde anti-CSRF compare l'en-tête
   `Origin` envoyé par le navigateur à l'en-tête `Host` reçu par le serveur. Si le proxy
   réécrit `Host`, les deux ne correspondent plus et toute écriture est refusée.
   Traefik (donc Coolify) transmet le `Host` d'origine par défaut : dans ce cas, la
   cause est presque toujours `TRUSTED_PROXY_HOPS` absent ou à `0` — sans lui, le
   serveur croit parler en HTTP alors que le navigateur a vu du HTTPS, et refuse
   (fermé par défaut, c'est voulu). Mettre `TRUSTED_PROXY_HOPS=1` et redéployer.
2. **`CLIENT_URL` en production.** Ne pas la définir (voir §2). Si elle traîne dans les
   variables, le serveur ouvre du CORS avec cookies vers une origine qui n'a plus lieu
   d'être.

## Sauvegarder la base

Tout tient dans un fichier — mais **un `cp` de `vault.db` seul n'est pas une
sauvegarde**. La base tourne en mode WAL : les écritures récentes vivent dans
`vault.db-wal` tant qu'elles n'ont pas été repliées. Mesuré sur la vraie base de
Lucas : le `.db` copié sans son `-wal` contenait **0 compte et 0 partie** alors
que l'original en avait 4 et 43.

### La bonne procédure (conteneur en marche)

L'image est une alpine sans `sqlite3` ; on passe donc par le `node:sqlite` déjà
présent, et `VACUUM INTO` écrit une copie cohérente (WAL replié, base compactée) :

```bash
# Nom du conteneur : `docker ps` (Coolify le préfixe par le nom du service)
docker exec <conteneur> node --disable-warning=ExperimentalWarning -e "const{DatabaseSync}=require('node:sqlite');const d=new DatabaseSync('/data/vault.db');d.exec(\"VACUUM INTO '/data/sauvegarde.sqlite'\");d.close()"
docker cp <conteneur>:/data/sauvegarde.sqlite ./vault-$(date +%F).sqlite
docker exec <conteneur> rm /data/sauvegarde.sqlite
```

Vérifier la copie avant de la ranger (elle doit contenir les comptes) :

```bash
node --disable-warning=ExperimentalWarning -e "const{DatabaseSync}=require('node:sqlite');const d=new DatabaseSync('./vault-$(date +%F).sqlite');console.log(d.prepare('SELECT COUNT(*) c FROM users').get())"
```

`VACUUM INTO` refuse d'écraser un fichier existant : supprimer la copie
intermédiaire après chaque sauvegarde (dernière ligne), sinon la suivante échoue.

Si `sqlite3` est disponible (hôte, ou `apk add --no-cache sqlite` dans le
conteneur), `sqlite3 /data/vault.db ".backup /data/sauvegarde.sqlite"` fait la
même chose.

### Le repli (conteneur arrêté)

Arrêter le conteneur dans Coolify, puis copier **le trio de fichiers**, jamais le
`.db` tout seul :

```bash
docker cp <conteneur>:/data/vault.db      ./vault-$(date +%F).db
docker cp <conteneur>:/data/vault.db-wal  ./vault-$(date +%F).db-wal   # s'il existe
docker cp <conteneur>:/data/vault.db-shm  ./vault-$(date +%F).db-shm   # s'il existe
```

Le volume Docker est aussi directement sur le VPS (`docker volume inspect` donne
son chemin) : un `tar` de ce dossier, conteneur arrêté, fait la même sauvegarde
hors ligne.

### Restauration

Le serveur ouvre le fichier désigné par `DB_PATH` au démarrage : restaurer, c'est
remettre ce fichier en place pendant que le conteneur est arrêté.

```bash
# Conteneur arrêté dans Coolify.
docker cp ./vault-2026-09-12.sqlite <conteneur>:/data/vault.db
# Aucun -wal ni -shm hérité de l'ancienne base ne doit rester à côté :
docker exec <conteneur> sh -c 'rm -f /data/vault.db-wal /data/vault.db-shm'
```

Redémarrer : les migrations en attente s'appliquent à la base restaurée, et
`GET /api/health` répond `{ ok: true, db: true }` quand elle est lisible.
Vérifier ensuite qu'un compte connu se connecte avant de considérer la
restauration comme réussie.

## Mettre à jour

Pousser sur `main` : Coolify reconstruit et redéploie (activer *Auto Deploy* dans
**General**, ou cliquer **Redeploy**). Les migrations en attente s'appliquent au
démarrage ; elles n'effacent jamais de données. Le volume `/data` n'est pas touché
par un redéploiement.
