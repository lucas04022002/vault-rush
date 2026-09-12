#!/usr/bin/env bash
# Scénario de bout en bout contre un serveur Vault Rush déjà démarré.
#
# Il ne vérifie pas seulement que « ça répond » : il refait l'arithmétique de
# l'argent (mise débitée, gain crédité, plafond du solde) et met à l'épreuve
# les deux gardes qui protègent une partie — une seule partie active, et une
# étape jouée une seule fois — plus la garde d'origine (CSRF).
#
# Usage : BASE_URL=http://127.0.0.1:3001 bash .github/scripts/smoke.sh
set -euo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:3001}"
JAR="$(mktemp)"
BODY="$(mktemp)"
trap 'rm -f "$JAR" "$BODY"' EXIT

# Origine légitime : celle que le navigateur aurait envoyée.
ORIGIN="${ORIGIN:-$BASE_URL}"
USER_NAME="ci_$(date +%s)_$RANDOM"
PASSWORD="motdepasse-ci-2026"

echo "== Cible : $BASE_URL"

# --- utilitaires ------------------------------------------------------------

# get <chemin> -> code HTTP, corps dans $BODY
get() {
  curl -sS -b "$JAR" -c "$JAR" -o "$BODY" -w '%{http_code}' "$BASE_URL$1"
}

# post <chemin> <json> [origine] -> code HTTP, corps dans $BODY
post() {
  curl -sS -b "$JAR" -c "$JAR" -o "$BODY" -w '%{http_code}' \
    -H 'Content-Type: application/json' \
    -H "Origin: ${3:-$ORIGIN}" \
    -X POST --data "$2" "$BASE_URL$1"
}

fail() {
  echo "ÉCHEC : $1"
  echo "  corps : $(cat "$BODY")"
  exit 1
}

expect() { # expect <attendu> <obtenu> <message>
  [ "$1" = "$2" ] || fail "$3 (attendu $1, obtenu $2)"
  echo "  ok — $3"
}

# Lecture du JSON : `jq` s'il est là (les runners GitHub l'ont), sinon Node —
# le script tourne ainsi tel quel sur un poste de développement.
if command -v jq >/dev/null 2>&1; then
  json() { jq -r "$1" < "$BODY"; }
else
  json() {
    node -e '
      const fs = require("node:fs");
      const [filtre, fichier] = process.argv.slice(1);
      const data = JSON.parse(fs.readFileSync(fichier, "utf8"));
      const [chemin, ...ops] = filtre.split("|").map((s) => s.trim());
      let v = chemin === "." ? data
        : chemin.replace(/^\./, "").split(".").reduce((o, k) => (o == null ? o : o[k]), data);
      if (ops.includes("length")) v = v == null ? 0 : v.length;
      process.stdout.write(v === null || v === undefined ? "null" : String(v));
    ' "$1" "$BODY"
  }
fi

# --- 1. santé ---------------------------------------------------------------

echo "== Attente de /api/health"
for i in $(seq 1 30); do
  code="$(curl -sS -o "$BODY" -w '%{http_code}' "$BASE_URL/api/health" || true)"
  if [ "$code" = "200" ]; then break; fi
  sleep 1
  if [ "$i" = "30" ]; then fail "/api/health n'a pas répondu en 30 s"; fi
done
expect "true" "$(json '.ok')" "/api/health répond { ok: true }"
expect "true" "$(json '.db')" "/api/health voit la base"

# --- 2. le client construit est bien servi ----------------------------------

echo "== Page d'accueil"
code="$(get /)"
expect "200" "$code" "GET / répond 200"
grep -q '<div id="root">' "$BODY" || fail "GET / ne contient pas <div id=\"root\">"
echo "  ok — GET / sert le client construit"

# --- 3. inscription ---------------------------------------------------------

echo "== Inscription"
code="$(post /api/auth/register "{\"username\":\"$USER_NAME\",\"password\":\"$PASSWORD\"}")"
expect "201" "$code" "inscription 201"
grep -q 'vr_session' "$JAR" || fail "aucun cookie vr_session posé"
echo "  ok — cookie de session posé"

code="$(get /api/wallet)"
expect "200" "$code" "GET /api/wallet 200"
SOLDE_DEPART="$(json '.balanceCents')"
expect "100000" "$SOLDE_DEPART" "solde de départ = 100 000 centimes"

# --- 4. une partie complète de Laser Grid -----------------------------------

echo "== Partie Laser Grid (mise « 12,50 », mode calme)"
code="$(post /api/games/laser-grid/start '{"betCoins":"12,50","mode":"calme"}')"
expect "201" "$code" "start 201"
ROUND_ID="$(json '.round.id')"
expect "1250" "$(json '.round.betCents')" "mise convertie en 1250 centimes"
expect "0" "$(json '.round.step')" "partie à l'étape 0"

code="$(get /api/games/laser-grid/current)"
expect "200" "$code" "current 200"
expect "$ROUND_ID" "$(json '.round.id')" "current renvoie la même partie"

code="$(post /api/games/laser-grid/play "{\"roundId\":$ROUND_ID,\"step\":0,\"option\":0}")"
expect "200" "$code" "play 200"
OUTCOME="$(json '.outcome')"
REVEALED="$(json '.revealed | length')"
expect "4" "$REVEALED" "les 4 cases sont révélées après le choix"
echo "  issue de l'étape : $OUTCOME"

if [ "$OUTCOME" = "safe" ]; then
  code="$(post /api/games/laser-grid/cashout "{\"roundId\":$ROUND_ID}")"
  expect "200" "$code" "cashout 200"
  PAYOUT="$(json '.round.payoutCents')"
  expect "cashed_out" "$(json '.round.status')" "partie encaissée"
  ATTENDU=$((100000 - 1250 + PAYOUT))
  RAISON="solde = 100000 − 1250 + $PAYOUT (gain encaissé)"
else
  ATTENDU=98750
  RAISON="solde = 100000 − 1250 (partie perdue)"
fi

code="$(get /api/wallet)"
expect "200" "$code" "GET /api/wallet 200"
expect "$ATTENDU" "$(json '.balanceCents')" "$RAISON"

# --- 5. une seule partie active à la fois -----------------------------------

echo "== Gardes de partie"
code="$(post /api/games/laser-grid/start '{"betCoins":"12,50","mode":"calme"}')"
expect "201" "$code" "nouvelle partie 201"
ROUND2="$(json '.round.id')"

code="$(post /api/games/laser-grid/start '{"betCoins":"12,50","mode":"calme"}')"
expect "409" "$code" "second start refusé"
expect "round_active" "$(json '.error')" "erreur round_active"
expect "$ROUND2" "$(json '.round.id')" "la partie en cours est renvoyée"

# --- 6. une étape ne se joue qu'une fois ------------------------------------

code="$(post /api/games/laser-grid/play "{\"roundId\":$ROUND2,\"step\":5,\"option\":0}")"
expect "409" "$code" "étape incohérente refusée"
expect "step_mismatch" "$(json '.error')" "erreur step_mismatch"
expect "0" "$(json '.round.step')" "l'état courant est renvoyé"

# --- 7. garde d'origine (CSRF) ----------------------------------------------

echo "== Garde d'origine"
code="$(post /api/games/laser-grid/start '{"betCoins":"12,50","mode":"calme"}' 'https://evil.example')"
expect "403" "$code" "origine étrangère refusée"
expect "bad_origin" "$(json '.error')" "erreur bad_origin"

echo
echo "Scénario complet : OK"
