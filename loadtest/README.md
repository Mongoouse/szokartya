# Válaszidő-mérés terhelés alatt

A szakdolgozat 7.7 alfejezetéhez és az NFK3 / RQ4 nem funkcionális követelményhez
tartozó mérés eszközei: a napi kártyasor, az értékelés és a szinkronizáció
végpontjainak válaszideje (medián, p95) és hibaaránya valószerű terhelés alatt.

| Fájl | Szerep |
|---|---|
| `backend/scripts/loadtest/seed-loadtest.ts` | Adatállomány: n felhasználó × m kártya × k értékelési napló (`npm run loadtest:seed`) |
| `loadtest/k6-valaszido.js` | A k6 terhelési szkript (bemelegítés + 5 perc mért terhelés) |
| `loadtest/docker-compose.loadtest.yml` | Compose-kiegészítés: rate limit kikapcsolva |
| `loadtest/meres.sh` | A teljes mérés: 3 futás, mindegyik előtt friss seed, végül átlagolás |
| `loadtest/osszesit.mjs` | A futások átlaga Markdown táblázatként |

## Előfeltételek

- Docker (Docker Desktop) és Node.js 20+
- k6: Windows `winget install k6 --source winget`, macOS `brew install k6`,
  Linux: <https://grafana.com/docs/k6/latest/set-up/install-k6/>
- A backend függőségei a seedhez: `cd backend && npm ci`

## Futtatás

```bash
# 1. A teljes stack (db + migráció + katalógus seed + API) rate limit nélkül
docker compose -f docker-compose.yml -f loadtest/docker-compose.loadtest.yml --profile api up --build -d

# 2. A teljes mérés (3 × [seed ~1-2 perc + k6 ~6 perc]) ≈ 25 perc
./loadtest/meres.sh
```

Windows alatt a `meres.sh` Git Bash-ből vagy WSL-ből fut. Kézzel, lépésenként:

```bash
cd backend
npm run loadtest:seed -- --users 200 --cards 1500 --reviews 8
cd ..
k6 run -e RUN=1 -e VUS=50 loadtest/k6-valaszido.js
# … ugyanígy RUN=2 és RUN=3, mindegyik előtt újra a seed …
node loadtest/osszesit.mjs loadtest/eredmenyek/futas-1.json loadtest/eredmenyek/futas-2.json loadtest/eredmenyek/futas-3.json
```

Az eredmények a `loadtest/eredmenyek/` mappába kerülnek (gitignore-ban):
`futas-N.json` (végpontonkénti összesítés), `futas-N-nyers.json` (a k6 teljes
összesítője) és `osszesites.md` (a dolgozatba illeszthető táblázat).

Gyors próba (kb. 1 perc, az eredmény nem mérésre való):

```bash
k6 run -e RUN=proba -e WARMUP=10s -e RAMP=10s -e HOLD=30s -e VUS=20 loadtest/k6-valaszido.js
```

## Mit mér pontosan

**Adatállomány (alapértékek).** 200 felhasználó, felhasználónként 1500 kártya,
tanult kártyánként 8 értékelési napló: ~300 000 `user_progress` és ~2,2 millió
`review_logs` sor, a teljes adatbázis kb. 0,9 GB (ismételt seed után a felszabadított, de újrahasznosított hely miatt kb. 1,5 GB). Ez kb. egy év rendszeres
használatnak felel meg: napi 20 új kártyás keretnél egy év alatt legfeljebb 7300
kártya vehető fel, de a kihagyott napok és a 8% még nem tanult kártya miatt az
1500 egy szorgalmas, de nem maximális felhasználót jelent; a módosított SM-2
mellett egy kártya egy év alatt jellemzően 6–10 ismétlést kap. Az állapotok
megoszlása: 8% NEW, 3% LEARNING, 2% RELEARNING, 87% REVIEW, az intervallumok
log-egyenletesen 1–365 nap között, így felhasználónként a napi ismétlési keretet
(200) meghaladó számú kártya esedékes. Az üres adatbázison mért válaszidő
félrevezetően jó lenne, mert az indexek és a lekérdezéstervező viselkedése a
sorok számától függ.

**Terhelési profil.** 30 s bemelegítés 10 VU-val (a JIT, a kapcsolatkészlet és az
adatbázis-gyorsítótár feltöltése; nem számít bele), majd 5 perc mért fázis:
30 s lineáris felfutás 50 VU-ig, utána 4 perc 30 s állandó terhelés. Minden VU
saját seedelt felhasználó; a VU-k egy munkamenetet ismételnek:

1. `GET /sync/pull` (inkrementális szinkron),
2. `GET /study/queue`,
3. 10 × `POST /study/cards/:id/reviews`, kártyánként 2–6 s gondolkodási idővel,
4. `POST /sync/push` 5 offline értékeléssel (a mobilkliens kimenő sora),
5. `GET /sync/pull`,
6. 5–15 s szünet.

Ez 50 VU mellett kb. 14 kérés/s, ami nagyjából több száz egyidejűleg aktív
tanulónak felel meg. A VU-szám a `VUS` változóval állítható (pl. 100, 200 a
telítődési pont kereséséhez).

**Eredmény.** Végpontonként medián, p95, p99 és hibaarány a mért fázisból, három
futás átlaga. A k6 a p95-öt és a hibaarányt küszöbként is ellenőrzi
(`P95_MS`, alapértelmezés 200 ms; hibaarány < 1%).

**Korlátok.** A k6 és a szerver ugyanazon a gépen fut, így a mérés nem
tartalmaz hálózati késleltetést, és a terhelésgenerátor is a szerver
erőforrásait használja. A rate limit ki van kapcsolva (lásd fent).
