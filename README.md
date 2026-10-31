# Szókártya

Keresztplatformos, offline-first szókincsfejlesztő alkalmazás német nyelvtanulóknak, szókártyás módszerrel és adaptív ismétlésütemezéssel (módosított SM-2).

| Réteg | Technológia |
|---|---|
| Backend | NestJS (TypeScript), rétegzett architektúra (Controller / Service / Repository) |
| Adatbázis | PostgreSQL 16 + Prisma ORM |
| Kliens | Flutter (Dart), offline-first helyi tárolással |
| Kommunikáció | REST + JSON, JWT (access + refresh token), argon2id |

## Állapot

| Fázis | Tartalom | Állapot |
|---|---|---|
| 1 | Adatbázis-séma, migrációk, indexek | ✅ kész – [docs/01-adatbazis-terv.md](docs/01-adatbazis-terv.md) |
| 2 | Auth, `RepetitionService`, REST API + OpenAPI | ✅ kész – [docs/02-backend.md](docs/02-backend.md) |
| 3 | Offline szinkronizáció, Flutter kliens | ✅ kész – [docs/03-szinkronizacio-es-kliens.md](docs/03-szinkronizacio-es-kliens.md) |
| 4 | Egység-, integrációs és szinkron tesztek, CI | ✅ kész – [docs/04-teszteles.md](docs/04-teszteles.md) |
| 5 | Bővebb szókincs, nyelvtani kártyák, saját szavak, beállítások, statisztika, GDPR, Docker | ✅ kész – [docs/05-tovabbfejlesztes.md](docs/05-tovabbfejlesztes.md) |
| 6 | SM-2 ↔ személyre illesztett FSRS: kísérleti összevetés, statisztikai próbák | ✅ kész – [docs/06-utemezok-kiserlet.md](docs/06-utemezok-kiserlet.md) |

## Könyvtárszerkezet

```
backend/
  src/
    auth/                  # regisztráció, belépés, refresh token rotáció
    users/                 # profil, tanulási beállítások
    words/                 # szókatalógus, keresés, kategóriák
    repetition/            # napi sor, értékelés, statisztika
      scheduler/           # módosított SM-2 (tiszta függvények)
    sync/                  # offline szinkronizáció (pull / push)
    common/ config/ prisma/
  prisma/
    schema.prisma          # adatmodell (forrás)
    migrations/            # 1: generált séma, 2: kézi CHECK / index / trigger
    seed.ts                # idempotens seed (kategóriák + data/wortschatz.txt)
    data/wortschatz.txt    # ~450 szavas szólista tömör formátumban
    import-vocabulary.ts   # saját szólista importálása (npm run db:import)
    vocab/b2/              # ~1550 szavas B2 szókincs (névelővel, vonzattal; formátum: vocab/dsl.ts)
    verify/schema-checks.sql
  scripts/                 # SM-2 vs FSRS összehasonlítás (npm run eval:schedulers)
  Dockerfile
  prisma.config.ts
mobile/                    # Flutter kliens – lásd mobile/README.md
  lib/core/ domain/ data/ sync/ features/
docs/
  01-adatbazis-terv.md     # ER-diagram, architekturális döntések, indexstratégia
  02-backend.md            # rétegek, hitelesítés, SM-2 ütemező, tranzakciók
  03-szinkronizacio-es-kliens.md  # offline-first szinkron, konfliktuskezelés, Flutter kliens
  04-teszteles.md          # tesztstratégia, lefedettség, talált hibák
  05-tovabbfejlesztes.md   # új funkciók: kártyatípusok, saját szavak, beállítások, GDPR
shared/fixtures/           # közös SM-2 golden referencia (TS + Dart tesztek)
.github/workflows/ci.yml   # CI: backend, mobil, többeszközös szinkron e2e
docker-compose.yml         # PostgreSQL; --profile api: migráció + seed + API konténerben
```

## Indítás

Előfeltétel: Node.js ≥ 20, Docker Desktop (vagy helyi PostgreSQL ≥ 15), a klienshez Flutter ≥ 3.47 (Dart ≥ 3.13).

A parancsok Windows PowerShellben, macOS-en és Linuxon is ugyanígy működnek. **Egyenként** futtasd őket: PowerShellben a `;` akkor is futtatja a következő parancsot, ha az előző hibával állt le.

```bash
# 1. Adatbázis (a Docker Desktopnak futnia kell)
docker compose up -d db
docker compose ps                 # várd meg, amíg a db konténer állapota „healthy”

# 2. Backend
cd backend
cp .env.example .env              # PowerShell: Copy-Item .env.example .env
npm install                       # a Prisma klienst is legenerálja (postinstall)
npm run db:migrate                # migrációk alkalmazása
npm run db:seed                   # szókincs – várt kimenet: „Seed kész: 32 kategória, 2029 szó.”
npm run db:verify                 # séma-ellenőrzés: kényszerek, triggerek, indexhasználat
npm run start:dev                 # API: http://localhost:3000/api/v1 – Swagger: http://localhost:3000/docs

# 3. Mobilkliens (Android emulátor a helyi backenddel)
cd ../mobile
flutter pub get
flutter run
```

A teljes backend konténerben is indítható (Node.js nélkül): `docker compose --profile api up -d`, ekkor az API a `http://localhost:3000/api/v1` címen fut.

### Gyakori hibák

| Hibaüzenet | Ok | Megoldás |
|---|---|---|
| `P1001: Can't reach database server at localhost:5432` | nem fut a PostgreSQL | indítsd el a Docker Desktopot, majd `docker compose up -d db` |
| `@prisma/client did not initialize yet` | a Prisma kliens nincs legenerálva (pl. `npm install` a `postinstall` bevezetése előtt futott) | `npx prisma generate` (vagy `npm install` újra) |
| `port is already allocated` a `docker compose up`-nál | Windowsra telepített PostgreSQL foglalja az 5432-es portot | állítsd le (Szolgáltatások → postgresql → Leállítás), vagy a `docker-compose.yml`-ben `"5433:5432"`, és a `.env`-ben `localhost:5433` |
| `Too Many Requests` (429) belépésnél | rate limit: percenként 10 hitelesítési kérés | várj egy percet |

## Tesztek

```bash
cd backend
npm test                          # egységtesztek
npm run lint                      # ESLint (npm run format: Prettier)
npm run test:e2e                  # integrációs tesztek – a szokartya_test adatbázist ÚJRAÉPÍTI (fusson a db konténer)

cd ../mobile
flutter test                      # kliens (a többeszközös e2e csomag backend nélkül kihagyódik)
```

Többeszközös szinkronteszt valódi backenddel (a backend fusson: `npm run start:dev`):

```bash
# macOS / Linux
SZOKARTYA_E2E_API=http://localhost:3000/api/v1 flutter test --tags e2e
```

```powershell
# Windows PowerShell
$env:SZOKARTYA_E2E_API = "http://localhost:3000/api/v1"
flutter test --tags e2e
```
