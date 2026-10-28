# Az SM-2 és a személyre illesztett FSRS kísérleti összevetése

Ez a fejezet a szakdolgozat kísérleti részének módszertanát, a megvalósítást és a szimulált tanulókon kapott eredményeket írja le. A leírás úgy készült, hogy szakaszai kis átdolgozással a dolgozatba illeszthetők legyenek. A kód a `backend/scripts/experiment/` könyvtárban van, a futtatás egyetlen parancs (lásd [Reprodukálás](#9-reprodukálás)).

## 1. Kutatási kérdés és hipotézisek

**Kutatási kérdés.** A felhasználó saját értékelési naplójára illesztett FSRS memóriamodell pontosabban jósolja-e meg, hogy a felhasználó a következő ismétléskor emlékezni fog-e a szóra, mint a rendszer jelenlegi ütemezőjének (módosított SM-2) felejtési modellje?

A „pontosabban” két, egymástól független tulajdonságot jelent:

- **kalibráció**: ha a modell 80%-ot mond, a felhasználó az esetek kb. 80%-ában emlékezzen;
- **megkülönböztetés (diszkrimináció)**: a modell a később elfelejtett szavaknak adjon kisebb valószínűséget, mint a felidézetteknek.

**Hipotézisek** (a mérés előtt rögzítve):

| | Nullhipotézis (H0) | Ellenhipotézis (H1) | Mérőszám |
|---|---|---|---|
| **H1 – elsődleges** | A felhasználónkénti log-veszteség különbsége (FSRS személyre illesztve − SM-2) 0-ra szimmetrikus eloszlású. | A különbség eloszlása nem 0 körül szimmetrikus. | log-veszteség |
| H2 | ugyanez az alapsúlyú FSRS és az SM-2 között | | log-veszteség, RMSE, AUC |
| H3 | ugyanez a személyre illesztett és az alapsúlyú FSRS között (hoz-e valamit az illesztés) | | log-veszteség, RMSE, AUC |
| H4 | ugyanez a személyre illesztett FSRS és az utólag kalibrált SM-2 között | | log-veszteség, RMSE, AUC |
| H5 | ugyanez a személyre illesztett FSRS és a felhasználó átlagos felidézési arányát mondó alapvonal között | | log-veszteség, RMSE, AUC |

Szignifikanciaszint: α = 0,05, kétoldali próbák, mérőszámonként Holm–Bonferroni-korrekcióval az öt összehasonlítás családján.

## 2. Adatok

### 2.1. Valós napló

A rendszer minden értékelést a `review_logs` táblába ír: felhasználó, kártya (`progress_id`), minőség (0–5), reakcióidő, időpont. Ebből kártyánként időrendi előzmény áll elő (`backend/scripts/review-log-source.ts`). Értelmes eredményhez felhasználónként néhány száz, legalább egynapos szünet utáni értékelés kell, ami napi használat mellett néhány hét. A dolgozat leadásáig ennyi valós adat nem gyűlik össze, ezért az eredmények szimulált tanulókon készültek (2.2.), a keretrendszer pedig változtatás nélkül fut valós naplón is (`--source db`).

### 2.2. Szimulált tanulók

A szimulált tanuló pontosan úgy használja az alkalmazást, ahogy egy valódi felhasználó (`learner-simulation.ts`):

- a szavakat a rendszer **saját SM-2 ütemezője** szerint ismétli, a tanulási lépcsőkkel (1 és 10 perc) együtt, vagyis a napló szerkezete megegyezik az éles naplóéval;
- nem minden nap nyitja meg az alkalmazást (tanulónként 55–95% eséllyel), ezért az esedékes kártyák egy része késve kerül sorra – ez valósághű, és változatosabbá teszi az ismétlési időközöket;
- naponta 6–16 új szót vesz fel, összesen 150–300-at; a szimuláció 120 napig tart;
- egy szót az első találkozáskor 5–30% eséllyel már ismer;
- a felidézés sikerét egy **„valódi” memóriamodell** sorsolja, amelyet a vizsgált modellek nem ismernek; a minőséget (3/4/5, illetve 0/1/2) és a reakcióidőt a felidézés sikeréből és erősségéből sorsolja.

A generáló memóriamodell választása eleve kedvezhet valamelyik vizsgált modellnek: ha az adatot FSRS generálja, az FSRS nyilván jól illeszkedik rá. Ezért a kísérlet **három, egymástól független elméletből származó** generáló modellel fut (érzékenységvizsgálat):

| Forgatókönyv | Generáló modell | Kinek kedvez? |
|---|---|---|
| `actr` (**fő**) | ACT-R deklaratív memória térközhatással (Pavlik & Anderson, 2005): aktiváció m(t) = ln Σⱼ (t − tⱼ)^(−dⱼ), bomlási ráta dⱼ = c·e^(m(tⱼ)) + a, felidézés P = 1 / (1 + e^((τ − m)/s)). Hatványfüggvény szerinti felejtés; a rövid szünet utáni (tömbösített) ismétlés gyorsabban bomlik. | egyik vizsgált modell családjába sem tartozik |
| `hlr` | Felezési idős regresszió (Settles & Meeder, 2016): P = 2^(−Δ/h), h = 2^(θ₀ + θ₊n₊ + θ₋n₋). Exponenciális felejtés. | az SM-2 exponenciális görbéjének |
| `fsrs` | FSRS-4.5 tanulónként perturbált súlyokkal. | az FSRS-nek (felső korlát) |

Mindhárom modellben van **tanulónkénti** (képesség, N(0; 0,5)) és **szónkénti** (nehézség, N(0; 1)) heterogenitás, mert a személyre illesztés csak akkor hozhat valamit, ha a tanulók különböznek. A paraméterek úgy vannak beállítva, hogy a legalább egynapos szünet utáni felidézési arány a valós rendszerekben megszokott 75–90% közé essen.

Mivel a szimulációban ismert a valódi felidézési valószínűség, egy hatodik „modell”, az **orákulum** is mér: ez a valódi p-t mondja. Az orákulum vesztesége az adott adaton elérhető legjobb érték (a kimenetek véletlenségéből adódó, csökkenthetetlen hiba), így megmutatja, mekkora a modellek és az elméleti optimum közötti rés.

## 3. Modellek

| Modell | Előrejelzés | Illesztett paraméter |
|---|---|---|
| **SM-2** | R = exp(−t / S), ahol S a futó ütemező stabilitásbecslése (`scheduleReview` újrajátszásából) | – |
| **SM-2, utólag kalibrálva** | R = exp(−k · t / S), azaz p^k | 1 (k, felhasználónként, a tanító halmazon) |
| **FSRS-4.5, alapsúlyok** | R = (1 + 19/81 · t / S)^(−0,5), az FSRS sok millió értékelésen illesztett alapsúlyaival | – |
| **FSRS-4.5, személyre illesztve** | ugyanez, a felhasználó tanító halmazára illesztett súlyokkal | 17 (felhasználónként) |
| **Átlag-alapvonal** | a felhasználó tanító halmazbeli felidézési aránya, minden szóra ugyanaz | 1 |
| **Orákulum** (csak szimuláció) | a valódi felidézési valószínűség | – |

Az **utólag kalibrált SM-2** azért szerepel, hogy szétválassza a két lehetséges magyarázatot: ha az FSRS csak azért jobb, mert az SM-2 rosszul skálázott (például rendszeresen túlbecsüli a felidézést), azt egyetlen paraméter is kijavítja. A kalibráció monoton transzformáció, ezért a felhasználónkénti rangsort (AUC) nem változtatja – ami ezen felül marad különbség, az a modellek megkülönböztető képességéből ered.

Az FSRS személyre illesztése (`fsrs-optimizer.ts`, a PR #2-ből): az átlagos log-veszteség minimalizálása L2-regularizációval az alapsúlyok felé (λ = 1 / mintaszám), Adam optimalizálóval, a referencia-implementáció paramétertartományain belül; 100 tanító minta alatt nincs illesztés.

## 4. Kiértékelési protokoll

**Mintába kerülő értékelések.** Csak a legalább egynapos szünet utáni értékelések számítanak (a perces tanulási lépcsőknél minden modell ~1-et mondana). Minden ilyen értékelés előtt minden modell a *korábbi* értékelések alapján jósol, és ezt vetjük össze a tényleges kimenettel (minőség ≥ 3 → felidézte).

**Időbeli felosztás felhasználónként.** A felhasználó mintáinak időrendjében az első 80% a tanító, az utolsó 20% a teszthalmaz. Minden illesztett paraméter (FSRS-súlyok, kalibrációs kitevő, alapvonal) csak a tanító halmazt látja; minden mérőszám csak a teszthalmazon készül. Az időbeli (és nem véletlen) felosztás azért fontos, mert élesben is mindig a múltból jósolunk a jövőre; véletlen felosztásnál a modell a jövőbeli értékelésekből tanulhatna (adatszivárgás). A szivárgás hiányát egységteszt ellenőrzi (a határ utáni kimenetek megfordítása nem változtat a súlyokon).

**Kizárás.** A 30-nál kevesebb teszt mintájú felhasználók kimaradnak, mert náluk a felhasználónkénti mérőszám túl zajos.

## 5. Mérőszámok

Jelölés: pᵢ az előre jelzett felidézési valószínűség, yᵢ ∈ {0, 1} a kimenet, N a minták száma.

| Mérőszám | Képlet | Mit mér |
|---|---|---|
| **Log-veszteség** (elsődleges) | −(1/N) Σ [yᵢ ln pᵢ + (1 − yᵢ) ln(1 − pᵢ)] | a valószínűségi előrejelzés összesített minősége (szigorúan helyes pontozási szabály) |
| **Brier-pontszám** | (1/N) Σ (pᵢ − yᵢ)² | ugyanez négyzetes hibával |
| **RMSE (sávos)** | √( Σ_b n_b (p̄_b − ȳ_b)² / N ), 20 egyenlő sáv | kalibráció (az srs-benchmark mérőszáma) |
| **ECE** | Σ_b (n_b / N) · \|p̄_b − ȳ_b\|, 10 egyenlő sáv | kalibráció (Naeini et al., 2015) |
| **AUC** | P(p_felidézett > p_elfelejtett), holtversenynél ½ | megkülönböztetés, a skálázástól független |
| **Kalibrációs görbe** | sávonként (p̄_b, ȳ_b), ȳ_b 95%-os Wilson-intervallummal | a kalibráció grafikusan |

A sávos kalibrációs mérőszámok (RMSE, ECE) felhasználónként kevés mintán torzítottak: az állandó előrejelzés (alapvonal) minden mintája egy sávba esik, így ott a hiba csak az átlagok eltérése. Ezért ezeket elsősorban az összesített (pooled) értékükkel érdemes értelmezni. A log-veszteség az elsődleges végpont, mert a kalibrációt és a megkülönböztetést együtt bünteti, és a modellek illesztése is erre történik.

## 6. Statisztikai elemzés

**Vizsgálati egység: a felhasználó.** Egy felhasználó mintái nem függetlenek (ugyanaz az ember, ugyanazok a szavak), a felhasználók viszont igen. Ha a mintaszintű párokra futtatnánk próbát, a több ezer nem független minta mesterségesen kicsi p-értékeket adna. Ezért minden mérőszámot felhasználónként számolunk, és a próbák a felhasználónkénti párokon (dᵤ = mérőszám_a(u) − mérőszám_b(u)) futnak.

**Wilcoxon-féle előjeles rangpróba** (Wilcoxon, 1945) a dᵤ különbségekre, kétoldalian. Nem feltételez normalitást (a felhasználónkénti log-veszteségek eloszlása ferde lehet), csak a különbségek szimmetriáját. 25-nél kevesebb nem nulla különbségnél és holtverseny nélkül egzakt eloszlást, egyébként holtverseny- és folytonossági korrekcióval normális közelítést használ – ugyanúgy, mint az R `wilcox.test` függvénye, amellyel az implementáció egységtesztben egyezik. **Hatásméret:** az illesztett párok rang-biszeriális korrelációja, r = (W⁺ − W⁻) / (W⁺ + W⁻) ∈ [−1; 1].

**Bootstrap konfidenciaintervallumok** (Efron & Tibshirani, 1993), 2000 újramintával, percentilis módszerrel:

- a felhasználónkénti különbségek *átlagára*: a felhasználók visszatevéses újramintavételezésével;
- az összes teszt mintán számolt (*összesített*) mérőszámok különbségére: **klaszter-bootstrappel**, azaz itt is felhasználókat (és azok összes mintáját) mintavételezünk újra, így a felhasználón belüli összefüggés az intervallumban is megjelenik.

**Többszörös összehasonlítás.** Mérőszámonként öt összehasonlítás fut (H1–H5); a p-értékeket Holm–Bonferroni szerint korrigáljuk (Holm, 1979), ami a családonkénti elsőfajú hibát α-n tartja.

**Reprodukálhatóság.** Minden véletlen elem (szimuláció, bootstrap) seedelt álvéletlen-generátorból (mulberry32) származik, a tanulók saját, a címkéjükből származtatott magot kapnak. Ugyanazzal a maggal és paraméterekkel a kimenet bájtra azonos (egységteszt ellenőrzi).

## 7. Eredmények szimulált tanulókon

A teljes futás (`npm run experiment:schedulers:docs`, mag: 42) forgatókönyvenként 40 szimulált tanulót, 120 nap használatot és ~10–12 ezer teszt mintát ad (tanító: ~39–46 ezer); egyetlen felhasználó sem esett ki. A futási idő egy szálon kb. 9 perc, ennek nagy része a felhasználónkénti FSRS-illesztés. Minden táblázat és ábra a [`docs/kiserlet/szimulacio/`](kiserlet/szimulacio/README.md) könyvtárban van; a számok onnan származnak.

### 7.1. Elsődleges végpont (H1)

Log-veszteség, felhasználónkénti különbség: **FSRS (személyre illesztve) − SM-2**; negatív érték = az FSRS a jobb.

| Forgatókönyv | átlagos különbség [95% bootstrap CI] | medián | az FSRS jobb | Wilcoxon p (Holm) | r |
|---|---|---:|---:|---:|---:|
| ACT-R (fő) | −0,0374 [−0,0511; −0,0248] | −0,0319 | 80% | < 0,001 | −0,80 |
| HLR | −0,0173 [−0,0320; −0,0045] | +0,0001 | 48% | 0,337 | −0,25 |
| FSRS | −0,0366 [−0,0434; −0,0296] | −0,0344 | 95% | < 0,001 | −0,99 |

A fő (ACT-R) és az FSRS-forgatókönyvben a nullhipotézist elvetjük: a személyre illesztett FSRS a felhasználók többségénél kisebb log-veszteséget ad, nagy hatásmérettel. A HLR-forgatókönyvben az átlagos különbség konfidenciaintervalluma nem tartalmazza a nullát, a Wilcoxon-próba mégsem szignifikáns, és a medián gyakorlatilag nulla: néhány felhasználónál az FSRS sokkal jobb, a többségnél nincs különbség. Az átlag és a medián (illetve a bootstrap és a rangpróba) ilyen eltérése ferde, heterogén hatásra utal – ezért érdemes mindkettőt közölni.

### 7.2. Honnan ered a különbség? (H2–H5)

**Összesített mérőszámok, fő forgatókönyv (ACT-R),** teszthalmaz, n = 10 064, tényleges felidézési arány 79,0%:

| Modell | log-veszteség ↓ | RMSE ↓ | AUC ↑ | ECE ↓ | átl. előrejelzés |
|---|---:|---:|---:|---:|---:|
| SM-2 | 0,5619 | 0,1053 | 0,4844 | 0,1048 | 0,895 |
| SM-2 (utólag kalibrálva) | 0,5164 | 0,0453 | 0,5691 | 0,0424 | 0,830 |
| FSRS-4.5 (alapsúlyok) | 0,5543 | 0,0923 | 0,5173 | 0,0816 | 0,842 |
| FSRS-4.5 (személyre illesztve) | 0,5174 | 0,0478 | 0,5762 | 0,0359 | 0,825 |
| Átlag-alapvonal | 0,5094 | 0,0215 | 0,5771 | 0,0171 | 0,803 |
| Orákulum (valódi p) | 0,4670 | 0,0194 | 0,7106 | 0,0101 | 0,782 |

![Kalibrációs görbe, ACT-R](kiserlet/szimulacio/actr/abrak/kalibracio.svg)

![Páros különbségek, log-veszteség, ACT-R](kiserlet/szimulacio/actr/abrak/kulonbsegek-logLoss.svg)

Megfigyelések:

1. **Az SM-2 rendszeresen túlbecsüli a felidézést.** Átlagosan 89–90%-ot jósol, miközben a tényleges arány 79–87% (mindhárom forgatókönyvben). Ez a konstrukcióból adódik: az SM-2 a stabilitást úgy becsüli, hogy az esedékességkor a célmegtartás (90%) teljesüljön, és ezt nem korrigálja a tényleges eredmények alapján. A kalibrációs görbén az SM-2 pontjai az átló alatt vannak.
2. **A fő forgatókönyvben a nyereség jórészt kalibráció.** Az egyetlen paraméterrel utólag kalibrált SM-2 log-vesztesége gyakorlatilag megegyezik a személyre illesztett FSRS-ével (különbség +0,0019 [−0,0015; 0,0057], p (Holm) = 0,63). A megkülönböztetésben viszont az FSRS jobb: a felhasználónkénti AUC átlagosan +0,063-mal nagyobb [0,043; 0,083], p (Holm) < 0,001 (a kalibráció az AUC-t nem változtatja).
3. **A felhasználó átlagos felidézési aránya erős alapvonal.** ACT-R-adaton a felhasználónként állandó előrejelzés log-vesztesége kisebb, mint a személyre illesztett FSRS-é (+0,0089 [0,0049; 0,0125], p (Holm) = 0,001). Ennek oka, hogy az adatot az SM-2 ütemezte: az ismétlések jellemzően hasonló felidézési valószínűségnél történnek, így kevés a megkülönböztethető változékonyság, és a modellek finomabb (de pontatlan) előrejelzése többet árt, mint használ. A HLR- és az FSRS-forgatókönyvben az FSRS minden felhasználónál legyőzi az alapvonalat.
4. **A személyre illesztés ott hoz sokat, ahol az alapsúlyok rosszul írják le a tanulót.** Az alapsúlyú FSRS az SM-2-nél csak az FSRS-adaton szignifikánsan jobb log-veszteségben; az illesztés az alapsúlyokhoz képest ACT-R-en (−0,033, a felhasználók 100%-ánál jobb) és HLR-en (−0,008, 73%) javít szignifikánsan, FSRS-adaton viszont nem (−0,0016, p = 0,14), mert ott az alapsúlyok már közel vannak a valódihoz.
5. **Időbeli sodródás.** HLR-adaton a felidézési arány a használat során nő, ezért a tanító időszakra illesztett kalibráció és alapvonal a tesztidőszakban alábecsül: az utólag kalibrált SM-2 itt *rosszabb* a nyers SM-2-nél. Ez az időbeli felosztás nélkül rejtve maradna.
6. **Rés az orákulumhoz.** ACT-R-en a legjobb modell és a valódi valószínűség közötti log-veszteség-rés ~0,04–0,05, az AUC-ban ~0,13; FSRS-adaton viszont a személyre illesztett FSRS gyakorlatilag eléri az orákulumot (0,3959 vs. 0,3937). A rés tehát a modell-specifikáció hibájából ered (a valódi felejtés nem FSRS-alakú), nem az illesztésből.

### 7.3. Következtetés a szimuláció alapján

A személyre illesztett FSRS mindhárom generáló modellnél átlagosan jobban jósolja a felidézést, mint az SM-2, és ez a fő forgatókönyvben statisztikailag is szignifikáns (H1). A nyereség két forrásból ered: (1) az SM-2 rendszeres túlbecslésének kiküszöböléséből, amit egy paraméteres utólagos kalibráció is elér, és (2) jobb megkülönböztetésből (magasabb AUC), amit a kalibráció nem pótol. Gyakorlati következmény a rendszerre: a legolcsóbb javítás az SM-2 stabilitásbecslésének felhasználónkénti kalibrálása; az FSRS-re váltás a megkülönböztető képesség miatt indokolt, ha a valós napló ugyanezt mutatja. A végső állításhoz a kísérletet valós naplón kell megismételni (`--source db`).

## 8. Érvényességi korlátok

- **Szimulált adat.** A szimuláció a módszert mutatja be és ellenőrzi, nem a valós tanulók viselkedését. Az eredmény erősen függ a generáló modelltől, ezért szerepel három forgatókönyv; a dolgozat végső állításához valós napló kell.
- **Az adatot az SM-2 ütemezte.** A naplóban az ismétlések időpontját az SM-2 választotta, ezért az ismétlések jellemzően hasonló felidézési valószínűségnél történnek, ami minden modell AUC-ját csökkenti, és erős alapvonalat ad. Ez nem torzítja az összevetést (minden modell ugyanazokon a mintákon jósol), de korlátozza az általánosíthatóságot más ütemezőkre.
- **Előrejelzés ≠ ütemezés.** A kísérlet azt méri, melyik modell jósol jobban, nem azt, hogy melyik ütemezés mellett tanul hatékonyabban a felhasználó. Utóbbihoz randomizált kontrollált kísérlet kellene (felhasználók véletlen besorolása SM-2 vagy FSRS ütemezésre), ami a dolgozat keretein túlmutat.
- **Időbeli sodródás.** Ha a felhasználó viselkedése változik (például egyre jobban tanul), a tanító időszak arányai nem érvényesek a tesztidőszakra; ez a tanító halmazra illesztett modelleket (kalibráció, alapvonal) is érinti.
- **Kevés felhasználó.** A próbák ereje a felhasználók számától függ; valós adaton néhány tucat felhasználó már elég lehet a közepes hatásokhoz, de egy-két felhasználónál csak leíró eredmény adható.

## 9. Reprodukálás

```bash
cd backend
npm ci

# A dolgozat ábrái és táblázatai (3 forgatókönyv × 40 szimulált tanuló, kb. 9 perc):
npm run experiment:schedulers:docs          # → docs/kiserlet/szimulacio/

# Kisebb, gyors futás saját paraméterekkel:
npm run experiment:schedulers -- --memory actr --learners 10 --bootstrap 500 --out /tmp/kiserlet

# Valós napló (DATABASE_URL a .env-ből; csak olvas):
npm run experiment:schedulers -- --source db [--user <uuid>] --out ../docs/kiserlet/valos
```

| Kapcsoló | Alapérték | Jelentés |
|---|---|---|
| `--source` | `sim` | `sim` (szimulált tanulók) vagy `db` (valós napló) |
| `--memory` | `actr,hlr,fsrs` | a szimuláció generáló modelljei |
| `--learners`, `--days` | 40, 120 | szimulált tanulók száma, használati napok |
| `--seed` | 42 | álvéletlen mag |
| `--test` | 0,2 | a teszthalmaz aránya (időben utolsó rész) |
| `--min-test` | 30 | ennél kevesebb teszt mintájú felhasználó kimarad |
| `--bootstrap` | 2000 | bootstrap újraminták száma |
| `--iterations` | 150 | az FSRS-illesztés Adam-lépéseinek száma |

**Kimenet** forgatókönyvenként: `README.md` (táblázatok, ábrák), `eredmeny.json` (teljes eredmény), `felhasznalonkent.csv`, `kalibracio.csv`, `osszehasonlitasok.csv` (az ábrák nyers adatai, például pgfplots-hoz), `abrak/*.svg`. A gyökér `README.md` a forgatókönyvek elsődleges eredményét összesíti.

**A kód felépítése** (`backend/scripts/`):

| Fájl | Feladat |
|---|---|
| `experiment/learner-simulation.ts` | szimulált tanulók, három generáló memóriamodell |
| `experiment/experiment.ts` | felosztás, modellek, mérőszámok, páros próbák |
| `experiment/statistics.ts` | Wilcoxon-próba, bootstrap, Holm-korrekció |
| `experiment/figures.ts`, `experiment/report.ts` | SVG ábrák, CSV, Markdown riport |
| `experiment/run-experiment.ts` | parancssori belépési pont |
| `prediction-metrics.ts` | log-veszteség, RMSE, AUC, Brier, ECE, kalibrációs görbe |
| `scheduler-evaluation.ts`, `fsrs.ts`, `fsrs-optimizer.ts` | SM-2 újrajátszás, FSRS-4.5, személyre illesztés |

**Egységtesztek** (`npm test -- scripts/experiment`): a Wilcoxon-próba egyezik az R `wilcox.test` egzakt és normális közelítéses eredményével, a Holm-korrekció a `p.adjust`-tal; a bootstrap-intervallum lefedettsége ~95%; a Wilson-intervallum, az ECE és a Brier-pontszám ismert értékeket ad; a kalibráció visszakapja az ismert torzítást; a szimuláció determinisztikus és reális felidézési arányt ad; a kísérlet párosított mintákon mér, a kalibráció nem változtatja az AUC-t, az orákulum jobb az illesztés nélküli modelleknél, és a futás bájtra reprodukálható.

## Irodalom

- Efron, B., & Tibshirani, R. J. (1993). *An Introduction to the Bootstrap.* Chapman & Hall.
- Holm, S. (1979). A simple sequentially rejective multiple test procedure. *Scandinavian Journal of Statistics*, 6(2), 65–70.
- Naeini, M. P., Cooper, G., & Hauskrecht, M. (2015). Obtaining well calibrated probabilities using Bayesian binning. *AAAI*.
- Pavlik, P. I., & Anderson, J. R. (2005). Practice and forgetting effects on vocabulary memory: An activation-based model of the spacing effect. *Cognitive Science*, 29(4), 559–586.
- Settles, B., & Meeder, B. (2016). A trainable spaced repetition model for language learning. *ACL*.
- Wilcoxon, F. (1945). Individual comparisons by ranking methods. *Biometrics Bulletin*, 1(6), 80–83.
- Wozniak, P. A., & Gorzelanczyk, E. J. (1994). Optimization of repetition spacing in the practice of learning. *Acta Neurobiologiae Experimentalis*, 54, 59–62.
- Ye, J., Su, J., & Cao, Y. (2022). A stochastic shortest path algorithm for optimizing spaced repetition scheduling. *KDD*.
