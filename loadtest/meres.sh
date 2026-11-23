#!/usr/bin/env bash
# A teljes mérés: 3 futás, mindegyik előtt friss seed (azonos kiinduló állapot,
# és a napi ismétlési keret sem fogy el a futások között), végül átlagolás.
#
#   ./loadtest/meres.sh              # alapértékek: 200 felhasználó, 1500 kártya, 8 napló, 50 VU
#   VUS=100 FUTASOK=3 ./loadtest/meres.sh
#
# Előfeltétel: fut az API (docker compose … --profile api up), és a gépen
# telepítve van a k6 és a Node.js (a seedhez: cd backend && npm ci).
set -euo pipefail
cd "$(dirname "$0")/.."

FUTASOK=${FUTASOK:-3}
VUS=${VUS:-50}
LT_USERS=${LT_USERS:-200}
LT_CARDS=${LT_CARDS:-1500}
LT_REVIEWS=${LT_REVIEWS:-8}
export DATABASE_URL=${DATABASE_URL:-postgresql://szokartya:szokartya@localhost:5432/szokartya?schema=public}
OUT_DIR=loadtest/eredmenyek
mkdir -p "$OUT_DIR"

for i in $(seq 1 "$FUTASOK"); do
  echo "=== $i. futás: seed ($LT_USERS × $LT_CARDS × $LT_REVIEWS) ==="
  (cd backend && npm run -s loadtest:seed -- --users "$LT_USERS" --cards "$LT_CARDS" --reviews "$LT_REVIEWS")
  echo "=== $i. futás: k6 ($VUS VU) ==="
  # A küszöbök túllépése (99-es kilépési kód) ne szakítsa meg a sorozatot.
  k6 run -q -e RUN="$i" -e VUS="$VUS" -e USERS="$LT_USERS" -e OUT_DIR="$OUT_DIR" loadtest/k6-valaszido.js || true
  sleep 10
done

files=()
for i in $(seq 1 "$FUTASOK"); do files+=("$OUT_DIR/futas-$i.json"); done
node loadtest/osszesit.mjs "${files[@]}" | tee "$OUT_DIR/osszesites.md"
