/**
 * Tömör, soronkénti szólista-formátum értelmezője.
 *
 * Ezer szó teljes `SeedWord` objektumként kezelhetetlenül hosszú és nehezen
 * lektorálható lenne, ezért a szólisták egy sort írnak szavanként, a mezőket
 * ` | ` választja el. Az értelmező minden sort szigorúan ellenőriz (ismeretlen
 * jelölés, hiányzó mező, ellentmondó adat → kivétel a sorszámmal), így a hibák
 * már a seed futtatása előtt, az egységtesztben kiderülnek.
 *
 * Közös szabályok
 *   * `# …`      megjegyzés; üres sor kihagyva.
 *   * `@slug`    a következő sorok tematikus kategóriája (a halmaz saját
 *                gyűjtőkategóriája mellett).
 *   * Fordítások: `;`-vel elválasztva, az első az elsődleges; `{…}` a
 *                jelentésárnyalat (senseNote), pl. `bank {pénzintézet}`.
 *   * Vonzatok:  `;`-vel elválasztva, mindegyik `vonzat = magyar jelentés`, ahol
 *                a vonzat `elöljáró+ESET` (`auf+A`), puszta eset (`D`) vagy két
 *                tárgy (`D+A`); az eset A/D/G jelű. A `sich ` előtag visszaható
 *                szerkezetet jelöl (igénél alapértelmezés, ha az ige visszaható).
 *
 * Főnév:      `der Antrag | ¨+e | +s | kérvény; kérelem | auf+A = kérelem valamire`
 *   névelő:     der / die / das; `der*` = gyenge (n-)deklináció; `pl` = csak
 *               többes számú (a lemma maga a többes alak).
 *   többes sz.: `-` nincs (Singularetantum), `=` azonos alak, `¨` csak
 *               umlaut, `+e`/`¨+e`/`+n`/… végződés, vagy teljes alak.
 *   birtokos:   üres = szabály szerint (nőnem: változatlan; hím-/semlegesnem:
 *               -s, sziszegő hang után és egy szótagú szónál -es; -us/-mus
 *               változatlan; -nis → -nisses; n-deklináció: -(e)n), `+s`/`+es`/…
 *               végződés, vagy teljes alak.
 *
 * Ige:        `vorstellen | stellt vor | stellte vor | vorgestellt | h | r | bemutat | D+A = bemutat valakinek valakit`
 *   lemma:      `sich ` (tárgyesetű) / `sich(D) ` (részes esetű) előtaggal visszaható;
 *               a ragozott alakokba a `sich` automatikusan bekerül.
 *   segédige:   h = haben, s = sein, b = mindkettő.
 *   ragozás:    r = gyenge, i = erős, m = vegyes.
 *   Az elváló igekötőt a jelen idejű alak utolsó szava adja (`stellt vor`).
 *
 * Melléknév:  `abhängig | | függő | von+D = függ valamitől/valakitől`
 *   fokozás:    üres = szabályos (-er / am -(e)sten), `-` nem fokozható,
 *               `älter, am ältesten` teljes alak; a mező végén ` präd` = csak
 *               állítmányként használható.
 *
 * Kifejezés:  `zur Verfügung stellen | rendelkezésre bocsát | D+A = rendelkezésére bocsát valakinek valamit`
 * Egyéb:      `präp | aufgrund | valami miatt, alapján | G = valami miatt`
 *   szófaj:     adv / konj / präp.
 */
import {
  AuxiliaryVerb,
  CefrLevel,
  ConjugationType,
  GrammaticalCase,
  GrammaticalGender,
  NumberType,
  PartOfSpeech,
  ReflexiveType,
} from '@prisma/client';
import { SeedTranslation, SeedValency, SeedWord } from '../seed-writer';

export interface ParseOptions {
  /** A halmaz minden szavának CEFR-szintje. */
  level: CefrLevel;
  /** A halmaz gyűjtőkategóriája – minden szó megkapja. */
  baseCategory: string;
  /** Forrás neve a hibaüzenetekhez. */
  source: string;
}

class ParseError extends Error {
  constructor(source: string, lineNo: number, line: string, message: string) {
    super(`${source}:${lineNo}: ${message}\n  → ${line}`);
    this.name = 'ParseError';
  }
}

interface Line {
  no: number;
  text: string;
  fields: string[];
  category: string | null;
}

/** Sorokra bontás, megjegyzések és `@kategória` direktívák kezelése. */
function lines(text: string): Line[] {
  const out: Line[] = [];
  let category: string | null = null;
  for (const [i, raw] of text.split('\n').entries()) {
    const t = raw.trim();
    if (t === '' || t.startsWith('#')) continue;
    if (t.startsWith('@')) {
      category = t.slice(1).trim();
      continue;
    }
    out.push({ no: i + 1, text: t, fields: t.split('|').map((f) => f.trim()), category });
  }
  return out;
}

function categoriesOf(line: Line, opts: ParseOptions): string[] {
  return line.category ? [opts.baseCategory, line.category] : [opts.baseCategory];
}

// ---------------------------------------------------------------------------
// Közös mezők
// ---------------------------------------------------------------------------

function parseTranslations(field: string, fail: (m: string) => never): [SeedTranslation, ...SeedTranslation[]] {
  const items = field
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s !== '')
    .map((s): SeedTranslation => {
      const m = /^(.*?)\s*\{([^}]+)\}$/.exec(s);
      return m ? { text: m[1]!.trim(), senseNote: m[2]!.trim() } : { text: s };
    });
  if (items.length === 0 || items.some((t) => t.text === '')) fail('hiányzó fordítás');
  const texts = items.map((t) => t.text);
  if (new Set(texts).size !== texts.length) fail('ismétlődő fordítás');
  return items as [SeedTranslation, ...SeedTranslation[]];
}

const CASES: Record<string, { value: GrammaticalCase; label: string }> = {
  A: { value: GrammaticalCase.ACCUSATIVE, label: 'Akk.' },
  D: { value: GrammaticalCase.DATIVE, label: 'Dat.' },
  G: { value: GrammaticalCase.GENITIVE, label: 'Gen.' },
};

/**
 * @param head      a minta eleje (pl. „Antrag”, „sich freuen”) – a `sich`
 *                  előtagot a vonzat maga is megadhatja.
 * @param reflexive a szó alapértelmezés szerint visszaható-e (igéknél).
 */
function parseValencies(field: string | undefined, head: string, reflexive: boolean, fail: (m: string) => never): SeedValency[] {
  if (!field) return [];
  const out: SeedValency[] = [];
  for (const raw of field
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s !== '')) {
    const eq = raw.indexOf('=');
    if (eq < 0) fail(`vonzat jelentés nélkül: „${raw}”`);
    let spec = raw.slice(0, eq).trim();
    const meaning = raw.slice(eq + 1).trim();
    if (meaning === '') fail(`üres vonzatjelentés: „${raw}”`);

    let isReflexive = reflexive;
    if (spec.startsWith('sich ')) {
      isReflexive = true;
      spec = spec.slice(5).trim();
    }

    let m: RegExpExecArray | null;
    let valency: Omit<SeedValency, 'meaning' | 'isReflexive' | 'pattern'> & { tail: string };
    if ((m = /^([a-zäöüß]+)\+([ADG])$/.exec(spec))) {
      const c = CASES[m[2]!]!;
      valency = { preposition: m[1]!, governedCase: c.value, tail: `${m[1]} + ${c.label}` };
    } else if ((m = /^([ADG])(?:\+([ADG]))?$/.exec(spec))) {
      const c1 = CASES[m[1]!]!;
      const c2 = m[2] ? CASES[m[2]]! : null;
      valency = { preposition: null, governedCase: c1.value, tail: c2 ? `+ ${c1.label} + ${c2.label}` : `+ ${c1.label}` };
    } else {
      fail(`ismeretlen vonzatjelölés: „${spec}”`);
    }

    const base = isReflexive && !head.startsWith('sich ') ? `sich ${head}` : head;
    const { tail, ...rest } = valency;
    out.push({ ...rest, isReflexive, pattern: `${base} ${tail}`, meaning });
  }
  const keys = out.map((v) => `${v.preposition}:${v.governedCase}:${v.isReflexive}`);
  if (new Set(keys).size !== keys.length) fail('ismétlődő vonzat (azonos elöljáró + eset)');
  return out;
}

// ---------------------------------------------------------------------------
// Főnevek
// ---------------------------------------------------------------------------

const UMLAUT: Record<string, string> = { a: 'ä', o: 'ö', u: 'ü' };

/** A tő utolsó a/o/u (au → äu) magánhangzójának umlautja. */
export function umlaut(word: string): string | null {
  for (let i = word.length - 1; i >= 0; i--) {
    const ch = word[i]!;
    if (!(ch in UMLAUT)) continue;
    if (ch === 'u' && word[i - 1] === 'a') return `${word.slice(0, i - 1)}äu${word.slice(i + 1)}`;
    if (ch === 'u' && word[i - 1] === 'e') continue; // eu: nem umlautozható
    return `${word.slice(0, i)}${UMLAUT[ch]}${word.slice(i + 1)}`;
  }
  return null;
}

/** `+e`, `¨+er`, `¨`, `=` vagy teljes alak feloldása. */
function inflect(lemma: string, spec: string, fail: (m: string) => never): string {
  if (spec === '=') return lemma;
  const m = /^(¨)?(?:\+([a-zäöüß]+))?$/.exec(spec);
  if (m && (m[1] || m[2])) {
    let stem = lemma;
    if (m[1]) {
      const u = umlaut(lemma);
      if (!u) fail(`nem umlautozható: ${lemma}`);
      stem = u;
    }
    return stem + (m[2] ?? '');
  }
  if (/^[A-ZÄÖÜ]/.test(spec)) return spec;
  fail(`ismeretlen alakjelölés: „${spec}”`);
}

function defaultGenitive(lemma: string, gender: GrammaticalGender, nDecl: boolean, pluralSpec: string): string {
  if (gender === GrammaticalGender.FEMININE) return lemma;
  if (nDecl) return lemma.endsWith('e') ? `${lemma}n` : `${lemma}en`;
  if (lemma.endsWith('nis')) return `${lemma}ses`;
  if (lemma.endsWith('us')) return lemma;
  if (/(s|ß|x|z|sch)$/.test(lemma)) return `${lemma}es`;
  // Egy szótagú, mássalhangzóra végződő szónál a hosszabb alak a szokásos
  // (des Rates, des Marktes) – kivéve az -s többes számú jövevényszavakat (des Streiks).
  const syllables = lemma.toLowerCase().match(/[aeiouäöüy]+/g)?.length ?? 0;
  if (syllables === 1 && /[^aeiouäöüy]$/i.test(lemma) && pluralSpec !== '+s') return `${lemma}es`;
  return `${lemma}s`;
}

const ARTICLES: Record<string, GrammaticalGender> = {
  der: GrammaticalGender.MASCULINE,
  die: GrammaticalGender.FEMININE,
  das: GrammaticalGender.NEUTER,
};

export function parseNouns(text: string, opts: ParseOptions): SeedWord[] {
  return lines(text).map((line) => {
    const fail = (m: string): never => {
      throw new ParseError(opts.source, line.no, line.text, m);
    };
    const [head, plural, genitive, translations, valencies, ...extra] = line.fields;
    if (!head || plural === undefined || genitive === undefined || !translations || extra.length > 0) {
      fail('a főnévsor formátuma: névelő Lemma | többes | birtokos | fordítások [| vonzatok]');
    }
    const hm = /^(der\*|der|die|das|pl) ([A-ZÄÖÜ][^\s]*)$/.exec(head!);
    if (!hm) fail(`ismeretlen névelő vagy lemma: „${head}”`);
    const article = hm![1]!;
    const lemma = hm![2]!;

    let data: Extract<NonNullable<SeedWord['attributes']>, { kind: 'noun' }>['data'];
    if (article === 'pl') {
      if (plural !== '' || genitive !== '') fail('csak többes számú főnévnél a többes és birtokos mező üres');
      data = { numberType: NumberType.PLURAL_ONLY, pluralForm: lemma };
    } else {
      const nDecl = article === 'der*';
      const gender = ARTICLES[nDecl ? 'der' : article]!;
      if (plural === '') fail('hiányzó többes szám (`-` = nincs)');
      const singularOnly = plural === '-';
      data = {
        gender,
        numberType: singularOnly ? NumberType.SINGULAR_ONLY : NumberType.REGULAR,
        pluralForm: singularOnly ? null : inflect(lemma, plural!, fail),
        genitiveSingular: genitive === '' ? defaultGenitive(lemma, gender, nDecl, plural!) : inflect(lemma, genitive!, fail),
        isNDeclension: nDecl,
      };
    }

    return {
      lemma,
      partOfSpeech: PartOfSpeech.NOUN,
      cefrLevel: opts.level,
      categories: categoriesOf(line, opts),
      translations: parseTranslations(translations!, fail),
      attributes: { kind: 'noun', data },
      valencies: parseValencies(valencies, lemma, false, fail),
    };
  });
}

// ---------------------------------------------------------------------------
// Igék
// ---------------------------------------------------------------------------

const AUX: Record<string, AuxiliaryVerb> = { h: AuxiliaryVerb.HABEN, s: AuxiliaryVerb.SEIN, b: AuxiliaryVerb.BOTH };
const CONJ: Record<string, ConjugationType> = {
  r: ConjugationType.REGULAR,
  i: ConjugationType.IRREGULAR,
  m: ConjugationType.MIXED,
};

/** „stellt vor” → „stellt sich vor”. */
function withSich(form: string): string {
  const [first, ...rest] = form.split(' ');
  return [first, 'sich', ...rest].join(' ');
}

export function parseVerbs(text: string, opts: ParseOptions): SeedWord[] {
  return lines(text).map((line) => {
    const fail = (m: string): never => {
      throw new ParseError(opts.source, line.no, line.text, m);
    };
    const [head, pres, pret, part, aux, conj, translations, valencies, ...extra] = line.fields;
    if (!head || !pres || !pret || !part || !aux || !conj || !translations || extra.length > 0) {
      fail('az igesor formátuma: lemma | jelen E/3 | Prät. E/3 | Partizip II | h/s/b | r/i/m | fordítások [| vonzatok]');
    }
    const hm = /^(?:(sich|sich\(D\)) )?([a-zäöüß]+)$/.exec(head!);
    if (!hm) fail(`érvénytelen igelemma: „${head}”`);
    const reflexiveType = hm![1] === 'sich' ? ReflexiveType.ACCUSATIVE : hm![1] ? ReflexiveType.DATIVE : ReflexiveType.NONE;
    const lemma = hm![2]!;
    const reflexive = reflexiveType !== ReflexiveType.NONE;

    const auxiliary = AUX[aux!] ?? fail(`ismeretlen segédige: „${aux}”`);
    const conjugationType = CONJ[conj!] ?? fail(`ismeretlen ragozási típus: „${conj}”`);
    for (const f of [pres!, pret!]) {
      if (/\bsich\b/.test(f)) fail('a `sich`-et az értelmező illeszti be, a ragozott alakba ne írd');
    }
    if (part!.includes(' ')) fail(`a Partizip II egy szó: „${part}”`);

    const presWords = pres!.split(' ');
    const prefix = presWords.length > 1 ? presWords[presWords.length - 1]! : null;
    if (presWords.length > 2) fail(`túl sok szó a jelen idejű alakban: „${pres}”`);
    if (prefix && !lemma.startsWith(prefix)) fail(`az igekötő („${prefix}”) nem a lemma eleje`);
    if (prefix && pret!.split(' ').pop() !== prefix) fail('a Präteritum alakból hiányzik az igekötő');
    if (prefix && !part!.startsWith(prefix)) fail('a Partizip II nem az igekötővel kezdődik');

    return {
      lemma,
      partOfSpeech: PartOfSpeech.VERB,
      cefrLevel: opts.level,
      categories: categoriesOf(line, opts),
      translations: parseTranslations(translations!, fail),
      attributes: {
        kind: 'verb',
        data: {
          conjugationType,
          auxiliary,
          present3sg: reflexive ? withSich(pres!) : pres!,
          preterite3sg: reflexive ? withSich(pret!) : pret!,
          pastParticiple: part!,
          isSeparable: prefix !== null,
          separablePrefix: prefix,
          reflexiveType,
        },
      },
      valencies: parseValencies(valencies, lemma, reflexive, fail),
    };
  });
}

// ---------------------------------------------------------------------------
// Melléknevek
// ---------------------------------------------------------------------------

/** Szabályos fokozás: dunkel → dunkler, teuer → teurer, leise → leiser; -(e)sten. */
export function regularComparison(lemma: string): { comparative: string; superlative: string } {
  let comparative: string;
  if (lemma.endsWith('e')) comparative = `${lemma}r`;
  else if (lemma.endsWith('el')) comparative = `${lemma.slice(0, -2)}ler`;
  else if (/(au|eu)er$/.test(lemma)) comparative = `${lemma.slice(0, -2)}rer`;
  else comparative = `${lemma}er`;

  // -esten: d, t, s, ß, x, z, sch után (kivéve a hangsúlytalan -isch és a
  // melléknévi igenévi -end végződést: am typischsten, am spannendsten).
  const needsE = /(d|t|s|ß|x|z|sch)$/.test(lemma) && !/(isch|end)$/.test(lemma);
  const superlative = lemma.endsWith('e') ? `am ${lemma}sten` : needsE ? `am ${lemma}esten` : `am ${lemma}sten`;
  return { comparative, superlative };
}

function stripUmlaut(s: string): string {
  return s.replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/ü/g, 'u');
}

export function parseAdjectives(text: string, opts: ParseOptions): SeedWord[] {
  return lines(text).map((line) => {
    const fail = (m: string): never => {
      throw new ParseError(opts.source, line.no, line.text, m);
    };
    const [lemma, comparison, translations, valencies, ...extra] = line.fields;
    if (!lemma || comparison === undefined || !translations || extra.length > 0) {
      fail('a melléknévsor formátuma: lemma | fokozás | fordítások [| vonzatok]');
    }
    if (!/^[a-zäöüß-]+$/.test(lemma!)) fail(`érvénytelen melléknév: „${lemma}”`);

    let spec = comparison!;
    const isPredicativeOnly = /(^|\s)präd$/.test(spec);
    if (isPredicativeOnly) spec = spec.replace(/\s*präd$/, '').trim();

    let comparative: string | null;
    let superlative: string | null;
    if (spec === '-') {
      comparative = superlative = null;
    } else if (spec === '') {
      ({ comparative, superlative } = regularComparison(lemma!));
    } else {
      const m = /^([a-zäöüß]+), (am [a-zäöüß]+)$/.exec(spec);
      if (!m) fail(`ismeretlen fokozásjelölés: „${spec}”`);
      comparative = m![1]!;
      superlative = m![2]!;
    }
    // Rendhagyó, ha a középfok (umlaut nélkül) nem a lemma tövéből képződik.
    const stem = stripUmlaut(lemma!.replace(/e$/, '').replace(/el$/, 'l').replace(/er$/, 'r'));
    const isIrregularComparison = comparative !== null && !stripUmlaut(comparative).startsWith(stem.slice(0, -1));

    return {
      lemma: lemma!,
      partOfSpeech: PartOfSpeech.ADJECTIVE,
      cefrLevel: opts.level,
      categories: categoriesOf(line, opts),
      translations: parseTranslations(translations!, fail),
      attributes: {
        kind: 'adjective',
        data: { comparative, superlative, isIrregularComparison, isPredicativeOnly },
      },
      valencies: parseValencies(valencies, lemma!, false, fail),
    };
  });
}

// ---------------------------------------------------------------------------
// Kifejezések és egyéb szófajok
// ---------------------------------------------------------------------------

export function parsePhrases(text: string, opts: ParseOptions): SeedWord[] {
  return lines(text).map((line) => {
    const fail = (m: string): never => {
      throw new ParseError(opts.source, line.no, line.text, m);
    };
    const [lemma, translations, valencies, ...extra] = line.fields;
    if (!lemma || !translations || extra.length > 0) fail('a kifejezéssor formátuma: kifejezés | fordítások [| vonzatok]');
    return {
      lemma: lemma!,
      partOfSpeech: PartOfSpeech.PHRASE,
      cefrLevel: opts.level,
      categories: categoriesOf(line, opts),
      translations: parseTranslations(translations!, fail),
      valencies: parseValencies(valencies, lemma!, false, fail),
    };
  });
}

const OTHER_POS: Record<string, PartOfSpeech> = {
  adv: PartOfSpeech.ADVERB,
  konj: PartOfSpeech.CONJUNCTION,
  präp: PartOfSpeech.PREPOSITION,
};

export function parseOther(text: string, opts: ParseOptions): SeedWord[] {
  return lines(text).map((line) => {
    const fail = (m: string): never => {
      throw new ParseError(opts.source, line.no, line.text, m);
    };
    const [pos, lemma, translations, valencies, ...extra] = line.fields;
    if (!pos || !lemma || !translations || extra.length > 0) fail('a sor formátuma: adv/konj/präp | lemma | fordítások [| vonzatok]');
    const partOfSpeech = OTHER_POS[pos!] ?? fail(`ismeretlen szófaj: „${pos}”`);
    if (partOfSpeech === PartOfSpeech.PREPOSITION && !valencies) fail('az elöljárónál kötelező az esetvonzat');
    return {
      lemma: lemma!,
      partOfSpeech,
      cefrLevel: opts.level,
      categories: categoriesOf(line, opts),
      translations: parseTranslations(translations!, fail),
      valencies: parseValencies(valencies, lemma!, false, fail),
    };
  });
}
