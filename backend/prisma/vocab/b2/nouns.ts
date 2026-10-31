/**
 * B2 főnevek névelővel, többes számmal és (ahol jellemző) elöljárós vonzattal.
 * Formátum: lásd `../dsl.ts`.
 */
export const B2_NOUNS = `
@arbeit
der Arbeitgeber | = | | munkáltató
der Arbeitnehmer | = | | munkavállaló
die Arbeitslosigkeit | - | | munkanélküliség
der Arbeitsvertrag | ¨+e | | munkaszerződés
der Lebenslauf | ¨+e | | önéletrajz
das Vorstellungsgespräch | +e | | állásinterjú
die Stelle | +n | | állás; hely
die Stellenanzeige | +n | | álláshirdetés
der Betrieb | +e | | üzem; vállalat
die Abteilung | +en | | osztály {cégnél}
die Gehaltserhöhung | +en | | fizetésemelés
der Lohn | ¨+e | | bér
die Überstunde | +n | | túlóra
die Teilzeit | - | | részmunkaidő
die Vollzeit | - | | teljes munkaidő
die Kündigung | +en | | felmondás
die Kündigungsfrist | +en | | felmondási idő
die Weiterbildung | +en | | továbbképzés
die Fortbildung | +en | | szakmai továbbképzés
die Qualifikation | +en | | képesítés
die Fähigkeit | +en | | képesség | zu+D = képesség valamire
die Kenntnis | +se | | ismeret {gyakran többes számban}
die Verantwortung | +en | | felelősség | für+A = felelősség valamiért
der Auftrag | ¨+e | | megbízás; megrendelés
die Sitzung | +en | | ülés {értekezlet}
die Tagesordnung | +en | | napirend
das Protokoll | +e | | jegyzőkönyv
die Frist | +en | | határidő
die Leistung | +en | | teljesítmény
der Erfolg | +e | | siker
die Karriere | +n | | karrier
der Arbeitsplatz | ¨+e | | munkahely
die Arbeitszeit | +en | | munkaidő
die Branche | +n | | ágazat; szakma
das Unternehmen | = | | vállalat
der Unternehmer | = | | vállalkozó
die Gründung | +en | | alapítás
die Selbstständigkeit | - | | önállóság; önálló vállalkozás
der Mitarbeiter | = | | munkatárs
die Belegschaft | +en | | személyzet; dolgozói állomány
die Gewerkschaft | +en | | szakszervezet
der Streik | +s | | sztrájk
das Praktikum | Praktika | | szakmai gyakorlat
der* Praktikant | +en | | gyakornok
die Kompetenz | +en | | kompetencia
die Herausforderung | +en | | kihívás
die Beförderung | +en | | előléptetés; szállítás
der Ruhestand | - | | nyugállomány
die Rente | +n | | nyugdíj
die Arbeitsbedingung | +en | | munkafeltétel
die Schicht | +en | | műszak; réteg
der Feierabend | +e | | munkaidő vége
die Dienstreise | +n | | kiküldetés; üzleti út
die Konkurrenz | - | | konkurencia; versenytársak
der Zeitdruck | - | | időnyomás
die Unterlage | +n | | dokumentum; irat
das Zeugnis | +se | | bizonyítvány; munkáltatói igazolás
die Probezeit | +en | | próbaidő
die Bezahlung | +en | | fizetés; díjazás
die Voraussetzung | +en | | előfeltétel | für+A = előfeltétele valaminek
der* Experte | +n | | szakértő | für+A = szakértő valamiben
der Fachmann | Fachleute | | szakember
die Fachkraft | ¨+e | | képzett munkaerő
der Fachkräftemangel | - | | szakemberhiány
der Teilnehmer | = | | résztvevő
der Vertreter | = | | képviselő
der Ansprechpartner | = | | kapcsolattartó
der Gesprächspartner | = | | beszélgetőtárs
der* Kandidat | +en | | jelölt

@wirtschaft
die Wirtschaft | +en | | gazdaság
das Wachstum | - | | növekedés
der Markt | ¨+e | | piac
die Nachfrage | +n | | kereslet | nach+D = kereslet valami iránt
das Angebot | +e | | kínálat; ajánlat
der Umsatz | ¨+e | | forgalom; árbevétel
der Gewinn | +e | | nyereség
der Verlust | +e | | veszteség
die Steuer | +n | | adó
die Inflation | +en | | infláció
die Investition | +en | | befektetés; beruházás | in+A = befektetés valamibe
der Kredit | +e | | hitel
pl Schulden | | | adósság
der Zins | +en | | kamat
die Börse | +n | | tőzsde
die Aktie | +n | | részvény
der Verbraucher | = | | fogyasztó
der Haushalt | +e | | háztartás; költségvetés
die Ausgabe | +n | | kiadás
die Einnahme | +n | | bevétel
das Einkommen | = | | jövedelem
das Vermögen | = | | vagyon
der Wohlstand | - | | jólét
die Armut | - | | szegénység
der Reichtum | ¨+er | | gazdagság
die Überweisung | +en | | átutalás
die Gebühr | +en | | díj; illeték
der Beitrag | ¨+e | | hozzájárulás; tagdíj; bejegyzés {közösségi médiában} | zu+D = hozzájárulás valamihez
die Versicherung | +en | | biztosítás
der Vertrieb | +e | | értékesítés
die Werbung | - | | reklám
die Marke | +n | | márka
das Produkt | +e | | termék
die Produktion | +en | | gyártás; termelés
die Lieferung | +en | | szállítás
der* Lieferant | +en | | beszállító
der Handel | - | | kereskedelem
der Export | +e | | export
der Import | +e | | import
die Globalisierung | - | | globalizáció
die Krise | +n | | válság
die Rezession | +en | | recesszió
die Bilanz | +en | | mérleg {pénzügyi}
das Budget | +s | | költségvetés; büdzsé
der Rabatt | +e | | kedvezmény; árengedmény
die Quittung | +en | | nyugta
die Reklamation | +en | | reklamáció
der Anbieter | = | | szolgáltató
die Dienstleistung | +en | | szolgáltatás
der Wettbewerb | +e | | verseny; pályázat {versenypályázat}
die Preiserhöhung | +en | | áremelés
der Zuschuss | ¨+e | | pénzbeli támogatás
die Förderung | +en | | támogatás {fejlesztés}; elősegítés
die Subvention | +en | | állami támogatás; szubvenció
der Wert | +e | | érték
die Ware | +n | | áru
der Aufschwung | ¨+e | | fellendülés

@gesellschaft
die Gesellschaft | +en | | társadalom; társaság
die Bevölkerung | +en | | lakosság
die Generation | +en | | generáció
die Gleichberechtigung | - | | egyenjogúság
die Gleichheit | - | | egyenlőség
die Integration | +en | | integráció; beilleszkedés | in+A = beilleszkedés valamibe
die Migration | +en | | migráció
der Flüchtling | +e | | menekült
die Einwanderung | +en | | bevándorlás
der Einwanderer | = | | bevándorló
der Ausländer | = | | külföldi
die Herkunft | ¨+e | | származás
die Minderheit | +en | | kisebbség
das Vorurteil | +e | | előítélet | gegenüber+D = előítélet valakivel szemben
die Diskriminierung | +en | | diszkrimináció
die Toleranz | - | | tolerancia
die Obdachlosigkeit | - | | hajléktalanság
die Sozialhilfe | - | | szociális segély
die Gemeinschaft | +en | | közösség
die Solidarität | - | | szolidaritás
die Gerechtigkeit | - | | igazságosság
das Ehrenamt | ¨+er | | önkéntes tisztség
die Rolle | +n | | szerep
die Tradition | +en | | hagyomány
der Brauch | ¨+e | | szokás {népszokás}
die Sitte | +n | | erkölcs; illem
die Religion | +en | | vallás
der Glaube | - | Glaubens | hit | an+A = hit valamiben
die Kindheit | +en | | gyermekkor
die Jugend | - | | ifjúság
das Alter | = | | kor; öregkor
die Erziehung | - | | nevelés
die Partnerschaft | +en | | párkapcsolat; partnerség
die Ehe | +n | | házasság
die Scheidung | +en | | válás
das Verhältnis | +se | | viszony | zu+D = viszony valakivel
der Bewohner | = | | lakó
der Einwohner | = | | lakos
der Senior | Senioren | | idős ember; nyugdíjas
der* Vorfahr | +en | | ős
der* Nachkomme | +n | | leszármazott
der* Zeitgenosse | +n | | kortárs

@politik
die Demokratie | +n | | demokrácia
die Regierung | +en | | kormány
die Opposition | +en | | ellenzék
die Partei | +en | | párt
die Wahl | +en | | választás
der Wähler | = | | választó
die Stimme | +n | | hang; szavazat
das Parlament | +e | | parlament
die Verfassung | +en | | alkotmány
der Bürger | = | | állampolgár; polgár
die Staatsangehörigkeit | +en | | állampolgárság
die Behörde | +n | | hatóság
die Verwaltung | +en | | közigazgatás; ügyintézés
der Antrag | ¨+e | | kérvény; kérelem | auf+A = kérelem valamire
die Genehmigung | +en | | engedély
die Erlaubnis | +se | | engedélyezés; engedély {szóbeli}
die Vorschrift | +en | | előírás
die Pflicht | +en | | kötelesség
das Recht | +e | | jog | auf+A = jog valamire
die Freiheit | +en | | szabadság
der Frieden | - | | béke
der Krieg | +e | | háború
der Konflikt | +e | | konfliktus
die Gewalt | +en | | erőszak; hatalom
die Macht | ¨+e | | hatalom {uralom}
die Reform | +en | | reform
die Maßnahme | +n | | intézkedés
die Debatte | +n | | vita {nyilvános} | über+A = vita valamiről
die Diskussion | +en | | vita; megbeszélés
der Standpunkt | +e | | álláspont
die Ansicht | +en | | nézet; vélemény
die Kritik | +en | | kritika | an+D = kritika valamivel kapcsolatban
der Protest | +e | | tiltakozás | gegen+A = tiltakozás valami ellen
die Demonstration | +en | | tüntetés
die Umfrage | +n | | közvélemény-kutatás
die Mehrheit | +en | | többség
der Kompromiss | +e | | kompromisszum
der Gegner | = | | ellenfél; ellenző
der Befürworter | = | | támogató {híve valaminek}
der Kritiker | = | | kritikus {személy}

@umwelt
der Umweltschutz | - | | környezetvédelem
die Umweltverschmutzung | +en | | környezetszennyezés
der Klimawandel | - | | klímaváltozás
die Erderwärmung | - | | globális felmelegedés
das Treibhausgas | +e | | üvegházhatású gáz
die Emission | +en | | kibocsátás
der Ausstoß | ¨+e | | kibocsátás {gázé}
die Energie | +n | | energia
die Energiewende | - | | energiaátállás
die Solarenergie | - | | napenergia
die Windkraft | - | | szélenergia
das Kraftwerk | +e | | erőmű
der Rohstoff | +e | | nyersanyag
die Ressource | +n | | erőforrás
die Nachhaltigkeit | - | | fenntarthatóság
der Abfall | ¨+e | | hulladék
die Mülltrennung | - | | szelektív hulladékgyűjtés
das Recycling | - | | újrahasznosítás
die Verpackung | +en | | csomagolás
der Verbrauch | - | | fogyasztás {anyagé, energiáé}
die Artenvielfalt | - | | fajgazdagság; biodiverzitás
die Tierart | +en | | állatfaj
das Aussterben | - | | kihalás
der Naturschutz | - | | természetvédelem
der Tierschutz | - | | állatvédelem
die Katastrophe | +n | | katasztrófa
die Überschwemmung | +en | | árvíz
die Dürre | +n | | aszály
der Sturm | ¨+e | | vihar
das Erdbeben | = | | földrengés
die Hitzewelle | +n | | hőhullám
der Niederschlag | ¨+e | | csapadék
der Sauerstoff | - | | oxigén
die Atmosphäre | +n | | légkör
die Oberfläche | +n | | felszín
der Boden | ¨ | | talaj; padló
das Gewässer | = | | vízfelület; vizek
die Küste | +n | | tengerpart
der Gipfel | = | | csúcs
das Klima | +s | | éghajlat
die Lebensgrundlage | +n | | megélhetés alapja
die Folge | +n | | következmény
die Ursache | +n | | ok | für+A = valaminek az oka
die Auswirkung | +en | | kihatás | auf+A = hatás valamire
der Einfluss | ¨+e | | befolyás | auf+A = befolyás valamire

@gesundheit
die Behandlung | +en | | kezelés
die Therapie | +n | | terápia
die Untersuchung | +en | | vizsgálat
die Diagnose | +n | | diagnózis
das Symptom | +e | | tünet
die Beschwerde | +n | | panasz; reklamáció | über+A = panasz valamire
die Verletzung | +en | | sérülés
die Wunde | +n | | seb
die Infektion | +en | | fertőzés
die Entzündung | +en | | gyulladás
die Allergie | +n | | allergia | gegen+A = allergia valamire
die Impfung | +en | | oltás | gegen+A = oltás valami ellen
das Rezept | +e | | recept
die Nebenwirkung | +en | | mellékhatás
die Operation | +en | | műtét
der Eingriff | +e | | beavatkozás
die Notaufnahme | +n | | sürgősségi osztály
der Notfall | ¨+e | | vészhelyzet
der Rettungswagen | = | | mentőautó
die Krankenkasse | +n | | egészségbiztosító
die Krankenversicherung | +en | | betegbiztosítás
die Vorsorge | - | | megelőzés; előgondoskodás
die Ernährung | - | | táplálkozás
die Bewegung | +en | | mozgás
das Übergewicht | - | | túlsúly
die Sucht | ¨+e | | szenvedélybetegség | nach+D = függőség valamitől
die Abhängigkeit | +en | | függőség | von+D = függés valamitől
die Erschöpfung | - | | kimerültség
die Psyche | +n | | psziché; lélek
die Depression | +en | | depresszió
die Belastung | +en | | terhelés; megterhelés
die Erholung | - | | pihenés; felüdülés
der Kreislauf | ¨+e | | vérkeringés; körforgás
das Immunsystem | +e | | immunrendszer
die Pflege | - | | ápolás; gondozás
der* Patient | +en | | beteg; páciens
der Facharzt | ¨+e | +es | szakorvos
die Lebenserwartung | +en | | várható élettartam
die Gesundheitsversorgung | - | | egészségügyi ellátás
der Verband | ¨+e | | kötés {sebre}; szövetség
die Spritze | +n | | injekció; fecskendő
die Heilung | +en | | gyógyulás; gyógyítás
die Genesung | +en | | felépülés

@bildung
die Bildung | - | | műveltség; oktatás
das Studium | Studien | | egyetemi tanulmányok
die Hochschule | +n | | felsőoktatási intézmény; főiskola
die Vorlesung | +en | | előadás {egyetemi}
das Seminar | +e | | szeminárium
der Abschluss | ¨+e | | végzettség; lezárás
das Fach | ¨+er | | tantárgy; szakterület
das Stipendium | Stipendien | | ösztöndíj
die Fremdsprache | +n | | idegen nyelv
die Muttersprache | +n | | anyanyelv
der Wortschatz | ¨+e | | szókincs
die Grammatik | +en | | nyelvtan
die Aussprache | +n | | kiejtés; nyílt megbeszélés
der Ausdruck | ¨+e | | kifejezés
die Bedeutung | +en | | jelentés; jelentőség
die Übersetzung | +en | | fordítás
der Begriff | +e | | fogalom
die Definition | +en | | definíció
das Referat | +e | | kiselőadás; referátum
die Hausarbeit | +en | | házi dolgozat; házimunka
die Abschlussarbeit | +en | | szakdolgozat
die Quelle | +n | | forrás
das Zitat | +e | | idézet
die Gliederung | +en | | tagolás; vázlat
die Zusammenfassung | +en | | összefoglaló
die Schulpflicht | - | | tankötelezettség
die Einschreibung | +en | | beiratkozás
das Semester | = | | félév
der Studiengang | ¨+e | | szak {egyetemi}
die Lehre | +n | | tanítás; tan; szakmunkásképzés
die Begabung | +en | | adottság; tehetség
das Talent | +e | | tehetség; talentum
die Kreativität | - | | kreativitás
die Neugier | - | | kíváncsiság
die Aufmerksamkeit | +en | | figyelem
das Gedächtnis | +se | | emlékezet; memória
die Konzentration | +en | | koncentráció

@wissenschaft
die Forschung | +en | | kutatás
der Forscher | = | | kutató
die Wissenschaft | +en | | tudomány
der Wissenschaftler | = | | tudós
die Studie | +n | | tanulmány {kutatás}
das Experiment | +e | | kísérlet {tudományos}
das Ergebnis | +se | | eredmény
die Erkenntnis | +se | | felismerés; megismerés
die Theorie | +n | | elmélet
die These | +n | | tézis
der Beweis | +e | | bizonyíték | für+A = bizonyíték valamire
die Methode | +n | | módszer
die Entdeckung | +en | | felfedezés
die Erfindung | +en | | találmány
die Entwicklung | +en | | fejlődés; fejlesztés
der Fortschritt | +e | | haladás; fejlődés
die Technik | +en | | technika
die Technologie | +n | | technológia
die Digitalisierung | - | | digitalizálás
das Gerät | +e | | készülék
die Anwendung | +en | | alkalmazás
die Software | +s | | szoftver
pl Daten | | | adatok
der Datenschutz | - | | adatvédelem
die Datei | +en | | fájl
das Netzwerk | +e | | hálózat
der Bildschirm | +e | | képernyő
die Festplatte | +n | | merevlemez
der Speicher | = | | tárhely; memória
der Nutzer | = | | felhasználó
das Passwort | ¨+er | | jelszó

@medien
das Medium | Medien | | médium; közvetítő eszköz
die Presse | - | | sajtó
die Zeitschrift | +en | | folyóirat
der Bericht | +e | | beszámoló; jelentés | über+A = beszámoló valamiről
die Reportage | +n | | riport
die Schlagzeile | +n | | főcím
der* Journalist | +en | | újságíró
die Sendung | +en | | adás; műsor
der Sender | = | | adó {rádió, tévé}
das Publikum | - | | közönség
der Zuschauer | = | | néző
der Leser | = | | olvasó
die Information | +en | | információ | über+A = információ valamiről
die Mitteilung | +en | | közlemény; értesítés
die Meldung | +en | | jelentés; bejelentés
die Benachrichtigung | +en | | értesítés
die Veröffentlichung | +en | | közzététel; publikáció
die Zensur | +en | | cenzúra
die Pressefreiheit | - | | sajtószabadság
die Glaubwürdigkeit | - | | hitelesség
die Falschmeldung | +en | | álhír
die Plattform | +en | | platform
der Kanal | ¨+e | | csatorna
die Kommunikation | +en | | kommunikáció

@kommunikation
die Unterhaltung | +en | | beszélgetés; szórakozás
die Auseinandersetzung | +en | | vita; összetűzés | mit+D = vita valakivel
der Streit | +e | | veszekedés; vita
das Missverständnis | +se | | félreértés
die Absicht | +en | | szándék
die Empfehlung | +en | | ajánlás
der Hinweis | +e | | utalás; tipp | auf+A = utalás valamire
die Bitte | +n | | kérés | um+A = kérés valamire
die Anfrage | +n | | érdeklődés; megkeresés
die Rückmeldung | +en | | visszajelzés
die Zustimmung | +en | | beleegyezés; egyetértés
die Ablehnung | +en | | elutasítás
der Widerspruch | ¨+e | | ellentmondás; ellenvetés
das Argument | +e | | érv | für+A = érv valami mellett; gegen+A = érv valami ellen
die Behauptung | +en | | állítás
die Begründung | +en | | indoklás
die Überzeugung | +en | | meggyőződés
der Eindruck | ¨+e | | benyomás
die Rede | +n | | beszéd
der Vortrag | ¨+e | | előadás {szóbeli} | über+A = előadás valamiről
die Ansprache | +n | | ünnepi beszéd
die Umgangssprache | +n | | köznyelv
die Höflichkeit | +en | | udvariasság
der Tonfall | ¨+e | | hangnem
die Stellungnahme | +n | | állásfoglalás | zu+D = állásfoglalás valamiről
die Äußerung | +en | | megnyilatkozás
die Aussage | +n | | kijelentés; vallomás
die Bemerkung | +en | | megjegyzés
der Kommentar | +e | | kommentár; hozzászólás
die Anmerkung | +en | | lábjegyzet; észrevétel
die Ankündigung | +en | | bejelentés
die Warnung | +en | | figyelmeztetés | vor+D = figyelmeztetés valamire
die Forderung | +en | | követelés | nach+D = követelés valamire
die Erklärung | +en | | magyarázat; nyilatkozat | für+A = magyarázat valamire
die Darstellung | +en | | ábrázolás; bemutatás
die Beschreibung | +en | | leírás

@recht
das Gesetz | +e | | törvény
das Gericht | +e | | bíróság
der Richter | = | | bíró
der Anwalt | ¨+e | | ügyvéd
die Klage | +n | | kereset; panasz | gegen+A = kereset valaki ellen
der Prozess | +e | | per; folyamat
das Urteil | +e | | ítélet
die Strafe | +n | | büntetés
die Geldstrafe | +n | | pénzbírság
das Verbrechen | = | | bűncselekmény
die Kriminalität | - | | bűnözés
der Täter | = | | elkövető
das Opfer | = | | áldozat
der* Zeuge | +n | | tanú
der Verdacht | - | | gyanú
der Diebstahl | ¨+e | | lopás
der Betrug | - | | csalás
die Ermittlung | +en | | nyomozás
die Anzeige | +n | | feljelentés; hirdetés | gegen+A = feljelentés valaki ellen
die Vereinbarung | +en | | megállapodás
die Bedingung | +en | | feltétel
die Haftung | +en | | jogi felelősség
der Schaden | ¨ | | kár
der Schadenersatz | - | | kártérítés
die Kaution | +en | | kaució; óvadék
die Unterschrift | +en | | aláírás
der Ausweis | +e | | igazolvány
der Verstoß | ¨+e | | szabálysértés | gegen+A = valaminek a megsértése
die Ordnung | +en | | rend
die Kontrolle | +n | | ellenőrzés
die Überwachung | +en | | megfigyelés
die Gefahr | +en | | veszély
das Risiko | Risiken | | kockázat
die Vorsicht | - | | óvatosság
der Schutz | - | | védelem | vor+D = védelem valami ellen
die Bedrohung | +en | | fenyegetés
die Sicherheit | +en | | biztonság
die Schuld | - | | bűnösség; hiba {vétkesség} | an+D = felelősség valamiért

@kultur
die Kultur | +en | | kultúra
die Kunst | ¨+e | | művészet
das Kunstwerk | +e | | műalkotás
die Aufführung | +en | | előadás {színházi}
die Vorstellung | +en | | elképzelés; előadás; bemutatkozás | von+D = elképzelés valamiről
das Theaterstück | +e | | színdarab
die Bühne | +n | | színpad
der Schauspieler | = | | színész
die Literatur | +en | | irodalom
der Roman | +e | | regény
das Gedicht | +e | | vers
der Schriftsteller | = | | író
der Verlag | +e | | kiadó {könyvkiadó}
die Veranstaltung | +en | | rendezvény
das Ereignis | +se | | esemény
das Erlebnis | +se | | élmény
das Abenteuer | = | | kaland
die Freizeitbeschäftigung | +en | | szabadidős tevékenység
das Denkmal | ¨+er | | emlékmű
das Erbe | - | | örökség
die Epoche | +n | | korszak
das Jahrhundert | +e | | évszázad
die Gegenwart | - | | jelen
der Geschmack | - | | ízlés; íz
die Mode | +n | | divat
der Stil | +e | | stílus
das Vorbild | +er | | példakép
die Begeisterung | - | | lelkesedés | für+A = lelkesedés valamiért
das Interesse | +n | | érdeklődés | an+D = érdeklődés valami iránt; für+A = fogékonyság valami iránt
der Eintritt | +e | | belépés; belépődíj
der Wettkampf | ¨+e | | verseny {sport}
die Mannschaft | +en | | csapat
der Sieg | +e | | győzelem | über+A = győzelem valaki felett
die Niederlage | +n | | vereség
der Verlierer | = | | vesztes
der Gewinner | = | | nyertes

@wohnen
der Mieter | = | | bérlő
pl Nebenkosten | | | rezsi; mellékköltségek
der Mietvertrag | ¨+e | | bérleti szerződés
die Wohngemeinschaft | +en | | lakóközösség {közös albérlet}
der Umzug | ¨+e | | költözés
die Einrichtung | +en | | berendezés; intézmény
das Möbelstück | +e | | bútordarab
der Grundriss | +e | | alaprajz
die Lage | +n | | fekvés; helyzet
die Nachbarschaft | +en | | szomszédság
der Hausmeister | = | | gondnok
die Hausordnung | +en | | házirend
die Heizung | +en | | fűtés
der Strom | - | | áram
die Reparatur | +en | | javítás
der Handwerker | = | | mesterember
das Werkzeug | +e | | szerszám
der Einkauf | ¨+e | | bevásárlás
der Vorrat | ¨+e | | készlet
das Lebensmittel | = | | élelmiszer
die Mahlzeit | +en | | étkezés
die Zutat | +en | | hozzávaló
die Gewohnheit | +en | | szokás
der Tagesablauf | ¨+e | | napirend {napi teendők}
die Verabredung | +en | | randevú; megbeszélt találkozó | mit+D = találkozó valakivel
die Pünktlichkeit | - | | pontosság
die Sauberkeit | - | | tisztaság
der Lärm | - | | zaj
die Ruhe | - | | nyugalom; csend
die Großstadt | ¨+e | | nagyváros
der Stadtteil | +e | | városrész
die Infrastruktur | +en | | infrastruktúra
die Wohnungsnot | - | | lakáshiány
der Wohnraum | ¨+e | | lakótér

@verkehr
der Stau | +s | | dugó {forgalmi}
der Anschluss | ¨+e | | csatlakozás
die Verbindung | +en | | összeköttetés; járat
die Abfahrt | +en | | indulás
die Ankunft | ¨+e | | érkezés
der Aufenthalt | +e | | tartózkodás
die Buchung | +en | | foglalás
die Reservierung | +en | | helyfoglalás
das Reiseziel | +e | | úti cél
der Reiseführer | = | | idegenvezető; útikönyv
die Grenze | +n | | határ
der Zoll | ¨+e | | vám
das Fahrzeug | +e | | jármű
die Geschwindigkeit | +en | | sebesség
die Panne | +n | | műszaki hiba; defekt
der Fußgänger | = | | gyalogos
der Radfahrer | = | | kerékpáros
das Verkehrsmittel | = | | közlekedési eszköz
der Nahverkehr | - | | helyi közlekedés
die Strecke | +n | | útvonal; szakasz
die Umleitung | +en | | terelőút
die Baustelle | +n | | építkezés; útépítés
die Landung | +en | | leszállás
der Start | +s | | felszállás; rajt
das Gepäck | - | | poggyász
die Fernreise | +n | | távoli utazás
der Tourismus | - | | turizmus
der* Tourist | +en | | turista
die Pauschalreise | +n | | társasutazás {csomag}
die Rundreise | +n | | körutazás
der Ausflug | ¨+e | | kirándulás

@gefuehle
die Trauer | - | | gyász; szomorúság | um+A = gyász valaki miatt
die Wut | - | | düh | auf+A = düh valakire
die Enttäuschung | +en | | csalódás | über+A = csalódás valami miatt
die Hoffnung | +en | | remény | auf+A = remény valamire
die Sehnsucht | ¨+e | | vágyakozás | nach+D = vágyakozás valami után
die Eifersucht | - | | féltékenység | auf+A = féltékenység valakire
der Neid | - | | irigység | auf+A = irigység valakire
der Stolz | - | | büszkeség | auf+A = büszkeség valamire
die Scham | - | | szégyen
das Mitleid | - | | sajnálat; részvét | mit+D = sajnálat valaki iránt
das Vertrauen | - | | bizalom | zu+D = bizalom valaki iránt; in+A = bizalom valamiben
das Misstrauen | - | | bizalmatlanság | gegenüber+D = bizalmatlanság valakivel szemben
die Geduld | - | | türelem
die Ungeduld | - | | türelmetlenség
die Zufriedenheit | - | | elégedettség | mit+D = elégedettség valamivel
die Dankbarkeit | - | | hála
die Gelassenheit | - | | higgadtság
die Leidenschaft | +en | | szenvedély | für+A = szenvedély valami iránt
die Stimmung | +en | | hangulat
die Laune | +n | | kedv
der Charakter | +e | | jellem
die Eigenschaft | +en | | tulajdonság
die Persönlichkeit | +en | | személyiség
das Verhalten | - | | viselkedés
das Selbstbewusstsein | - | | önbizalom
das Selbstvertrauen | - | | magabiztosság
die Zuverlässigkeit | - | | megbízhatóság
die Ehrlichkeit | - | | őszinteség
die Offenheit | - | | nyitottság
die Einsamkeit | - | | magány
die Langeweile | - | | unalom
die Panik | +en | | pánik
die Erleichterung | +en | | megkönnyebbülés
die Überraschung | +en | | meglepetés
das Erstaunen | - | | csodálkozás
die Rücksicht | +en | | figyelmesség; tekintet | auf+A = tekintettel lenni valamire
der Respekt | - | | tisztelet | vor+D = tisztelet valaki iránt
die Achtung | - | | megbecsülés; figyelem
die Anerkennung | +en | | elismerés
das Lob | - | | dicséret
der Vorwurf | ¨+e | | szemrehányás

@abstrakt
der Zusammenhang | ¨+e | | összefüggés | mit+D = összefüggés valamivel; zwischen+D = összefüggés valamik között
der Unterschied | +e | | különbség | zwischen+D = különbség valamik között
die Gemeinsamkeit | +en | | közös vonás
der Vergleich | +e | | összehasonlítás | mit+D = összehasonlítás valamivel
der Vorteil | +e | | előny
der Nachteil | +e | | hátrány
die Möglichkeit | +en | | lehetőség
die Wahrscheinlichkeit | +en | | valószínűség
die Notwendigkeit | +en | | szükségesség
der Zweck | +e | | cél {rendeltetés}
der Anlass | ¨+e | | alkalom; ok | zu+D = ok valamire
die Gelegenheit | +en | | alkalom; lehetőség | zu+D = alkalom valamire
der Zufall | ¨+e | | véletlen
das Schicksal | +e | | sors
die Wirklichkeit | +en | | valóság
die Realität | +en | | realitás
die Wahrheit | +en | | igazság
die Lüge | +n | | hazugság
der Irrtum | ¨+er | | tévedés
die Lösung | +en | | megoldás | für+A = megoldás valamire
die Schwierigkeit | +en | | nehézség
der Aufwand | - | | ráfordítás; fáradság
die Mühe | +n | | erőfeszítés
der Versuch | +e | | kísérlet {próbálkozás}
der Zustand | ¨+e | | állapot
der Umstand | ¨+e | | körülmény
die Grundlage | +n | | alap {alapja valaminek}
der Grundsatz | ¨+e | | alapelv
das Prinzip | Prinzipien | | elv
die Regelung | +en | | szabályozás
der Maßstab | ¨+e | | mérce; mérték
die Menge | +n | | mennyiség; tömeg
die Anzahl | - | | szám {darabszám}
der Anteil | +e | | részesedés; arány | an+D = részesedés valamiből
der Durchschnitt | +e | | átlag
die Ausnahme | +n | | kivétel
der Ablauf | ¨+e | | lefolyás; menet
der Vorgang | ¨+e | | folyamat; eset
die Veränderung | +en | | változás
der Wandel | - | | átalakulás
die Entscheidung | +en | | döntés | über+A = döntés valamiről
der Entschluss | ¨+e | | elhatározás
die Planung | +en | | tervezés
die Vorbereitung | +en | | felkészülés; előkészület | auf+A = felkészülés valamire
die Durchführung | +en | | lebonyolítás; végrehajtás
die Umsetzung | +en | | megvalósítás
die Verwirklichung | +en | | megvalósulás
der Zweifel | = | | kétség | an+D = kétség valami iránt
die Gewissheit | +en | | bizonyosság
die Vermutung | +en | | feltételezés
die Annahme | +n | | feltevés; elfogadás
die Erwartung | +en | | elvárás
die Anforderung | +en | | követelmény | an+A = követelmény valakivel szemben
der Anspruch | ¨+e | | igény; jogosultság | auf+A = igény valamire
der Bedarf | - | | szükséglet | an+D = szükséglet valamiből
das Bedürfnis | +se | | szükséglet; igény | nach+D = igény valamire
die Bereitschaft | +en | | készség; hajlandóság | zu+D = hajlandóság valamire
der Wille | - | Willens | akarat
die Absprache | +n | | egyeztetés; megállapodás
die Aussicht | +en | | kilátás | auf+A = kilátás valamire
der Ausblick | +e | | kitekintés; panoráma
die Perspektive | +n | | perspektíva
die Hinsicht | +en | | szempont; tekintet
der Aspekt | +e | | aspektus
der Gesichtspunkt | +e | | szempont
die Wirkung | +en | | hatás
der Effekt | +e | | effektus
die Reaktion | +en | | reakció | auf+A = reakció valamire
die Teilnahme | +n | | részvétel | an+D = részvétel valamin
der Einsatz | ¨+e | | bevetés; elkötelezett munka | für+A = kiállás valamiért
das Engagement | +s | | elkötelezettség | für+A = elkötelezettség valami iránt
die Initiative | +n | | kezdeményezés
die Unterstützung | +en | | segítség; támogatás
der Rat | Ratschläge | | tanács
die Ahnung | +en | | sejtés; fogalom {tudás} | von+D = fogalma van valamiről
die Erinnerung | +en | | emlék; emlékezés | an+A = emlék valamiről
die Fantasie | +n | | fantázia
der Gedanke | +n | Gedankens | gondolat | an+A = gondolat valamire
die Überlegung | +en | | megfontolás
die Einstellung | +en | | beállítottság; beállítás | zu+D = hozzáállás valamihez
die Haltung | +en | | tartás; álláspont | gegenüber+D = magatartás valakivel szemben
das Ansehen | - | | tekintély; hírnév
der Ruf | +e | | hírnév; kiáltás
das Image | +s | | imázs
die Qualität | +en | | minőség
das Gewicht | +e | | súly
der Umfang | ¨+e | | terjedelem; kerület
die Breite | +n | | szélesség
die Tiefe | +n | | mélység
die Höhe | +n | | magasság; összeg
der Abstand | ¨+e | | távolság; térköz
die Entfernung | +en | | távolság {földrajzi}
die Richtung | +en | | irány
der Rand | ¨+er | | szél {perem}
die Mitte | +n | | közép
der Inhalt | +e | | tartalom
die Form | +en | | forma
die Struktur | +en | | szerkezet
das System | +e | | rendszer
die Ebene | +n | | szint; síkság
der Bereich | +e | | terület {szakterület}
das Gebiet | +e | | terület; régió
der Sektor | Sektoren | | szektor
der Raum | ¨+e | | tér; helyiség
der Zeitraum | ¨+e | | időszak
die Dauer | - | | időtartam
der Zeitpunkt | +e | | időpont
der Beginn | - | | kezdet
der Rückgang | ¨+e | | visszaesés
der Anstieg | +e | | emelkedés | um+A = emelkedés valamennyivel
die Zunahme | +n | | növekedés {gyarapodás}
die Abnahme | +n | | csökkenés; átvétel
die Steigerung | +en | | fokozás; növelés
die Verbesserung | +en | | javítás; javulás
die Verschlechterung | +en | | romlás
der Mangel | ¨ | | hiány | an+D = hiány valamiből
der Überfluss | - | | bőség | an+D = bőség valamiből
die Fülle | - | | sokaság; teljesség
der Kontakt | +e | | érintkezés; kapcsolattartás | zu+D = kapcsolat valakivel
der Gegensatz | ¨+e | | ellentét | zu+D = ellentétben valamivel
das Gegenteil | +e | | ellenkezője valaminek
die Alternative | +n | | alternatíva | zu+D = alternatíva valamire
der Ausweg | +e | | kiút | aus+D = kiút valamiből
der Auslöser | = | | kiváltó ok
die Konsequenz | +en | | konzekvencia
die Chance | +n | | esély
der Nutzen | - | | haszon
der Schwerpunkt | +e | | súlypont
die Priorität | +en | | prioritás
das Kriterium | Kriterien | | kritérium
der Überblick | +e | | áttekintés | über+A = áttekintés valamiről
die Übersicht | +en | | áttekintő táblázat; áttekinthetőség
die Beteiligung | +en | | részvétel; részesedés | an+D = részvétel valamiben
die Zusammenarbeit | - | | együttműködés | mit+D = együttműködés valakivel
die Kooperation | +en | | kooperáció
die Abmachung | +en | | megegyezés
die Absage | +n | | lemondás; elutasítás
die Zusage | +n | | jóváhagyás; igenlő válasz
das Versprechen | = | | ígéret
die Garantie | +n | | garancia
die Sammlung | +en | | gyűjtemény
die Auswahl | - | | választék
die Vielfalt | - | | sokféleség
die Mischung | +en | | keverék
der Bestandteil | +e | | alkotóelem
das Merkmal | +e | | ismertetőjegy
das Verfahren | = | | eljárás
die Vorgehensweise | +n | | eljárásmód
die Strategie | +n | | stratégia
die Taktik | +en | | taktika
das Konzept | +e | | koncepció
das Projekt | +e | | projekt
die Phase | +n | | fázis; szakasz
die Stufe | +n | | fok; lépcsőfok
der Schritt | +e | | lépés
das Scheitern | - | | kudarc
der Misserfolg | +e | | sikertelenség
das Resultat | +e | | végeredmény
die Wende | +n | | fordulat
der Höhepunkt | +e | | csúcspont
der Ausgangspunkt | +e | | kiindulópont
die Hälfte | +n | | fél; valaminek a fele
das Drittel | = | | harmad
das Viertel | = | | negyed
der Prozentsatz | ¨+e | | százalékarány
`;
