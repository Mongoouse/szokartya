# Fázis 5 – Továbbfejlesztés

A Fázis 4 utáni fejlesztési javaslatok megvalósítása: bővebb szókincs, új kártyatípusok, saját szavak, felhasználói beállítások, statisztika, adatvédelem és üzemeltetés.

## 1. Szókincs és importálás

- `backend/prisma/data/wortschatz.txt`: ~450 szó A1–B1 szinten, 21 tematikus kategóriában, soronként egy szó tömör formátumban (a fájl fejléce írja le). Főnévnél névelő és többes szám, igénél jelen idő / Präteritum / segédige + Partizip II és vonzat, melléknévnél fokozás.
- `prisma/vocabulary.ts` – tiszta függvényes feldolgozó, hibás sornál a sorszámmal együtt jelez (egységtesztek: `vocabulary.spec.ts`).
- `prisma/seed-writer.ts` – a seed és az importáló közös, idempotens írója (UUID v5 a természetes kulcsból, egy szó egy tranzakció).
- Saját lista importálása: `npm run db:import -- <fájl> [--dry-run]`.

## 2. Új kártyatípusok

| Típus | Előlap → hátlap | Mikor jön létre |
|---|---|---|
| `PLURAL` | der Tisch → die Tische | megszámlálható főnév ismert többes számmal |
| `VERB_FORMS` | fahren → fährt – fuhr – ist gefahren | ige igei attribútumokkal |
| `VALENCY` | warten ___ → warten auf + Akk. | szó legalább egy vonzattal |

A szerver (`words/card-applicability.ts`) és a kliens (`CardType.appliesTo`) ugyanazokat a szabályokat alkalmazza; nem alkalmazható típusnál a felvétel `<típus>_not_applicable` okkal elutasul. Az új szavaknál létrehozott típusok a Beállításokban választhatók (alapértelmezés: felismerés, felidézés, névelő, többes szám).

**Gépelt válasz** a felidézés (magyar → német) kártyán: `domain/answer_check.dart` normalizál (kisbetű, írásjelek, ä→ae, ß→ss), a hiányzó névelő és az egy elütés „majdnem”, a rossz névelő „hibás”. Az eredmény a javasolt értékelő gombot emeli ki; a döntés a felhasználóé marad.

**Kiejtés:** az eszköz beépített felolvasója (`flutter_tts`, de-DE), a `Speaker` interfész mögött (tesztben cserélhető). Felidézés kártyán csak a hátlapon szól, hogy ne árulja el a választ.

## 3. Saját szavak

- `POST /words` és a push `customWords` mezője ugyanazt a `CreateCustomWordDto`-t fogadja; a kliens által adott azonosítóval **idempotens** (ismételt küldés → `exists`, más tulajdonos azonosítója → `id_conflict`).
- A push-on belül a saját szavak a kártyafelvételek előtt dolgozódnak fel, így egy offline felvett szó és kártyái egy kérésben feltölthetők.
- A saját szó csak a tulajdonosának látszik és szinkronizálódik; `DELETE /words/:id` a szót és kártyáit puhán törli (tombstone a többi eszköznek).
- A kliens offline is felveszi (szó + kártyák + outbox egy tranzakcióban); elutasításkor a szó és kártyái helyben is törlődnek.

## 4. Felhasználói beállítások

| Beállítás | Hatás |
|---|---|
| Célmegtartás (0,70–0,97, alapértelmezés 0,90) | Az intervallum szorzója `ln(R) / ln(0,9)`: 0,95 → ×0,49, 0,80 → ×2,12. A minimális növekedés (I + 1) megmarad; a stabilitásbecslés nem függ tőle. 0,90-nél a golden fájl változatlan. |
| Katalógusszintek | A pull csak a választott CEFR szintek központi szavait hozza (plusz a szint nélkülieket, a már felvett szavakat és a saját szavakat). Változáskor a kliens törli a kurzort, és teljes újraszinkront futtat. |
| Időzóna | A kliens is a **profil** időzónájával számolja a „mai napot” (`timezone` csomag), ugyanúgy, mint a szerver – az eszköz időzónája nem számít. |
| Napi keretek, név | mint eddig, most már az appból is állítható |

## 5. Statisztika, böngészés

- **Statisztika** a helyi naplóból (offline is): napi aktivitás 30 napra (helyes/összes), pontosság, átlagos felidézési idő, sorozat (egymást követő tanulási napok a profil időzónája szerint), 14 napos előrejelzés, kártyák állapot és típus szerint, a legtöbbször elfelejtett kártyák.
- **Szókereső:** részleges egyezés németül vagy magyarul, szint-, kategória- és „saját” szűrő, egyes szavak felvétele. A helyi adatbázis 2. verziója ehhez `search_text` oszlopot és `word_categories` táblát kapott; a migráció a meglévő szavakat a tárolt payloadból tölti fel.
- **Témakörök:** a kezdőképernyőn kategóriánként is felvehetők a szavak.

## 6. Szinkron és kijelentkezés

- Szinkron az app előtérbe kerülésekor és a hálózat visszatértekor is (`connectivity_plus`). Bezárt appnál nem fut; ehhez platformszintű ütemező (WorkManager / BGTaskScheduler) kellene, ami a jelenlegi kötegelt + periodikus modell mellett nem indokolt.
- **Kijelentkezés adatvesztés nélkül:** ha offline maradt feltöltetlen módosítás, a helyi adatok megmaradnak, és ugyanannak a felhasználónak a következő belépésekor feltöltődnek. Más fiókkal belépve törlődnek (közös eszköz).
- **Talált és javított hiba:** a push típusonként külön, 200-as kötegekben küldött. Ha 200-nál több felvétel várt, egy értékelés megelőzhette a saját kártyája felvételét, és a szerver elutasította – az értékelés elveszett. A bővebb szókincs miatt az e2e teszt hozta elő; most a későbbi típusok csak az előbbiek teljes feltöltése után mennek (regressziós teszt: `sync_engine_test.dart`).

## 7. Adatvédelem (GDPR)

- `GET /users/me/export` – minden saját adat (profil, kártyák, napló, saját szavak) JSON-ban, letöltendő fájlként; az appból megosztható.
- `DELETE /users/me` `{ "password": "…" }` – jelszóval megerősített végleges törlés; a kapcsolódó sorok kaszkádolva törlődnek, a kliens a helyi adatokat is törli.
- A lejárt refresh tokeneket naponta (03:00) takarítja egy ütemezett feladat; a visszavont, de még le nem járt tokenek a lopásdetektáláshoz megmaradnak.

## 8. Üzemeltetés és kódminőség

- `backend/Dockerfile` (többlépcsős build), `docker compose --profile api up` – adatbázis, migráció + seed, API. A CI is elindítja és ellenőrzi a `/health` végpontot.
- Biztonsági fejlécek (`helmet`), strukturált JSON naplózás (`nestjs-pino`, jelszó / token / Authorization kitakarva; `LOG_LEVEL`, `LOG_PRETTY`).
- ESLint (typescript-eslint, típusinformációval) és Prettier; a CI mindkettőt futtatja.

## 9. SM-2 és FSRS összehasonlítás

`npm run eval:schedulers -- [--user <email>] [--json]` a valódi értékelési naplón visszamenőleg összeveti a két modell előrejelzését (melyik becsülte jobban, hogy a felhasználó emlékezni fog): log-loss, kalibrációs RMSE (10 sáv), AUC, és egy állandó alapmodell. Csak az előző értékelés után legalább 1 nappal történt értékeléseket pontozza (a tanulási lépcsők nem hosszú távú felidézések). Az FSRS-4.5 az alapértelmezett súlyokkal fut, felhasználónkénti optimalizálás nélkül – a szakdolgozati értékeléshez valós használati adat kell; szintetikus adatból készült összevetés félrevezető lenne, ezért nincs ilyen mód.
