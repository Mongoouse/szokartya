# Fázis 2 – Backend üzleti logika és REST API

> Forrás: [`backend/src`](../backend/src). Élő API-dokumentáció indítás után: `http://localhost:3000/docs`
> (OpenAPI JSON: `/docs/openapi.json`).

## 1. Rétegzett architektúra

```
HTTP ─► Controller ─► Service ─► Repository ─► Prisma ─► PostgreSQL
        (DTO, validáció,  (üzleti szabályok,   (lekérdezések,
         Swagger)          tranzakciók)          indexekhez igazítva)
                              │
                              └─► sm2-scheduler (tiszta függvények, I/O nélkül)
```

| Réteg | Felelősség | Nem csinálja |
|---|---|---|
| **Controller** | útvonal, DTO-validáció, HTTP-kódok, OpenAPI-annotációk | üzleti döntés, adatbázis |
| **Service** | üzleti szabályok, tranzakcióhatárok, napi keretek | SQL / Prisma-hívás |
| **Repository** | minden Prisma-hívás; opcionális `db` paraméter → tranzakcióban is hívható | üzleti döntés |
| **Scheduler** | SM-2 matematika | I/O, óra, keretrendszer |

| Modul | Végpontok |
|---|---|
| `auth` | `POST /auth/register`, `/auth/login`, `/auth/refresh`, `/auth/logout`, `/auth/logout-all` |
| `users` | `GET /users/me`, `PATCH /users/me` (időzóna, napi limitek) |
| `words` | `GET /words` (keresés, szűrés), `GET /words/:id`, `GET /categories` |
| `repetition` | `GET /study/queue`, `POST /study/cards`, `POST /study/cards/:id/reviews`, `PATCH /study/cards/:id`, `GET /study/stats` |
| — | `GET /health` (adatbázis-kapcsolattal) |

Minden útvonal `/api/v1` előtaggal érhető el.

## 2. Hitelesítés

### D1 – Access + refresh token
- **Access token:** HS256 JWT, 15 perc, állapotmentesen ellenőrizve (`JwtAuthGuard`, adatbázis nélkül). Rövid élettartam → visszavonási lista nélkül is elfogadható kockázat.
- **Refresh token:** 256 bites véletlen, *átlátszatlan* érték (nem JWT – úgyis adatbázisból kell ellenőrizni), csak a SHA-256 hash-e tárolódik. Magas entrópiájú értéknél a lassú hash nem ad többletvédelmet, a gyors hash viszont egyedi indexszel kereshető.
- A refresh token a válasz törzsében érkezik (nem cookie-ban): a Flutter kliens biztonságos tárolóban (Keychain / Keystore) tartja; mobil kliensnél nincs CSRF-kitettség.

### D2 – Rotáció és lopásdetektálás (OAuth 2.0 Security BCP)
Minden `/auth/refresh` új tokenpárt ad, a régit visszavonja, és ugyanabba a `family_id`-ba sorolja. Egy **már lecserélt** token bemutatása lopásra utal → a teljes család visszavonódik; a támadó és a jogos kliens is újra bejelentkezik. Két párhuzamos frissítés közül feltételes `UPDATE … WHERE revoked_at IS NULL` dönti el, melyik nyer.

### D3 – Jelszavak
- argon2id (OWASP minimum: 19 MiB, t=2, p=1). Ha a paraméterek később szigorodnak, a hash a következő sikeres belépéskor frissül (`needsRehash`).
- Jelszószabály: NIST SP 800-63B szerint hossz (10–128), összetételi szabályok nélkül.
- Felhasználó-felsorolás ellen: nem létező e-mailnél is lefut egy argon2 ellenőrzés (azonos válaszidő), az üzenet mindkét esetben azonos.

### D4 – Egyéb védelmek
- **Deny by default:** a JWT guard globális, csak `@Public()` végpont nyitott.
- **Rate limit:** auth végpontokon IP-nként 10 kérés/perc, egyébként 300/perc (`@nestjs/throttler`).
- **Validáció:** `whitelist` + `forbidNonWhitelisted` – ismeretlen mező (pl. `isAdmin`) 400-as hibát ad.
- **Konfiguráció:** induláskor validált (`env.validation.ts`); 32 karakternél rövidebb JWT titokkal az alkalmazás el sem indul.
- **Hibák:** a Prisma-hibák (`P2002`, `P2025`, …) HTTP-kódra képeződnek, belső részletek nélkül.

## 3. Adaptív ismétlés

### D5 – Ütemező: módosított SM-2 (`scheduler/sm2-scheduler.ts`)
Tiszta függvények, az időpont is paraméter → determinisztikus, keretrendszer nélkül tesztelhető, és a Flutter kliens 1:1-ben portolhatja (offline ütemezés, Fázis 3).

| Állapot | Válasz | Átmenet |
|---|---|---|
| NEW / LEARNING | 0–2 | LEARNING, 1. lépcső (1 perc) |
| | 3–4 | következő lépcső (1 → 10 perc); az utolsó után REVIEW, 1 nap |
| | 5 | azonnal REVIEW, 4 nap |
| REVIEW | 3–5 | `I' = max(I+1, round(I_eff · EF'))`; a 2. sikeres ismétlés után min. 6 nap |
| | 0–2 | felejtés: `lapses+1`, `I' = I · 0,5`, RELEARNING (10 perc) |
| RELEARNING | 0–2 | vissza az 1. lépcsőre |
| | 3–5 | REVIEW a csökkentett intervallummal |

- **Ease factor:** `EF' = EF + (0,1 − (5−q)(0,08 + (5−q)·0,02))`, [1,3; 5,0] közé szorítva; csak a REVIEW fázisban változik (a kezdeti tanulási hibák nem a kártya nehézségét jelzik).
- **Reakcióidő:** helyes, de 15 s-nál lassabb válasz minősége eggyel csökken (4→3, 5→4).
- **Késés / korai ismétlés:** késésnél a többletidő fele beszámít (`I_eff = I + (t − I)/2`); korai ismétlés nem csökkenti, de nem is emeli az intervallumot.
- **Felejtési görbe:** `R(t) = e^(−t/S)`; a stabilitás `S = I / −ln(0,9)`, vagyis esedékességkor a becsült felidézési valószínűség 90%.
- **Metrikák a kártyán:** `lapses`, `total/correct_reviews` (hibagyakoriság), `avg_response_ms` (exponenciális mozgóátlag), `stability_days`.

Szimuláció (minden válasz 4-es, időben): 1 perc → 1 → 6 → 15 → 38 → 95 nap.

### D6 – Napi sor (`GET /study/queue`)
A „nap” a felhasználó időzónájában értendő (`localDayBounds`, nyári időszámítás-váltással is helyes).

| Lista | Feltétel | Keret |
|---|---|---|
| `learning` | LEARNING/RELEARNING, esedékes a nap végéig | nincs (elkezdett tanulást be kell fejezni) |
| `reviews` | REVIEW, esedékes a nap végéig | `daily_review_limit` − mai ismétlések |
| `newCards` | NEW, felvételi sorrendben | `daily_new_cards_limit` − ma bevezetett újak |

A mai felhasználást a `review_logs` alapján számoljuk (`state_before`), nem külön számlálóból – így nincs szinkronizálandó extra állapot. A lekérdezések a Fázis 1 részleges indexeit használják.

### D7 – Értékelés tranzakciókezeléssel (`POST /study/cards/:id/reviews`)
Egyetlen adatbázis-tranzakcióban:
1. **`SELECT … FOR UPDATE`** a kártya során – egy kártya párhuzamos értékelései (két eszköz, dupla kattintás) sorosan futnak, nincs „lost update”. A zár soronkénti, más kártyát nem blokkol.
2. **Idempotencia:** a `reviewId`-t a kliens generálja; ha már létezik a naplóban, a szerver a jelenlegi állapotot adja vissza (`duplicate: true`) újraszámolás nélkül. Ez teszi biztonságossá az offline sor újraküldését (Fázis 3).
3. Ütemezés, majd `user_progress` UPDATE + `review_logs` INSERT. Bármely hiba esetén minden visszagörgetődik.

Az értékelés időpontja a kliensé (offline értékelésnél ez a valós), de normalizált: 5 percnél többel jövőbeli idő → szerveridő; az előző értékelésnél korábbi idő → az előző értékelés ideje.

### Új végpontok (Fázis 5)
| Végpont | Feladat |
|---|---|
| `POST /words`, `DELETE /words/:id` | saját szó felvétele (idempotens a kliens azonosítójával) és törlése |
| `PATCH /users/me` – `targetRetention`, `catalogLevels` | célmegtartás (0,70–0,97) és a szinkronizált CEFR szintek |
| `GET /users/me/export` | minden saját adat JSON-ban (GDPR) |
| `DELETE /users/me` | jelszóval megerősített fióktörlés |

Részletek: [05-tovabbfejlesztes.md](05-tovabbfejlesztes.md).

## 4. Futtatás

```bash
cd backend
cp .env.example .env            # JWT_ACCESS_SECRET-et cserélni!
npm install
npm run db:migrate && npm run db:seed
npm run start:dev               # http://localhost:3000/docs
```

Gyors próba:
```bash
curl -X POST localhost:3000/api/v1/auth/register -H 'content-type: application/json' \
  -d '{"email":"anna@example.hu","password":"helyes-lo-elem-tuzgolyo"}'
```

## 5. Ellenőrzés (Fázis 2)

Kézi végponttól végpontig próba lokális PostgreSQL-lel, a futó API-n: regisztráció, duplikált e-mail (409, kisbetű/nagybetű-függetlenül), hibás jelszó (401), ismeretlen mező (400), token nélküli hívás (401), refresh-rotáció, régi token újrafelhasználása → család visszavonva, keresés magyar fordításra, kártyafelvétel (idempotens; GENDER csak nemmel rendelkező főnévhez), napi sor, értékelési sorozat (NEW → LEARNING → REVIEW → RELEARNING), duplikált `reviewId`, lassú válasz korrekciója, felfüggesztett kártya (409), statisztika, OpenAPI-dokumentum. Automatizált egység- és integrációs tesztek: Fázis 4.
