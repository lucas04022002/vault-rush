# syntax=docker/dockerfile:1

# Vault Rush — une seule image : Express sert l'API et le client construit.
#
# Node 24 : `node:sqlite` et l'exécution directe du TypeScript (type stripping)
# y sont tous deux sans drapeau. Il n'y a donc aucune étape de compilation côté
# serveur — l'image embarque les sources `.ts` telles quelles.

# ---------------------------------------------------------------- dépendances
FROM node:24-alpine AS deps
WORKDIR /app
# Les manifestes d'abord : la couche d'installation est réutilisée tant que les
# dépendances ne bougent pas.
COPY package.json package-lock.json ./
COPY client/package.json client/
COPY server/package.json server/
RUN npm ci

# --------------------------------------------------------------- construction
# Repart de `deps` : les node_modules (racine et workspaces) sont déjà en place.
FROM deps AS build
WORKDIR /app
COPY . .
RUN npm run build --workspace=client

# ---------------------------------------------------- dépendances de production
FROM deps AS prod-deps
WORKDIR /app
RUN npm prune --omit=dev

# ------------------------------------------------------------------- exécution
FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3001 \
    DB_PATH=/data/vault.db

COPY --from=prod-deps /app/node_modules ./node_modules
COPY package.json ./
# Le serveur : sources TypeScript, migrations et manifeste (aucune compilation).
COPY server/package.json ./server/package.json
COPY server/migrations ./server/migrations
COPY server/src ./server/src
# Le client construit : `server/src/app.ts` le cherche en `../../client/dist`.
COPY --from=build /app/client/dist ./client/dist

# La base vit sur un volume : l'image reste jetable, les parties non.
RUN mkdir -p /data && chown -R node:node /data
VOLUME /data

# Jamais root.
USER node
EXPOSE 3001

# Alpine n'embarque ni curl ni wget complet : la sonde passe par Node lui-même.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/api/health').then(r=>r.json()).then(b=>process.exit(b.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "--disable-warning=ExperimentalWarning", "server/src/app.ts"]
