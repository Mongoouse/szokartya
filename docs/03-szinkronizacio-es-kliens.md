# Fázis 3 – Szinkronizáció és kliensoldali logika

> Szerver: [`backend/src/sync`](../backend/src/sync), migráció: `20261014000200_sync_word_touch`.
> Kliens: [`mobile/lib`](../mobile/lib) (Flutter 3.47, Dart 3.13, Riverpod 3, sqflite).

## 1. Áttekintés

```
┌──────────── Flutter kliens ────────────┐            ┌──────── NestJS ────────┐
│ UI (Riverpod kontrollerek)             │            │                        │
│   │                                    │            │                        │
│ StudyRepository ──► LocalStore ◄──┐    │  push      │ SyncService            │
│   (helyi SM-2)      (SQLite)      │    │ ─────────► │  ├─ applyEnrollment    │
│                       │ outbox    │    │            │  ├─ applyCardChange    │
│                       ▼           │    │  pull      │  └─ RepetitionService  │
│                    SyncEngine ────┘    │ ◄───────── │      .applyReview      │
└────────────────────────────────────────┘            └───────── PostgreSQL ───┘
```

Minden felhasználói művelet a **helyi adatbázison** fut, és ugyanabban a SQLite-tranzakcióban egy **kimenő sorba (outbox)** is bekerül. A hálózat csak a szinkronizációhoz kell; a tanulás offline is teljes értékű.

## 2. Konfliktuskezelési modell

| Adat | Igazságforrás | Stratégia |
|---|---|---|
| Ütemezési állapot (EF, intervallum, esedékesség, számlálók) | szerver | **Eseményalapú:** a kliens az értékeléseket (review event) küldi, a szerver időrendben újrajátssza őket az SM-2 ütemezővel. A kliens helyi állapota ideiglenes, a pull felülírja. |
| Felhasználói jelzők (felfüggesztés, törlés) | utolsó író | **Időbélyeg-alapú LWW + verzió:** ha a kliens a legfrissebb verzión dolgozott, alkalmazódik; ha közben máshol változott, a későbbi (órakülönbséggel korrigált) időbélyeg nyer. |
| Kártyafelvétel | szerver | A (felhasználó, szó, kártyatípus) természetes kulcs dönt. Ha két eszköz offline ugyanazt veszi fel, a második a szerver azonosítóját kapja vissza (`exists` + `serverProgressId`), és helyben átírja (remap). |
| Szókatalógus | szerver | Csak lefelé szinkronizál, verzió szerint. |

**Miért nem LWW az ütemezésen?** Ha A és B eszköz offline is értékeli ugyanazt a kártyát, LWW-vel az egyik értékelés elveszne, és az ütemezés hibás lenne. Eseményekkel mindkettő megmarad: a végtesztben A „jó” (4), B „nem tudtam” (1) értékelése után a kártya 3 értékeléssel, RELEARNING állapotban konvergált mindkét eszközön.

### Órakülönbség
A push tartalmazza a kliens aktuális óráját (`clientTime`). A szerver kiszámolja az eltérést (`szerver − kliens`), és 2 másodperc fölött minden kliens-időbélyeget (értékelés, módosítás) ezzel korrigál, majd a jelen pillanatra korlátoz. Tesztelve: egy órával késő óra esetén az értékelés a helyes időrendbe került.

## 3. Protokoll

### Pull – `GET /sync/pull?cursor=…&limit=…`
- Három folyam: `progress` (kártyák), `words` (szavak), `reviewLogs` (napló); mindegyik **keyset lapozással** `(updated_at, id)` szerint – nincs kihagyott vagy ismételt sor lapozás közben.
- Törölt tételek **tombstone**-ként jönnek (`deletedAt`), így más eszközön is törlődnek.
- A kurzor átlátszatlan; `hasMore = true` esetén azonnal újra kell hívni.
- **Átfedő ablak:** egy teljesen lefutott pull után a következő 10 másodperccel korábbról indul, mert a PostgreSQL `now()` a tranzakció *kezdete*: egy hosszabb tranzakció a kurzornál korábbi időbélyeggel véglegesedhet. Az ismétlődő sorokat a kliens a `version` alapján szűri.
- Szavak: a gyermektáblák (fordítás, vonzat, példamondat, attribútumok, kategóriák) változása a 3. migráció triggerével **a szülő szó verzióját is lépteti**, így a pull észreveszi. Változás nélküli UPDATE (pl. ismételt seed) nem léptet.

### Push – `POST /sync/push`
```json
{ "clientTime": "…", "deviceId": "…",
  "enrollments": [{ "progressId": "<kliens uuid>", "wordId": "…", "cardType": "RECOGNITION" }],
  "cardChanges": [{ "progressId": "…", "baseVersion": 3, "changedAt": "…", "isSuspended": true }],
  "reviews":     [{ "reviewId": "<kliens uuid>", "progressId": "…", "grade": 4, "responseTimeMs": 2100, "reviewedAt": "…" }] }
```
- Feldolgozási sorrend: felvételek → jelzők → értékelések (`reviewedAt` szerint rendezve).
- **Idempotens:** a `reviewId` és a kártya természetes kulcsa alapján az ismételt köteg nem okoz duplikációt (`duplicate`, `exists`).
- Tételenkénti eredmény: `created/exists/applied/duplicate/conflict/rejected`. Egy hibás tétel nem buktatja el a köteget; infrastruktúra-hiba (pl. adatbázis) viszont igen, hogy a kliens újrapróbálja.
- Az értékelés ugyanazon a kódúton megy, mint a REST végpont (`RepetitionService.applyReview`: `FOR UPDATE` zár, idempotencia, tranzakció).

## 4. Kliens

### Rétegek
| Réteg | Fájl | Feladat |
|---|---|---|
| API | `core/api/api_client.dart` | JSON, egységes hibák (`NetworkException`, `UnauthorizedException`, `HttpStatusException`), 401-nél **egyszeri, single-flight** tokenfrissítés (párhuzamos frissítés a szerveren újrafelhasználásnak minősülne) |
| Tokenek | `core/api/token_store.dart` | Keychain / Keystore (`flutter_secure_storage`) |
| Helyi DB | `data/local/app_database.dart` | sqflite séma verzióalapú migrációval; az esedékes kártyákra a szerverével azonos részleges index |
| DAO | `data/local/local_store.dart` | minden SQL; az írások és az outbox-bejegyzés egy tranzakcióban |
| Ütemező | `domain/sm2_scheduler.dart` | a TypeScript ütemező 1:1 portja |
| Repository | `data/repositories/*` | auth, tanulás (napi sor a szerverével azonos keretekkel) |
| Szinkron | `sync/sync_engine.dart` | push → pull, single-flight, kurzor csak sikeres lap után mentve |
| Állapot | `features/**/…_controller.dart` | Riverpod `Notifier` / `AsyncNotifier` |

### Pull alkalmazása a kliensen
- Régebbi vagy azonos verzió → kihagyás (átfedés duplikátumai).
- Ha a kártyára még **feltöltetlen helyi értékelés** vár, az ütemezési mezőket nem írjuk felül (a helyi haladás nem „ugrik vissza”); a következő push + pull után a szerver állapota már tartalmazza a helyi értékeléseket.
- Ha ugyanarra a (szó, típus) párra helyben más azonosítójú kártya van, azt a szerver azonosítójára írjuk át (kártya, napló és outbox hivatkozások együtt).

### Szinkron ütemezése
- belépés után azonnal; értékelés / felvétel után 5 mp-es kötegeléssel; 5 percenként; lehúzással (pull-to-refresh);
- hálózati hiba → offline jelzés a fejlécben, a munka folytatható;
- kijelentkezés előtt szinkron; ha marad feltöltetlen módosítás, megerősítést kér (a helyi adatok törlődnek).

### Szókártya-állapotgép (`StudySessionController`)
```
loading ──► question ──reveal()──► answer ──grade(q)──► question … ──► finished
```
- **Reakcióidő:** az előlap megjelenésétől a megfordításig mért idő – ezt kapja az ütemező (15 mp fölött a helyes válasz minősége eggyel csökken).
- **Gombok:** Nem tudtam (1) · Nehéz (3) · Jó (4) · Könnyű (5), alattuk az ütemező előnézete (pl. „10 perc”, „4 nap”).
- A tanulási lépcsőn maradt kártyák (1–10 perc) a munkamenet végére visszakerülnek.
- Mentés közben a gombok tiltva (dupla koppintás ellen).
- Kártyatípusok: felismerés (de → hu), felidézés (hu → de), névelő (`___ Tisch` → der). A hátlapon: többes szám, igei alapalakok segédigével, fokozás, vonzatok jelentéssel, példamondat.

## 5. Ellenőrzés

- `flutter analyze` – hibamentes (szigorú típusellenőrzés: `strict-casts`, `strict-inference`, `strict-raw-types`).
- **Ütemező-paritás:** ugyanarra a 16 lépéses sorozatra (felejtés, újratanulás, lassú válasz, késés, korai ismétlés) a TypeScript és a Dart implementáció minden mezője megegyezett (`tool/parity_dump.dart`).
- **Szerver, kétféle eszköz szimulálva (curl):** offline felvétel + időrenden kívül küldött értékelések, ugyanaz a kártya más azonosítóval egy órával késő órájú eszközről (`exists` + leképezés), a köteg ismételt küldése (`exists`/`duplicate`), LWW: régebbi időbélyeg → `conflict`, újabb → `applied`, érvénytelen kurzor → 400.
- **Végponttól végpontig, valódi szerverrel, két Dart klienssel** (külön SQLite adatbázis): A felvesz és értékel → B megkapja; mindkettő offline értékeli ugyanazt a kártyát és felveszi ugyanazt a szintet → szinkron után a két eszköz kártyái, verziói és naplója mezőre pontosan egyeztek, duplikált kártya nélkül, üres outboxszal.
- A fenti forgatókönyvek automatizált tesztté alakítása: Fázis 4.

## 6. Ismert korlátok

- A teljes központi szókatalógus lejön minden eszközre (néhány ezer szónál ez néhány MB; ennél nagyobb katalógusnál szintenkénti előfizetés javasolt).
- A „mai nap” a kliensen az eszköz időzónája, a szerveren a profilban beállított időzóna szerint számít; eltérés esetén a napi keret határa eltolódhat.
- A felfüggesztés/törlés LWW-je kártyaszintű: két eszköz egymással ellentétes, egyidejű offline jelzőmódosításánál a későbbi nyer (ez szándékos).
