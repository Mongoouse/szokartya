# Fázis 4 – Tesztelés és minőségbiztosítás

## 1. Tesztpiramis

| Szint | Hol | Eszköz | Darab | Futási idő |
|---|---|---|---|---|
| Adatbázis-invariánsok | `backend/prisma/verify/schema-checks.sql` | psql | 17 állítás | < 1 s |
| Backend egységtesztek | `backend/src/**/*.spec.ts` | Jest 30 + ts-jest | 70 | ~6 s |
| Backend integrációs tesztek | `backend/test/*.e2e-spec.ts` | Jest + supertest + PostgreSQL | 73 | ~9 s |
| Kliens egység- és komponenstesztek | `mobile/test/{domain,data,core,sync,features}` | flutter_test + sqflite_common_ffi | 59 | ~3 s |
| Többeszközös végponttól végpontig | `mobile/test/e2e` | flutter_test + valódi backend | 4 forgatókönyv | ~4 s |

**Lefedettség (backend):** az ütemező, a kurzor és az időzóna-modulok egységtesztjei 99% utasítás- / 96% ághoz jutnak; az integrációs tesztek a teljes backend 93%-át (utasítás) futtatják.

## 2. Futtatás

```bash
# Backend
cd backend
npm test                      # egységtesztek
npm run test:e2e              # integrációs tesztek – a szokartya_test adatbázist ÚJRAÉPÍTI
npm run test:cov              # lefedettség

# Kliens
cd mobile
flutter test                  # e2e nélkül (az e2e csomag backend nélkül kihagyódik)
SZOKARTYA_E2E_API=http://localhost:3000/api/v1 flutter test --tags e2e
```

Az integrációs tesztek adatbázisa: `TEST_DATABASE_URL` (alapértelmezés: `…/szokartya_test`). A globális setup a sémát **a migrációkból** építi újra (ugyanaz a kód, ami élesben fut), majd betölti a szókatalógust. Biztonsági zár: csak `_test` végű nevű adatbázison fut, így egy elírt környezeti változó sem törölhet fejlesztői vagy éles adatot.

A CI (`.github/workflows/ci.yml`) mindhárom szintet futtatja: backend (PostgreSQL service konténerrel), mobil, és a kettő közötti szinkron e2e.

## 3. Ütemező – határesetek és pontosság

### Közös golden fájl
`shared/fixtures/sm2-golden.json`: 11 értékelési sorozat abszolút időbélyegekkel, minden lépés utáni **teljes** állapottal. A TypeScript és a Dart tesztkészlet is ehhez hasonlít, így a két implementáció bármely eltérése mindkét oldalon hibát ad. A fájlt a `backend/scripts/generate-sm2-golden.ts` generálja (`npm run test:golden:update` – csak szándékos algoritmusváltozás után, a diff átnézésével).

| Eset | Mit rögzít |
|---|---|
| `happy_path` | 1 perc → 10 perc → 1 → 6 → 15 → 38 → 95 → 238 nap |
| `lapse_and_relearn` | felejtés: lapses, intervallum-felezés, EF-csökkenés, újratanulás |
| `slow_responses` | 15 s-os küszöb (15 000 ms még nem, 15 001 már lassú) |
| `late_reviews` / `early_reviews` | késés fele beszámít; korai ismétlés nem csökkent és nem ugrat |
| `easy_new_card`, `relearning_easy_exit` | „könnyű” válasz azonnali kiléptetése |
| `learning_failures` | tanulási fázisban az EF nem változik |
| `ease_floor` | EF alsó korlát 1.30 |
| `ease_ceiling_and_max_interval` | EF felső korlát 5.00, intervallum-korlát 36 500 nap |
| `out_of_schedule_minutes` | perc pontosságú, lépcső előtti / utáni értékelés |

### Célzott egységtesztek (`sm2-scheduler.spec.ts`, `sm2_scheduler_test.dart`)
EF-képlet mind a hat minőségre; korlátok; kerekítési sodródás 50 lépésen; érvénytelen minőség / reakcióidő (`RangeError`); a bemenet változatlansága; számlálók (lassú válasz is helyes); reakcióidő mozgóátlag; a stabilitás úgy, hogy esedékességkor R = 90%; konfigurációs határesetek (lépcsők nélkül).

Időzóna (`time-zone.spec.ts`): normál nap, helyi/UTC napváltás eltérése, **nyári időszámítás kezdete (23 órás nap)** és **vége (25 órás nap)**, negatív eltolású zóna.

## 4. Integrációs tesztek

### Hitelesítés (`auth.e2e-spec.ts`)
- Regisztráció: e-mail normalizálás, argon2id hash, a refresh token csak hash-ként tárolódik, a válaszban nincs jelszóadat; foglalt e-mail (kis-/nagybetű-független) → 409; hat validációs hiba, köztük ismeretlen mező (mass assignment) → 400.
- Belépés: azonos válasz hibás jelszóra és nem létező fiókra; törölt fiók; **újrahashelés** gyengébb paraméterű hash esetén.
- Access token: hiányzó, hamis aláírású, lejárt, rossz típusú token, refresh token Bearerként → 401.
- Rotáció: régi token visszavonva, lánc (`replaced_by_id`) és család helyes; **újrafelhasználás → a teljes család visszavonva**; **5 párhuzamos frissítésből pontosan 1 sikeres**; lejárt / ismeretlen / törölt fiókhoz tartozó token.
- Kijelentkezés: idempotens; `logout-all` minden eszközt kiléptet, más felhasználót nem.
- Rate limit: külön alkalmazáspéldányban, bekapcsolt korláttal: a 11. belépési kísérlet 429.

### Tanulási haladás (`progress.e2e-spec.ts`)
- Felvétel: névelőkártya csak nemmel rendelkező főnévhez; idempotencia; ismeretlen szavak jelzése; törölt kártya visszaállítása előzménnyel.
- Értékelés: állapot, napló (előtte / utána) és verzió perzisztálása; **7 lépéses sorozat után a szerver állapota bitre egyezik a tiszta ütemezőével**; idempotencia; más kártyához tartozó `reviewId` → 409 változás nélkül.
- **Konkurencia:** 10 párhuzamos értékelés egy kártyán → `total_reviews = 10`, `version = 11` (nincs elveszett frissítés); 5 párhuzamos azonos `reviewId` → pontosan 1 alkalmazódik.
- **Atomicitás:** ideiglenes trigger buktatja a napló beszúrását → 500, és a kártya állapota, verziója változatlan.
- Időbélyeg-normalizálás (jövőbeli / sorrenden kívüli kliensidő), felfüggesztés, validáció, 404.
- Napi keretek (új kártya és ismétlés), a sor nyelvtani adatai, statisztika, felhasználók elkülönítése.

### Szinkronizáció – többeszközös adatintegritás (`sync.e2e-spec.ts`)
| Eset | Elvárás |
|---|---|
| Teljes pull 4-es lapokkal | a katalógus minden szava pontosan egyszer |
| Kártyák lapozása **azonos `updated_at`-tel** | id szerinti holtverseny-bontás: nincs kihagyás / ismétlés |
| Inkrementális pull | csak a változás; az átfedő ablak ismétlései azonos verzióval |
| Gyermekrekord (fordítás) változása | a szó újra lejön, nagyobb verzióval |
| Törlés | tombstone (`deletedAt`) |
| Időrenden kívül érkező értékelések | időrendben alkalmazva (NEW → LEARNING → REVIEW) |
| Teljes köteg ismételt küldése | `exists` / `duplicate`, az állapot változatlan |
| Két eszköz ugyanazt veszi fel offline | 1 kártya; B megkapja a szerver azonosítóját; mindkét értékelés megmarad, eszközazonosítóval |
| Két eszköz értékelése egy kártyán | mindkettő megmarad |
| Egy órával késő óra | `clockOffsetMs ≈ 1 h`, az értékelés a valós időre kerül |
| LWW | aktuális verzió → applied; elavult + régebbi → conflict; elavult + újabb → applied; jelző nem írja felül az ütemezést |
| **Regresszió:** korábban módosító, de előbb szinkronizáló eszköz | a később *módosító* nyer |
| Elkülönítés | idegen kártyára küldött felvétel / módosítás / értékelés elutasítva |
| Kötegméret | 500 fölött 400 |
| Két eszköz kurzorral | A változásai B-nél, B felfüggesztése A-nál megjelenik |

## 5. Kliens tesztek

| Fájl | Tartalom |
|---|---|
| `domain/sm2_scheduler_test.dart` | határesetek + a közös golden fájl |
| `data/local_store_test.dart` | outbox atomicitás (duplikált napló → a kártya sem változik), verziókezelés, **feltöltetlen helyi értékelés védelme a pull ellen**, azonosító-leképezés minden hivatkozással, tombstone, napi keret más eszköz naplójából |
| `core/api_client_test.dart` | Bearer, UTF-8; 401 → frissítés → megismétlés; **5 párhuzamos 401 → 1 frissítés**; sikertelen frissítés → kiléptetés; hibaüzenetek; hálózati hiba / időtúllépés |
| `sync/sync_engine_test.dart` | hamis szerverrel: köteg, kiürítés, `exists` → remap, elutasított felvétel → törlés, **hálózati hiba után nincs adatvesztés**, lapozás, érvénytelen kurzor → teljes újraszinkron, single-flight |
| `features/study_session_controller_test.dart` | állapotgép: betöltés, keret, megfordítás + előnézet, értékelés megfordítás előtt tiltva, tanulási kártya visszasorolása, napvégi határ, **dupla koppintás → 1 értékelés**, mért reakcióidő a naplóban |
| `e2e/multi_device_sync_test.dart` | két valódi kliens (külön SQLite, kikapcsolható hálózat) egy backend ellen: munka átvitele; ugyanaz a kártya offline mindkét eszközön; ugyanazok a szavak offline felvéve; felfüggesztési ütközés. Mindegyik után: **a két eszköz kártyái, verziói és naplója mezőre egyezik, üres outboxszal.** |

## 6. A tesztek által talált hibák

| Hiba | Hogyan derült ki | Javítás |
|---|---|---|
| **LWW rossz időponthoz hasonlított:** ha B korábban módosított (offline), de előbb szinkronizált, A későbbi módosítása elveszett, mert a szerver az `updated_at`-hez (B *érkezési* idejéhez) hasonlított | e2e: „felfüggesztési ütközés” | 4. migráció: `user_progress.flags_changed_at` – a módosítás tényleges (órakülönbséggel korrigált) ideje; regressziós integrációs teszt |
| Korábbi fázisokban: korai ismétlés 6 napra ugratott; a gyermektábla no-op UPDATE-je léptette a szó verzióját | kézi végponttól végpontig próbák | javítva; most automatizált tesztek védik |

Tesztkörnyezeti tanulság (dokumentálva a `test_support.dart`-ban): az `inMemoryDatabasePath` több eszköz szimulálására alkalmatlan, mert a sqflite azonos útvonalra ugyanazt a példányt adja vissza – ezért minden „eszköz” külön ideiglenes fájlt kap.
