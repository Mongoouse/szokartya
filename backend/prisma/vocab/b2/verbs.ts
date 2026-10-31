/**
 * B2 igék alapalakokkal (jelen E/3, Präteritum E/3, Partizip II, segédige) és
 * vonzattal. Formátum: lásd `../dsl.ts`.
 */
export const B2_VERBS = `
@gefuehle
sich beschäftigen | beschäftigt | beschäftigte | beschäftigt | h | r | foglalkozik | mit+D = foglalkozik valamivel
sich aufregen | regt auf | regte auf | aufgeregt | h | r | felizgatja magát | über+A = felháborodik valamin
sich bedanken | bedankt | bedankte | bedankt | h | r | köszönetet mond | bei+D = köszönetet mond valakinek; für+A = megköszön valamit
sich bemühen | bemüht | bemühte | bemüht | h | r | igyekszik; fáradozik | um+A = fáradozik valamiért
sich konzentrieren | konzentriert | konzentrierte | konzentriert | h | r | koncentrál | auf+A = koncentrál valamire
sich verlieben | verliebt | verliebte | verliebt | h | r | beleszeret | in+A = beleszeret valakibe
sich sehnen | sehnt | sehnte | gesehnt | h | r | vágyakozik | nach+D = vágyik valami után
sich wundern | wundert | wunderte | gewundert | h | r | csodálkozik | über+A = csodálkozik valamin
sich schämen | schämt | schämte | geschämt | h | r | szégyelli magát | für+A = szégyelli magát valamiért
begeistern | begeistert | begeisterte | begeistert | h | r | lelkesít | für+A = lelkesít valamiért; sich für+A = lelkesedik valamiért
sich empören | empört | empörte | empört | h | r | felháborodik | über+A = felháborodik valamin
sich ekeln | ekelt | ekelte | geekelt | h | r | undorodik | vor+D = undorodik valamitől
sich hüten | hütet | hütete | gehütet | h | r | óvakodik | vor+D = óvakodik valamitől
sich langweilen | langweilt | langweilte | gelangweilt | h | r | unatkozik
sich wohlfühlen | fühlt wohl | fühlte wohl | wohlgefühlt | h | r | jól érzi magát
sich entspannen | entspannt | entspannte | entspannt | h | r | lazít; kikapcsolódik
sich erholen | erholt | erholte | erholt | h | r | kipiheni magát; felépül | von+D = kipiheni magát valamiből
verzweifeln | verzweifelt | verzweifelte | verzweifelt | s | r | kétségbe esik | an+D = kétségbe esik valami miatt
bereuen | bereut | bereute | bereut | h | r | megbán
vermissen | vermisst | vermisste | vermisst | h | r | hiányol; hiányzik neki
beneiden | beneidet | beneidete | beneidet | h | r | irigyel | um+A = irigyel valakit valamiért
bewundern | bewundert | bewunderte | bewundert | h | r | csodál | für+A = csodál valakit valamiért
enttäuschen | enttäuscht | enttäuschte | enttäuscht | h | r | csalódást okoz
beruhigen | beruhigt | beruhigte | beruhigt | h | r | megnyugtat
trösten | tröstet | tröstete | getröstet | h | r | vigasztal
überraschen | überrascht | überraschte | überrascht | h | r | meglep | mit+D = meglep valamivel
erschrecken | erschrickt | erschrak | erschrocken | s | i | megijed | vor+D = megijed valamitől
genießen | genießt | genoss | genossen | h | i | élvez
erleben | erlebt | erlebte | erlebt | h | r | átél; megél
ertragen | erträgt | ertrug | ertragen | h | i | elvisel
aushalten | hält aus | hielt aus | ausgehalten | h | i | kibír
leiden | leidet | litt | gelitten | h | i | szenved | an+D = szenved valamiben {betegség}; unter+D = szenved valamitől
träumen | träumt | träumte | geträumt | h | r | álmodik | von+D = álmodik valamiről
befürchten | befürchtet | befürchtete | befürchtet | h | r | tart valamitől; attól fél, hogy

@kommunikation
sich unterhalten | unterhält | unterhielt | unterhalten | h | i | beszélget; szórakozik | mit+D = beszélget valakivel; über+A = beszélget valamiről
sich verabschieden | verabschiedet | verabschiedete | verabschiedet | h | r | elbúcsúzik | von+D = elbúcsúzik valakitől
sich verständigen | verständigt | verständigte | verständigt | h | r | megérteti magát; megegyezik | mit+D = megérteti magát valakivel; auf+A = megegyezik valamiben
sich einigen | einigt | einigte | geeinigt | h | r | megegyezik | auf+A = megegyezik valamiben; mit+D = megegyezik valakivel
sich erkundigen | erkundigt | erkundigte | erkundigt | h | r | érdeklődik {információ után} | nach+D = érdeklődik valami felől; bei+D = érdeklődik valakinél
informieren | informiert | informierte | informiert | h | r | tájékoztat | über+A = tájékoztat valamiről; sich über+A = tájékozódik valamiről
sich wenden | wendet | wandte | gewandt | h | m | fordul {valakihez} | an+A = fordul valakihez
sich äußern | äußert | äußerte | geäußert | h | r | nyilatkozik | zu+D = nyilatkozik valamiről; über+A = megnyilatkozik valamiről
sich streiten | streitet | stritt | gestritten | h | i | veszekszik | mit+D = veszekszik valakivel; über+A = vitatkozik valamin
sich auseinandersetzen | setzt auseinander | setzte auseinander | auseinandergesetzt | h | r | behatóan foglalkozik; vitázik | mit+D = behatóan foglalkozik valamivel
sich verabreden | verabredet | verabredete | verabredet | h | r | találkozót beszél meg | mit+D = találkozót beszél meg valakivel
sich ausdrücken | drückt aus | drückte aus | ausgedrückt | h | r | kifejezi magát
bitten | bittet | bat | gebeten | h | i | kér | um+A = kér valamit
gratulieren | gratuliert | gratulierte | gratuliert | h | r | gratulál | D = gratulál valakinek; zu+D = gratulál valamihez
hinweisen | weist hin | wies hin | hingewiesen | h | i | utal; felhívja a figyelmet | auf+A = utal valamire
klagen | klagt | klagte | geklagt | h | r | panaszkodik {siránkozik}; pert indít | über+A = panaszkodik valamire; gegen+A = beperel valakit
nachdenken | denkt nach | dachte nach | nachgedacht | h | m | gondolkodik | über+A = gondolkodik valamin
reagieren | reagiert | reagierte | reagiert | h | r | reagál | auf+A = reagál valamire
überreden | überredet | überredete | überredet | h | r | rábeszél | zu+D = rábeszél valamire
verhandeln | verhandelt | verhandelte | verhandelt | h | r | tárgyal | über+A = tárgyal valamiről; mit+D = tárgyal valakivel
warnen | warnt | warnte | gewarnt | h | r | figyelmeztet | vor+D = figyelmeztet valamire
zustimmen | stimmt zu | stimmte zu | zugestimmt | h | r | egyetért; hozzájárul | D = egyetért valakivel/valamivel
widersprechen | widerspricht | widersprach | widersprochen | h | i | ellentmond | D = ellentmond valakinek
zuhören | hört zu | hörte zu | zugehört | h | r | meghallgat; odafigyel | D = meghallgat valakit
vorwerfen | wirft vor | warf vor | vorgeworfen | h | i | szemére vet | D+A = szemére vet valakinek valamit
empfehlen | empfiehlt | empfahl | empfohlen | h | i | ajánl | D+A = ajánl valakinek valamit
verbieten | verbietet | verbot | verboten | h | i | megtilt | D+A = megtilt valakinek valamit
erlauben | erlaubt | erlaubte | erlaubt | h | r | megenged | D+A = megenged valakinek valamit
mitteilen | teilt mit | teilte mit | mitgeteilt | h | r | közöl | D+A = közöl valakivel valamit
vorschlagen | schlägt vor | schlug vor | vorgeschlagen | h | i | javasol | D+A = javasol valakinek valamit
versichern | versichert | versicherte | versichert | h | r | biztosít; megnyugtat | D+A = biztosít valakit valamiről; gegen+A = biztosít valami ellen
verzeihen | verzeiht | verzieh | verziehen | h | i | megbocsát | D+A = megbocsát valakinek valamit
behaupten | behauptet | behauptete | behauptet | h | r | állít
bestreiten | bestreitet | bestritt | bestritten | h | i | vitat; tagad; fedez {költséget}
leugnen | leugnet | leugnete | geleugnet | h | r | letagad
zugeben | gibt zu | gab zu | zugegeben | h | i | beismer
gestehen | gesteht | gestand | gestanden | h | i | bevall | D+A = bevall valakinek valamit
verraten | verrät | verriet | verraten | h | i | elárul | D+A = elárul valakinek valamit
betonen | betont | betonte | betont | h | r | hangsúlyoz
hervorheben | hebt hervor | hob hervor | hervorgehoben | h | i | kiemel
erwähnen | erwähnt | erwähnte | erwähnt | h | r | megemlít
andeuten | deutet an | deutete an | angedeutet | h | r | célozgat; jelez
bemerken | bemerkt | bemerkte | bemerkt | h | r | észrevesz; megjegyez
kritisieren | kritisiert | kritisierte | kritisiert | h | r | kritizál | wegen+G = kritizál valami miatt
loben | lobt | lobte | gelobt | h | r | dicsér | für+A = megdicsér valamiért
beraten | berät | beriet | beraten | h | i | tanácsot ad; megtanácskoz | über+A = tanácskozik valamiről
auffordern | fordert auf | forderte auf | aufgefordert | h | r | felszólít | zu+D = felszólít valamire
fordern | fordert | forderte | gefordert | h | r | követel | von+D = követel valakitől
ermutigen | ermutigt | ermutigte | ermutigt | h | r | bátorít | zu+D = bátorít valamire
erläutern | erläutert | erläuterte | erläutert | h | r | kifejt; megmagyaráz | D+A = elmagyaráz valakinek valamit
begründen | begründet | begründete | begründet | h | r | megindokol; megalapoz | mit+D = megindokol valamivel
argumentieren | argumentiert | argumentierte | argumentiert | h | r | érvel | für+A = érvel valami mellett; gegen+A = érvel valami ellen
widerlegen | widerlegt | widerlegte | widerlegt | h | r | megcáfol
übertreiben | übertreibt | übertrieb | übertrieben | h | i | túloz
ankündigen | kündigt an | kündigte an | angekündigt | h | r | bejelent; beharangoz
benachrichtigen | benachrichtigt | benachrichtigte | benachrichtigt | h | r | értesít | von+D = értesít valamiről
berichten | berichtet | berichtete | berichtet | h | r | beszámol; tudósít | über+A = beszámol valamiről; von+D = hírt ad valamiről
erfahren | erfährt | erfuhr | erfahren | h | i | megtud | von+D = tudomást szerez valamiről; über+A = megtud valamit valamiről
absagen | sagt ab | sagte ab | abgesagt | h | r | lemond {programot} | D = lemondja valakinek {a meghívást}
zusagen | sagt zu | sagte zu | zugesagt | h | r | igent mond; megígér | D = igent mond valakinek
ausrichten | richtet aus | richtete aus | ausgerichtet | h | r | átad {üzenetet}; igazít | D+A = átad valakinek valamit {üzenetet}; auf+A = valamire irányít
richten | richtet | richtete | gerichtet | h | r | irányít; intéz | an+A = intéz valakihez; sich nach+D = igazodik valamihez

@abstrakt
achten | achtet | achtete | geachtet | h | r | figyel; tisztel | auf+A = figyel valamire
aufhören | hört auf | hörte auf | aufgehört | h | r | abbahagy | mit+D = abbahagy valamit
beitragen | trägt bei | trug bei | beigetragen | h | i | hozzájárul | zu+D = hozzájárul valamihez
beruhen | beruht | beruhte | beruht | h | r | alapul | auf+D = alapul valamin
gelten | gilt | galt | gegolten | h | i | érvényes; számít | für+A = érvényes valamire
halten | hält | hielt | gehalten | h | i | tart | von+D = véleménye van valamiről; für+A = tart valakit valaminek; sich an+A = betart valamit
handeln | handelt | handelte | gehandelt | h | r | cselekszik; kereskedik | von+D = szól valamiről; mit+D = kereskedik valamivel; sich um+A = valamiről van szó
kämpfen | kämpft | kämpfte | gekämpft | h | r | harcol | für+A = harcol valamiért; gegen+A = harcol valami ellen; um+A = küzd valamiért
neigen | neigt | neigte | geneigt | h | r | hajlik; hajlamos | zu+D = hajlamos valamire
profitieren | profitiert | profitierte | profitiert | h | r | profitál | von+D = profitál valamiből
rechnen | rechnet | rechnete | gerechnet | h | r | számol | mit+D = számol valamivel; auf+A = számít valakire
riechen | riecht | roch | gerochen | h | i | szagol; illatozik | nach+D = valami szaga van
verfügen | verfügt | verfügte | verfügt | h | r | rendelkezik | über+A = rendelkezik valamivel
vergleichen | vergleicht | verglich | verglichen | h | i | összehasonlít | mit+D = összehasonlít valamivel
verlangen | verlangt | verlangte | verlangt | h | r | követel; kíván | nach+D = vágyik valamire; von+D = elvár valakitől
verstoßen | verstößt | verstieß | verstoßen | h | i | megszeg; vét | gegen+A = megszeg valamit
verzichten | verzichtet | verzichtete | verzichtet | h | r | lemond {valamiről} | auf+A = lemond valamiről
vorbeugen | beugt vor | beugte vor | vorgebeugt | h | r | megelőz | D = megelőz valamit
wetten | wettet | wettete | gewettet | h | r | fogad {tétben} | um+A = fogad valamiben; auf+A = fogad valamire
zweifeln | zweifelt | zweifelte | gezweifelt | h | r | kételkedik | an+D = kételkedik valamiben
zählen | zählt | zählte | gezählt | h | r | számol; számít | auf+A = számít valakire; zu+D = tartozik valamihez
vertrauen | vertraut | vertraute | vertraut | h | r | megbízik | D = megbízik valakiben; auf+A = bízik valamiben
begegnen | begegnet | begegnete | begegnet | s | r | találkozik {véletlenül} | D = összetalálkozik valakivel
ausweichen | weicht aus | wich aus | ausgewichen | s | i | kitér | D = kitér valami elől
schaden | schadet | schadete | geschadet | h | r | árt | D = árt valakinek/valaminek
nützen | nützt | nützte | genützt | h | r | használ {hasznos} | D = használ valakinek
drohen | droht | drohte | gedroht | h | r | fenyeget | D = fenyeget valakit; mit+D = fenyeget valamivel
folgen | folgt | folgte | gefolgt | s | r | követ | D = követ valakit
gelingen | gelingt | gelang | gelungen | s | i | sikerül | D = sikerül valakinek
auffallen | fällt auf | fiel auf | aufgefallen | s | i | feltűnik | D = feltűnik valakinek
einfallen | fällt ein | fiel ein | eingefallen | s | i | eszébe jut | D = eszébe jut valakinek
vorkommen | kommt vor | kam vor | vorgekommen | s | i | előfordul; tűnik | D = tűnik valakinek valaminek
beistehen | steht bei | stand bei | beigestanden | h | i | mellette áll | D = támogat valakit
entsprechen | entspricht | entsprach | entsprochen | h | i | megfelel | D = megfelel valaminek
ähneln | ähnelt | ähnelte | geähnelt | h | r | hasonlít | D = hasonlít valakire
dienen | dient | diente | gedient | h | r | szolgál | D = szolgál valakit; zu+D = szolgál valamire
gedenken | gedenkt | gedachte | gedacht | h | m | megemlékezik | G = megemlékezik valakiről
bedürfen | bedarf | bedurfte | bedurft | h | m | igényel | G = szüksége van valamire
sich vergewissern | vergewissert | vergewisserte | vergewissert | h | r | megbizonyosodik | G = megbizonyosodik valamiről
zutrauen | traut zu | traute zu | zugetraut | h | r | kinéz valakiből | D+A = kinéz valakiből valamit
anvertrauen | vertraut an | vertraute an | anvertraut | h | r | rábíz | D+A = rábíz valakire valamit
ersparen | erspart | ersparte | erspart | h | r | megkímél | D+A = megkímél valakit valamitől
gönnen | gönnt | gönnte | gegönnt | h | r | nem irigyel; megenged | D+A = szívből kíván valakinek valamit
überlassen | überlässt | überließ | überlassen | h | i | átenged; rábíz | D+A = rábíz valakire valamit
sich beziehen | bezieht | bezog | bezogen | h | i | vonatkozik; hivatkozik | auf+A = hivatkozik valamire
sich eignen | eignet | eignete | geeignet | h | r | alkalmas | für+A = alkalmas valamire
entwickeln | entwickelt | entwickelte | entwickelt | h | r | fejleszt | sich zu+D = valamivé fejlődik
sich stützen | stützt | stützte | gestützt | h | r | támaszkodik | auf+A = támaszkodik valamire
sich wehren | wehrt | wehrte | gewehrt | h | r | védekezik | gegen+A = védekezik valami ellen
trennen | trennt | trennte | getrennt | h | r | szétválaszt; szelektál | von+D = elválaszt valamitől; sich von+D = szakít valakivel
sich(D) merken | merkt | merkte | gemerkt | h | r | megjegyez | A = megjegyez valamit
sich(D) überlegen | überlegt | überlegte | überlegt | h | r | átgondol; megfontol | A = átgondol valamit
sich(D) einbilden | bildet ein | bildete ein | eingebildet | h | r | képzelődik | A = bebeszél magának valamit
sich(D) aneignen | eignet an | eignete an | angeeignet | h | r | elsajátít | A = elsajátít valamit
sich ereignen | ereignet | ereignete | ereignet | h | r | megtörténik
sich verhalten | verhält | verhielt | verhalten | h | i | viselkedik | gegenüber+D = viselkedik valakivel szemben
sich bewähren | bewährt | bewährte | bewährt | h | r | beválik
sich durchsetzen | setzt durch | setzte durch | durchgesetzt | h | r | érvényesül; keresztülviszi akaratát | gegen+A = érvényesül valakivel szemben
sich ergeben | ergibt | ergab | ergeben | h | i | adódik; következik | aus+D = adódik valamiből
sich zurückziehen | zieht zurück | zog zurück | zurückgezogen | h | i | visszavonul | aus+D = visszavonul valahonnan
sich verspäten | verspätet | verspätete | verspätet | h | r | elkésik
sich zusammensetzen | setzt zusammen | setzte zusammen | zusammengesetzt | h | r | összetevődik | aus+D = valamiből áll
sich auswirken | wirkt aus | wirkte aus | ausgewirkt | h | r | kihat | auf+A = kihat valamire
sich lohnen | lohnt | lohnte | gelohnt | h | r | megéri
sich erweisen | erweist | erwies | erwiesen | h | i | bizonyul {valaminek}
sich irren | irrt | irrte | geirrt | h | r | téved | in+D = téved valakiben
sich täuschen | täuscht | täuschte | getäuscht | h | r | csalódik; téved | in+D = csalódik valakiben
sich weigern | weigert | weigerte | geweigert | h | r | vonakodik; megtagad
sich herausstellen | stellt heraus | stellte heraus | herausgestellt | h | r | kiderül
sich zurechtfinden | findet zurecht | fand zurecht | zurechtgefunden | h | i | eligazodik
sich abfinden | findet ab | fand ab | abgefunden | h | i | beletörődik | mit+D = beletörődik valamibe
sich anschließen | schließt an | schloss an | angeschlossen | h | i | csatlakozik | D = csatlakozik valakihez
sich entschließen | entschließt | entschloss | entschlossen | h | i | elhatározza magát | zu+D = elhatároz valamit
sich verpflichten | verpflichtet | verpflichtete | verpflichtet | h | r | kötelezi magát | zu+D = kötelezettséget vállal valamire
sich vertragen | verträgt | vertrug | vertragen | h | i | kijön {valakivel} | mit+D = jól kijön valakivel
sich anpassen | passt an | passte an | angepasst | h | r | alkalmazkodik | an+A = alkalmazkodik valamihez
sich auskennen | kennt aus | kannte aus | ausgekannt | h | m | kiismeri magát | mit+D = ért valamihez; in+D = kiismeri magát valahol
beschließen | beschließt | beschloss | beschlossen | h | i | elhatároz; határoz
vermuten | vermutet | vermutete | vermutet | h | r | feltételez; gyanít
ahnen | ahnt | ahnte | geahnt | h | r | sejt; megérez
bezweifeln | bezweifelt | bezweifelte | bezweifelt | h | r | kétségbe von
erwarten | erwartet | erwartete | erwartet | h | r | elvár; vár | von+D = elvár valakitől
voraussetzen | setzt voraus | setzte voraus | vorausgesetzt | h | r | előfeltételez
bevorzugen | bevorzugt | bevorzugte | bevorzugt | h | r | előnyben részesít
begreifen | begreift | begriff | begriffen | h | i | felfog; megért
erkennen | erkennt | erkannte | erkannt | h | m | felismer | an+D = felismer valamiről
wahrnehmen | nimmt wahr | nahm wahr | wahrgenommen | h | i | észlel; érzékel
beobachten | beobachtet | beobachtete | beobachtet | h | r | megfigyel
betrachten | betrachtet | betrachtete | betrachtet | h | r | szemlél; tekint
berücksichtigen | berücksichtigt | berücksichtigte | berücksichtigt | h | r | figyelembe vesz
beachten | beachtet | beachtete | beachtet | h | r | betart; ügyel
vernachlässigen | vernachlässigt | vernachlässigte | vernachlässigt | h | r | elhanyagol
übersehen | übersieht | übersah | übersehen | h | i | nem vesz észre; figyelmen kívül hagy
missverstehen | missversteht | missverstand | missverstanden | h | i | félreért
interpretieren | interpretiert | interpretierte | interpretiert | h | r | értelmez
zusammenfassen | fasst zusammen | fasste zusammen | zusammengefasst | h | r | összefoglal
darstellen | stellt dar | stellte dar | dargestellt | h | r | ábrázol; bemutat
unterscheiden | unterscheidet | unterschied | unterschieden | h | i | megkülönböztet | zwischen+D = különbséget tesz valamik között; von+D = megkülönböztet valamitől; sich von+D = különbözik valamitől
übereinstimmen | stimmt überein | stimmte überein | übereingestimmt | h | r | egyezik | mit+D = egyetért valakivel; in+D = egyetért valamiben
abweichen | weicht ab | wich ab | abgewichen | s | i | eltér | von+D = eltér valamitől
hindern | hindert | hinderte | gehindert | h | r | akadályoz | an+D = megakadályoz valakit valamiben
verursachen | verursacht | verursachte | verursacht | h | r | okoz
auslösen | löst aus | löste aus | ausgelöst | h | r | kivált {okoz}
bewirken | bewirkt | bewirkte | bewirkt | h | r | előidéz
beeinflussen | beeinflusst | beeinflusste | beeinflusst | h | r | befolyásol
beeinträchtigen | beeinträchtigt | beeinträchtigte | beeinträchtigt | h | r | hátrányosan befolyásol; csorbít
belasten | belastet | belastete | belastet | h | r | megterhel
entlasten | entlastet | entlastete | entlastet | h | r | tehermentesít
ermöglichen | ermöglicht | ermöglichte | ermöglicht | h | r | lehetővé tesz | D+A = lehetővé tesz valakinek valamit
erleichtern | erleichtert | erleichterte | erleichtert | h | r | megkönnyít | D+A = megkönnyít valakinek valamit
erschweren | erschwert | erschwerte | erschwert | h | r | megnehezít | D+A = megnehezít valakinek valamit
verhindern | verhindert | verhinderte | verhindert | h | r | megakadályoz
bewältigen | bewältigt | bewältigte | bewältigt | h | r | megbirkózik
lösen | löst | löste | gelöst | h | r | megold; old
umgehen | geht um | ging um | umgegangen | s | i | bánik | mit+D = bánik valamivel/valakivel
schaffen | schafft | schaffte | geschafft | h | r | véghezvisz; sikerül
erzielen | erzielt | erzielte | erzielt | h | r | elér {eredményt}
gelangen | gelangt | gelangte | gelangt | s | r | eljut | zu+D = eljut valamihez; an+A = eljut valahová
geraten | gerät | geriet | geraten | s | i | kerül {helyzetbe} | in+A = belekerül valamibe
stoßen | stößt | stieß | gestoßen | b | i | lök; ütközik | auf+A = rábukkan valamire
scheitern | scheitert | scheiterte | gescheitert | s | r | kudarcot vall | an+D = elbukik valamin
siegen | siegt | siegte | gesiegt | h | r | győz | über+A = legyőz valakit
verringern | verringert | verringerte | verringert | h | r | csökkent | um+A = csökkent valamennyivel
reduzieren | reduziert | reduzierte | reduziert | h | r | redukál; lecsökkent | auf+A = lecsökkent valamennyire
erhöhen | erhöht | erhöhte | erhöht | h | r | emel; növel | um+A = megemel valamennyivel; auf+A = megemel valamennyire
steigen | steigt | stieg | gestiegen | s | i | emelkedik | um+A = emelkedik valamennyivel; auf+A = emelkedik valamennyire
sinken | sinkt | sank | gesunken | s | i | csökken; süllyed | um+A = csökken valamennyivel; auf+A = lecsökken valamennyire
zunehmen | nimmt zu | nahm zu | zugenommen | h | i | növekszik; hízik | um+A = nő valamennyivel; an+D = gyarapodik valamiben
abnehmen | nimmt ab | nahm ab | abgenommen | h | i | csökken; fogy {testsúly}; átvesz | D+A = elvesz valakitől valamit
wachsen | wächst | wuchs | gewachsen | s | i | nő | um+A = nő valamennyivel
schwanken | schwankt | schwankte | geschwankt | h | r | ingadozik | zwischen+D = ingadozik valamik között
ergänzen | ergänzt | ergänzte | ergänzt | h | r | kiegészít | um+A = kiegészít valamivel
erweitern | erweitert | erweiterte | erweitert | h | r | bővít | um+A = kibővít valamivel
verlängern | verlängert | verlängerte | verlängert | h | r | meghosszabbít | um+A = meghosszabbít valamennyivel
verkürzen | verkürzt | verkürzte | verkürzt | h | r | lerövidít | um+A = lerövidít valamennyivel
beschränken | beschränkt | beschränkte | beschränkt | h | r | korlátoz | auf+A = korlátoz valamire
begrenzen | begrenzt | begrenzte | begrenzt | h | r | behatárol
ausschließen | schließt aus | schloss aus | ausgeschlossen | h | i | kizár | aus+D = kizár valahonnan
einbeziehen | bezieht ein | bezog ein | einbezogen | h | i | bevon | in+A = bevon valamibe
enthalten | enthält | enthielt | enthalten | h | i | tartalmaz
umfassen | umfasst | umfasste | umfasst | h | r | magában foglal
betreffen | betrifft | betraf | betroffen | h | i | érint; vonatkozik
bestimmen | bestimmt | bestimmte | bestimmt | h | r | meghatároz | über+A = rendelkezik valami felett
verbinden | verbindet | verband | verbunden | h | i | összeköt; beköt | mit+D = összeköt valamivel
teilen | teilt | teilte | geteilt | h | r | megoszt; oszt | mit+D = megoszt valakivel; durch+A = eloszt valamivel {matematika}
verteilen | verteilt | verteilte | verteilt | h | r | szétoszt | an+A = kioszt valakiknek; auf+A = eloszt valamik között
ersetzen | ersetzt | ersetzte | ersetzt | h | r | pótol; helyettesít | durch+A = helyettesít valamivel
austauschen | tauscht aus | tauschte aus | ausgetauscht | h | r | kicserél | gegen+A = kicserél valamire; sich mit+D = eszmét cserél valakivel
hinzufügen | fügt hinzu | fügte hinzu | hinzugefügt | h | r | hozzáad; hozzátesz
festlegen | legt fest | legte fest | festgelegt | h | r | meghatároz; rögzít {határidőt}
feststellen | stellt fest | stellte fest | festgestellt | h | r | megállapít
herausfinden | findet heraus | fand heraus | herausgefunden | h | i | kideríti
erhalten | erhält | erhielt | erhalten | h | i | kap; megőriz
behalten | behält | behielt | behalten | h | i | megtart
bewahren | bewahrt | bewahrte | bewahrt | h | r | megőriz | vor+D = megóv valamitől
aufbewahren | bewahrt auf | bewahrte auf | aufbewahrt | h | r | eltesz; tárol
verwenden | verwendet | verwendete | verwendet | h | r | használ; alkalmaz | für+A = felhasznál valamire
anwenden | wendet an | wandte an | angewandt | h | m | alkalmaz | auf+A = alkalmaz valamire
nutzen | nutzt | nutzte | genutzt | h | r | kihasznál; hasznosít
beseitigen | beseitigt | beseitigte | beseitigt | h | r | kiküszöböl; megszüntet
entfernen | entfernt | entfernte | entfernt | h | r | eltávolít
befestigen | befestigt | befestigte | befestigt | h | r | felerősít | an+D = rögzít valamin

@arbeit
sich einsetzen | setzt ein | setzte ein | eingesetzt | h | r | kiáll; síkra száll | für+A = kiáll valami mellett
sich engagieren | engagiert | engagierte | engagiert | h | r | elkötelezetten tevékenykedik | für+A = síkra száll valamiért
sich beteiligen | beteiligt | beteiligte | beteiligt | h | r | részt vesz | an+D = részt vesz valamiben
sich befassen | befasst | befasste | befasst | h | r | foglalkozik {témával} | mit+D = foglalkozik valamivel
sich anmelden | meldet an | meldete an | angemeldet | h | r | jelentkezik; bejelentkezik | für+A = jelentkezik valamire; zu+D = jelentkezik valamire {kurzusra}
sich abmelden | meldet ab | meldete ab | abgemeldet | h | r | kijelentkezik | von+D = kijelentkezik valahonnan
beantragen | beantragt | beantragte | beantragt | h | r | kérelmez | bei+D = kérelmez valakinél
genehmigen | genehmigt | genehmigte | genehmigt | h | r | engedélyez
erledigen | erledigt | erledigte | erledigt | h | r | elintéz
ablehnen | lehnt ab | lehnte ab | abgelehnt | h | r | elutasít
annehmen | nimmt an | nahm an | angenommen | h | i | elfogad; feltételez
anerkennen | erkennt an | erkannte an | anerkannt | h | m | elismer
beurteilen | beurteilt | beurteilte | beurteilt | h | r | megítél
bewerten | bewertet | bewertete | bewertet | h | r | értékel
einschätzen | schätzt ein | schätzte ein | eingeschätzt | h | r | felmér; megbecsül
umsetzen | setzt um | setzte um | umgesetzt | h | r | gyakorlatba ültet; megvalósít
durchführen | führt durch | führte durch | durchgeführt | h | r | végrehajt; lebonyolít
verwirklichen | verwirklicht | verwirklichte | verwirklicht | h | r | valóra vált
einführen | führt ein | führte ein | eingeführt | h | r | bevezet; importál
abschaffen | schafft ab | schaffte ab | abgeschafft | h | r | megszüntet; eltöröl
gründen | gründet | gründete | gegründet | h | r | alapít
leiten | leitet | leitete | geleitet | h | r | vezet {irányít}
führen | führt | führte | geführt | h | r | vezet; visz | zu+D = vezet valamihez
verwalten | verwaltet | verwaltete | verwaltet | h | r | igazgat; kezel
vereinbaren | vereinbart | vereinbarte | vereinbart | h | r | megállapodik; egyeztet | mit+D = megállapodik valakivel
verschieben | verschiebt | verschob | verschoben | h | i | elhalaszt; eltol | auf+A = elhalaszt valamikorra
einhalten | hält ein | hielt ein | eingehalten | h | i | betart
überschreiten | überschreitet | überschritt | überschritten | h | i | túllép; átlép
erfüllen | erfüllt | erfüllte | erfüllt | h | r | teljesít
übernehmen | übernimmt | übernahm | übernommen | h | i | átvesz; elvállal
kündigen | kündigt | kündigte | gekündigt | h | r | felmond | D = felmond valakinek
einstellen | stellt ein | stellte ein | eingestellt | h | r | alkalmaz {munkára}; beállít; leállít
entlassen | entlässt | entließ | entlassen | h | i | elbocsát | aus+D = elbocsát valahonnan
befördern | befördert | beförderte | befördert | h | r | előléptet; szállít | zu+D = előléptet valamivé
leisten | leistet | leistete | geleistet | h | r | teljesít; nyújt; megengedheti magának {sich D leisten}
mitwirken | wirkt mit | wirkte mit | mitgewirkt | h | r | közreműködik | an+D = közreműködik valamiben; bei+D = közreműködik valaminél
zusammenarbeiten | arbeitet zusammen | arbeitete zusammen | zusammengearbeitet | h | r | együttműködik | mit+D = együttműködik valakivel
ausfüllen | füllt aus | füllte aus | ausgefüllt | h | r | kitölt
unterschreiben | unterschreibt | unterschrieb | unterschrieben | h | i | aláír
einreichen | reicht ein | reichte ein | eingereicht | h | r | benyújt | bei+D = benyújt valakinél
nachweisen | weist nach | wies nach | nachgewiesen | h | i | igazol; kimutat | D+A = igazol valakinek valamit
bestätigen | bestätigt | bestätigte | bestätigt | h | r | megerősít; igazol
fördern | fördert | förderte | gefördert | h | r | elősegít; támogat {fejleszt}
zwingen | zwingt | zwang | gezwungen | h | i | kényszerít | zu+D = kényszerít valamire
veranlassen | veranlasst | veranlasste | veranlasst | h | r | elrendel; rávesz | zu+D = rávesz valamire
überwinden | überwindet | überwand | überwunden | h | i | legyőz; leküzd

@wirtschaft
sparen | spart | sparte | gespart | h | r | spórol; takarékoskodik | auf+A = spórol valamire; an+D = spórol valamin
ausgeben | gibt aus | gab aus | ausgegeben | h | i | költ {pénzt} | für+A = költ valamire
investieren | investiert | investierte | investiert | h | r | befektet | in+A = befektet valamibe
überweisen | überweist | überwies | überwiesen | h | i | átutal | D+A = átutal valakinek valamit; auf+A = átutal valamire {számlára}
vermieten | vermietet | vermietete | vermietet | h | r | bérbe ad | D+A = bérbe ad valakinek valamit; an+A = bérbe ad valakinek
liefern | liefert | lieferte | geliefert | h | r | leszállít | D+A = leszállít valakinek valamit
herstellen | stellt her | stellte her | hergestellt | h | r | gyárt; előállít
erzeugen | erzeugt | erzeugte | erzeugt | h | r | termel {energiát}; létrehoz
vertreiben | vertreibt | vertrieb | vertrieben | h | i | elűz; forgalmaz
werben | wirbt | warb | geworben | h | i | reklámoz; toboroz | für+A = reklámoz valamit; um+A = törekszik valamire, udvarol valakinek
anbieten | bietet an | bot an | angeboten | h | i | kínál; felajánl | D+A = felajánl valakinek valamit
tauschen | tauscht | tauschte | getauscht | h | r | cserél | gegen+A = elcserél valamire; mit+D = cserél valakivel
umtauschen | tauscht um | tauschte um | umgetauscht | h | r | becserél {árut} | gegen+A = becserél valamire
reklamieren | reklamiert | reklamierte | reklamiert | h | r | reklamál
erstatten | erstattet | erstattete | erstattet | h | r | visszatérít | D+A = visszatérít valakinek valamit
erwerben | erwirbt | erwarb | erworben | h | i | szerez; megvásárol
haften | haftet | haftete | gehaftet | h | r | felel {jogilag}; tapad | für+A = felel valamiért
garantieren | garantiert | garantierte | garantiert | h | r | garantál | D+A = garantál valakinek valamit

@gesellschaft
abstimmen | stimmt ab | stimmte ab | abgestimmt | h | r | szavaz; egyeztet | über+A = szavaz valamiről; mit+D = egyeztet valakivel
wählen | wählt | wählte | gewählt | h | r | választ; szavaz | zu+D = megválaszt valamivé
regieren | regiert | regierte | regiert | h | r | kormányoz; uralkodik
protestieren | protestiert | protestierte | protestiert | h | r | tiltakozik | gegen+A = tiltakozik valami ellen
demonstrieren | demonstriert | demonstrierte | demonstriert | h | r | tüntet; bemutat | für+A = tüntet valami mellett; gegen+A = tüntet valami ellen
fliehen | flieht | floh | geflohen | s | i | menekül | vor+D = menekül valami elől; aus+D = elmenekül valahonnan
auswandern | wandert aus | wanderte aus | ausgewandert | s | r | kivándorol | nach+D = kivándorol valahová
einwandern | wandert ein | wanderte ein | eingewandert | s | r | bevándorol | in+A = bevándorol valahová
integrieren | integriert | integrierte | integriert | h | r | integrál; beilleszt | in+A = beilleszt valamibe
diskriminieren | diskriminiert | diskriminierte | diskriminiert | h | r | diszkriminál
benachteiligen | benachteiligt | benachteiligte | benachteiligt | h | r | hátrányos helyzetbe hoz
respektieren | respektiert | respektierte | respektiert | h | r | tiszteletben tart
tolerieren | toleriert | tolerierte | toleriert | h | r | eltűr; tolerál
verteidigen | verteidigt | verteidigte | verteidigt | h | r | megvéd | gegen+A = megvéd valami ellen
betreuen | betreut | betreute | betreut | h | r | gondoz; felügyel
pflegen | pflegt | pflegte | gepflegt | h | r | ápol

@recht
ermitteln | ermittelt | ermittelte | ermittelt | h | r | nyomoz; kiderít | gegen+A = nyomoz valaki ellen
verurteilen | verurteilt | verurteilte | verurteilt | h | r | elítél | zu+D = elítél valamire
bestrafen | bestraft | bestrafte | bestraft | h | r | megbüntet | für+A = megbüntet valamiért; mit+D = büntet valamivel
verklagen | verklagt | verklagte | verklagt | h | r | beperel | auf+A = beperel valamiért {összegre}; wegen+G = beperel valami miatt
anzeigen | zeigt an | zeigte an | angezeigt | h | r | feljelent; kijelez | wegen+G = feljelent valami miatt
anklagen | klagt an | klagte an | angeklagt | h | r | vádat emel | A+G = vádol valakit valamivel; wegen+G = vádat emel valami miatt
beschuldigen | beschuldigt | beschuldigte | beschuldigt | h | r | megvádol | A+G = megvádol valakit valamivel
verdächtigen | verdächtigt | verdächtigte | verdächtigt | h | r | gyanúsít | A+G = gyanúsít valakit valamivel
stehlen | stiehlt | stahl | gestohlen | h | i | lop | D+A = ellop valakitől valamit
betrügen | betrügt | betrog | betrogen | h | i | becsap; megcsal | um+A = megkárosít valamivel
schwören | schwört | schwor | geschworen | h | i | esküszik | auf+A = megesküszik valamire
beweisen | beweist | bewies | bewiesen | h | i | bizonyít | D+A = bebizonyít valakinek valamit
belegen | belegt | belegte | belegt | h | r | alátámaszt; felvesz {kurzust}

@gesundheit
behandeln | behandelt | behandelte | behandelt | h | r | kezel | wegen+G = kezel valami miatt
heilen | heilt | heilte | geheilt | h | r | gyógyít | von+D = meggyógyít valamiből
operieren | operiert | operierte | operiert | h | r | megoperál
verschreiben | verschreibt | verschrieb | verschrieben | h | i | felír {gyógyszert} | D+A = felír valakinek valamit
erkranken | erkrankt | erkrankte | erkrankt | s | r | megbetegszik | an+D = megbetegszik valamiben
verletzen | verletzt | verletzte | verletzt | h | r | megsebez; megsért
schützen | schützt | schützte | geschützt | h | r | véd | vor+D = véd valami ellen; sich vor+D = védekezik valami ellen
retten | rettet | rettete | gerettet | h | r | megment | vor+D = megment valamitől; aus+D = kiment valahonnan
bedrohen | bedroht | bedrohte | bedroht | h | r | megfenyeget
gefährden | gefährdet | gefährdete | gefährdet | h | r | veszélyeztet
sich ernähren | ernährt | ernährte | ernährt | h | r | táplálkozik | von+D = táplálkozik valamivel

@umwelt
verschmutzen | verschmutzt | verschmutzte | verschmutzt | h | r | szennyez
recyceln | recycelt | recycelte | recycelt | h | r | újrahasznosít
verbrauchen | verbraucht | verbrauchte | verbraucht | h | r | elhasznál; fogyaszt
verschwenden | verschwendet | verschwendete | verschwendet | h | r | pazarol
entsorgen | entsorgt | entsorgte | entsorgt | h | r | ártalmatlanít {hulladékot}
sammeln | sammelt | sammelte | gesammelt | h | r | gyűjt

@bildung
abschließen | schließt ab | schloss ab | abgeschlossen | h | i | lezár; befejez; megköt {szerződést}
absolvieren | absolviert | absolvierte | absolviert | h | r | elvégez {képzést}
durchfallen | fällt durch | fiel durch | durchgefallen | s | i | megbukik | in+D = megbukik valamiből; bei+D = megbukik valamin
promovieren | promoviert | promovierte | promoviert | h | r | doktorál | in+D = doktorál valamiből; über+A = doktorál valamilyen témából
zitieren | zitiert | zitierte | zitiert | h | r | idéz | aus+D = idéz valamiből
übersetzen | übersetzt | übersetzte | übersetzt | h | r | fordít | aus+D = fordít valamiről; in+A = lefordít valamire
korrigieren | korrigiert | korrigierte | korrigiert | h | r | kijavít
prüfen | prüft | prüfte | geprüft | h | r | vizsgáztat; megvizsgál
überprüfen | überprüft | überprüfte | überprüft | h | r | felülvizsgál; ellenőriz
vermitteln | vermittelt | vermittelte | vermittelt | h | r | közvetít; átad {tudást} | zwischen+D = közvetít valakik között
beibringen | bringt bei | brachte bei | beigebracht | h | m | megtanít | D+A = megtanít valakinek valamit
leihen | leiht | lieh | geliehen | h | i | kölcsönad | D+A = kölcsönad valakinek valamit
untersuchen | untersucht | untersuchte | untersucht | h | r | megvizsgál
erforschen | erforscht | erforschte | erforscht | h | r | kutat; feltár
forschen | forscht | forschte | geforscht | h | r | kutat | nach+D = kutat valami után
entdecken | entdeckt | entdeckte | entdeckt | h | r | felfedez
erfinden | erfindet | erfand | erfunden | h | i | feltalál; kitalál
verbessern | verbessert | verbesserte | verbessert | h | r | javít; feljavít
verändern | verändert | veränderte | verändert | h | r | megváltoztat; átalakít

@medien
verfassen | verfasst | verfasste | verfasst | h | r | megír; megfogalmaz
veröffentlichen | veröffentlicht | veröffentlichte | veröffentlicht | h | r | közzétesz; publikál
verbreiten | verbreitet | verbreitete | verbreitet | h | r | terjeszt
übertragen | überträgt | übertrug | übertragen | h | i | közvetít; átvisz | auf+A = átvisz valamire
aufnehmen | nimmt auf | nahm auf | aufgenommen | h | i | felvesz; befogad | in+A = felvesz valahová
speichern | speichert | speicherte | gespeichert | h | r | ment; tárol
löschen | löscht | löschte | gelöscht | h | r | töröl; olt
herunterladen | lädt herunter | lud herunter | heruntergeladen | h | i | letölt
hochladen | lädt hoch | lud hoch | hochgeladen | h | i | feltölt
installieren | installiert | installierte | installiert | h | r | telepít
programmieren | programmiert | programmierte | programmiert | h | r | programoz

@verkehr
begleiten | begleitet | begleitete | begleitet | h | r | elkísér
verreisen | verreist | verreiste | verreist | s | r | elutazik
stornieren | storniert | stornierte | storniert | h | r | lemond {foglalást}; sztornóz
verpassen | verpasst | verpasste | verpasst | h | r | lekésik; elmulaszt
überholen | überholt | überholte | überholt | h | r | megelőz {járművel}
abbiegen | biegt ab | bog ab | abgebogen | s | i | bekanyarodik
transportieren | transportiert | transportierte | transportiert | h | r | szállít; fuvaroz
sich aufhalten | hält auf | hielt auf | aufgehalten | h | i | tartózkodik
sich verlaufen | verläuft | verlief | verlaufen | h | i | eltéved {gyalog}

@wohnen
einrichten | richtet ein | richtete ein | eingerichtet | h | r | berendez; létrehoz
renovieren | renoviert | renovierte | renoviert | h | r | felújít
heizen | heizt | heizte | geheizt | h | r | fűt
lüften | lüftet | lüftete | gelüftet | h | r | szellőztet
`;
