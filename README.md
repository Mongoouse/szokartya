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
| 2 | Auth, `RepetitionService`, REST API + OpenAPI | ⏳ |
| 3 | Offline szinkronizáció, Flutter kliens | ⏳ |
| 4 | Egység-, integrációs és szinkron tesztek | ⏳ |

## Könyvtárszerkezet

```
backend/
  prisma/
    schema.prisma          # adatmodell (forrás)
    migrations/            # 1: generált séma, 2: kézi CHECK / index / trigger
    seed.ts                # idempotens mintaadatok
    verify/schema-checks.sql
  prisma.config.ts
docs/
  01-adatbazis-terv.md     # ER-diagram, architekturális döntések, indexstratégia
docker-compose.yml         # fejlesztői PostgreSQL
```

## Indítás (adatbázis)

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
```
