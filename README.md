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
| 4 | Egység-, integrációs és szinkron tesztek | ⏳ |

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
    seed.ts                # idempotens mintaadatok
    verify/schema-checks.sql
  prisma.config.ts
mobile/                    # Flutter kliens – lásd mobile/README.md
  lib/core/ domain/ data/ sync/ features/
docs/
  01-adatbazis-terv.md     # ER-diagram, architekturális döntések, indexstratégia
  02-backend.md            # rétegek, hitelesítés, SM-2 ütemező, tranzakciók
  03-szinkronizacio-es-kliens.md  # offline-first szinkron, konfliktuskezelés, Flutter kliens
docker-compose.yml         # fejlesztői PostgreSQL
```

## Indítás

Előfeltétel: Node.js ≥ 20, Docker (vagy helyi PostgreSQL ≥ 15).

```bash
docker compose up -d db
cd backend
cp .env.example .env
npm install
npm run db:migrate        # migrációk alkalmazása
npm run db:seed           # mintaszavak (der Tisch, warten auf + Akk., …)

# séma-ellenőrzés (kényszerek, triggerek, indexhasználat); a .env-et be kell tölteni:
set -a && . ./.env && set +a && npm run db:verify

npm run start:dev         # API: http://localhost:3000/api/v1 – Swagger: http://localhost:3000/docs

# Mobilkliens (Android emulátor a helyi backenddel)
cd ../mobile && flutter pub get && flutter run
```

Előfeltétel a klienshez: Flutter ≥ 3.47 (Dart ≥ 3.13).
