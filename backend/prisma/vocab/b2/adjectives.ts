/**
 * B2 melléknevek fokozással és (ahol jellemző) vonzattal.
 * Formátum: lásd `../dsl.ts`.
 */
export const B2_ADJECTIVES = `
@gefuehle
unabhängig | - | független | von+D = független valamitől
angewiesen | - | ráutalt | auf+A = rá van utalva valamire
begeistert | | lelkes | von+D = lelkes valamiért
bereit | - | kész; hajlandó | zu+D = kész valamire
beliebt | | népszerű | bei+D = népszerű valaki körében
bekannt | | ismert | für+A = ismert valamiről; mit+D = ismeretségben van valakivel
besorgt | | aggódó | um+A = aggódik valakiért; über+A = aggódik valami miatt
betroffen | - | érintett; megrendült | von+D = érintett valamiben
beteiligt | - | részes; résztvevő | an+D = részt vesz valamiben
bewusst | | tudatos | G = tudatában van valaminek
einverstanden | - präd | egyetért | mit+D = egyetért valamivel
fähig | | képes | zu+D = képes valamire
froh | | boldog; örül | über+A = örül valaminek
gespannt | | izgatottan várakozó | auf+A = kíváncsi valamire
gewöhnt | - | hozzászokott | an+A = hozzászokott valamihez
gewohnt | - | megszokott | A = hozzá van szokva valamihez
interessiert | | érdeklődő | an+D = érdeklődik valami iránt
neidisch | | irigy | auf+A = irigy valakire
eifersüchtig | | féltékeny | auf+A = féltékeny valakire
sicher | | biztos | G = biztos valamiben
überzeugt | | meggyőződött | von+D = meg van győződve valamiről
verliebt | | szerelmes | in+A = szerelmes valakibe
wütend | | dühös | auf+A = dühös valakire; über+A = dühös valami miatt
böse | | mérges; gonosz | auf+A = haragszik valakire
dankbar | | hálás | für+A = hálás valamiért; D = hálás valakinek
überrascht | | meglepett | von+D = meglepődött valamin; über+A = meglepődött valami miatt
erstaunt | | csodálkozó | über+A = csodálkozik valamin
entsetzt | | elborzadt; megdöbbent | über+A = megdöbbent valamin
empört | | felháborodott | über+A = felháborodott valamin
erfreut | | örvendő | über+A = örül valaminek
blass | | sápadt | vor+D = sápadt valamitől
misstrauisch | | bizalmatlan | gegenüber+D = bizalmatlan valakivel szemben
gleichgültig | | közömbös | gegenüber+D = közömbös valakivel szemben
peinlich | | kínos | D = kínos valakinek
unangenehm | | kellemetlen | D = kellemetlen valakinek
angenehm | | kellemes
erschöpft | | kimerült
gestresst | | stresszes

@menschen
verheiratet | - | házas | mit+D = házas valakivel
verwandt | - | rokon | mit+D = rokona valakinek
befreundet | - | barátságban levő | mit+D = barátja valakinek
ehrlich | | őszinte | zu+D = őszinte valakivel
streng | | szigorú | mit+D = szigorú valakivel
geduldig | | türelmes | mit+D = türelmes valakivel
ungeduldig | | türelmetlen
sparsam | | takarékos | mit+D = takarékos valamivel
vorsichtig | | óvatos | mit+D = óvatos valamivel
aufmerksam | | figyelmes | auf+A = felfigyel valamire
skeptisch | | szkeptikus | gegenüber+D = szkeptikus valamivel szemben
kritisch | | kritikus | gegenüber+D = kritikus valamivel szemben
tolerant | | toleráns | gegenüber+D = toleráns valakivel szemben
verständnisvoll | | megértő | gegenüber+D = megértő valakivel szemben
gerecht | | igazságos | gegenüber+D = igazságos valakivel szemben
ungerecht | | igazságtalan
berühmt | | híres | für+A = híres valamiről
hilfsbereit | | segítőkész
zurückhaltend | | visszafogott
selbstbewusst | | magabiztos
ehrgeizig | | becsvágyó; ambiciózus
anspruchsvoll | | igényes
bescheiden | | szerény
großzügig | | nagyvonalú
geizig | | fösvény
spontan | | spontán
flexibel | | rugalmas
kreativ | | kreatív
konsequent | | következetes
optimistisch | | optimista
pessimistisch | | pesszimista
realistisch | | realista
vernünftig | | ésszerű; józan
leichtsinnig | | könnyelmű
qualifiziert | | képzett
erfolgreich | | sikeres
belastbar | | terhelhető; teherbíró
erfahren | | tapasztalt | in+D = tapasztalt valamiben
vertraut | | bizalmas; ismerős | mit+D = járatos valamiben
arbeitslos | - | munkanélküli
berufstätig | - | dolgozó {kereső}
wohlhabend | | jómódú
schwanger | - | várandós

@abstrakt
geeignet | geeigneter, am geeignetsten | alkalmas | für+A = alkalmas valamire
typisch | | jellemző; tipikus | für+A = jellemző valakire
charakteristisch | | jellegzetes | für+A = jellegzetes valamire
nützlich | | hasznos | für+A = hasznos valakinek
offen | | nyitott | für+A = nyitott valamire
vergleichbar | - | összehasonlítható | mit+D = összehasonlítható valamivel
informiert | | tájékozott | über+A = tájékozott valamiről
wert | - präd | értékes {megér valamit} | A = megér valamit; G = méltó valamire
voll | | teli | von+D = tele valamivel; mit+D = megtöltve valamivel
reich | | gazdag | an+D = gazdag valamiben
arm | ärmer, am ärmsten | szegény | an+D = szegény valamiben
empfindlich | | érzékeny | gegen+A = érzékeny valamire
verantwortlich | - | felelős | für+A = felelős valamiért
zuständig | - | illetékes | für+A = illetékes valamiben
ausreichend | - | elegendő | für+A = elegendő valamire
notwendig | | szükséges | für+A = szükséges valamihez
verständlich | | érthető | für+A = érthető valaki számára
zugänglich | | hozzáférhető | für+A = hozzáférhető valaki számára
günstig | | kedvező; olcsó | für+A = kedvező valakinek
gefährlich | | veszélyes | für+A = veszélyes valakire
schädlich | | káros | für+A = káros valamire
wirksam | | hatásos | gegen+A = hatásos valami ellen
wesentlich | | lényeges
erheblich | | jelentős {számottevő}
beträchtlich | | tekintélyes {mennyiség}
bedeutend | | jelentős; neves
entscheidend | | döntő
unvermeidlich | - | elkerülhetetlen
dringend | | sürgős
aktuell | | aktuális
gegenwärtig | - | jelenlegi
bisherig | - | eddigi
künftig | - | jövőbeli
ehemalig | - | egykori; volt
vorübergehend | - | átmeneti
dauerhaft | | tartós
ständig | - | állandó
regelmäßig | | rendszeres
gelegentlich | - | alkalmankénti
allmählich | - | fokozatos
rasch | | sebes; gyors
umfangreich | | terjedelmes; átfogó
ausführlich | | részletes
knapp | | szűkös; épphogy elegendő
deutlich | | világos; érthető
eindeutig | | egyértelmű
offensichtlich | | nyilvánvaló
kompliziert | | bonyolult
mühsam | | fáradságos
aufwendig | | költséges; munkaigényes
sinnvoll | | értelmes {van értelme}
nutzlos | | haszontalan
zweckmäßig | | célszerű
effektiv | | hatékony
effizient | | költséghatékony
sorgfältig | | gondos
gründlich | | alapos
oberflächlich | | felületes
anschaulich | | szemléletes
überzeugend | | meggyőző
glaubwürdig | | hiteles
fragwürdig | | kétes
umstritten | | vitatott
widersprüchlich | | ellentmondásos
selbstverständlich | - | magától értetődő
ungewöhnlich | | szokatlan
merkwürdig | | különös
seltsam | | furcsa
erstaunlich | | meglepő; bámulatos
bemerkenswert | | figyelemre méltó
hervorragend | | kiváló
ausgezeichnet | - | kitűnő
durchschnittlich | | átlagos
gewöhnlich | | közönséges; megszokott
üblich | | szokásos
vielfältig | | sokszínű; sokféle
einzigartig | - | egyedülálló
komplex | | összetett; komplex
abstrakt | | elvont
konkret | | konkrét
theoretisch | - | elméleti
heftig | | heves
mild | | enyhe; szelíd
extrem | | szélsőséges
gewaltig | | hatalmas
enorm | | óriási
winzig | | parányi
gering | | csekély
zahlreich | - | számos
dicht | | sűrű; szoros

@gesellschaft
gleichberechtigt | - | egyenjogú
wirtschaftlich | | gazdasági; gazdaságos
finanziell | - | pénzügyi
sozial | | szociális; társadalmi
politisch | - | politikai
gesellschaftlich | - | társadalmi {közösségi}
öffentlich | - | nyilvános; állami {köz-}
privat | - | magán; privát
staatlich | - | állami
rechtlich | - | jogi
gesetzlich | - | törvényi; törvényes
legal | - | legális
illegal | - | illegális
zulässig | - | megengedett
obligatorisch | - | kötelező
freiwillig | - | önkéntes
gültig | - | érvényes
befristet | - | határozott idejű
unbefristet | - | határozatlan idejű
kostenlos | - | ingyenes
preiswert | | kedvező árú
verfügbar | - | elérhető; rendelkezésre álló
vorhanden | - | meglévő
erhältlich | - | kapható

@umwelt
nachhaltig | | fenntartható
umweltfreundlich | | környezetbarát
erneuerbar | - | megújuló
überfüllt | - | zsúfolt
abgelegen | | félreeső; távoli
ländlich | | vidéki
städtisch | - | városi
geräumig | | tágas

@wissenschaft
wissenschaftlich | - | tudományos
technisch | - | műszaki; technikai
digital | - | digitális
virtuell | - | virtuális
künstlich | - | mesterséges

@gesundheit
körperlich | - | testi; fizikai
geistig | - | szellemi
seelisch | - | lelki
psychisch | - | pszichés
chronisch | - | krónikus
ansteckend | | fertőző
`;
