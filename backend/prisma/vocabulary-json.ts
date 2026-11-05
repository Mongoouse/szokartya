/**
 * A központi szókincs JSON formátuma – beolvasás, ellenőrzés és átalakítás a
 * seed adatszerkezetére ({@link SeedWord}).
 *
 * Fájlok (`prisma/data/vocabulary/`):
 *
 *   categories.json          a kategóriák (szülő a gyermekei előtt)
 *   <nyelv>/<szint>.json     egy nyelv egy CEFR szintjének szavai, pl. de/a1.json
 *
 * Egy szólista-fájl:
 *
 * ```json
 * {
 *   "language": "de",
 *   "level": "A1",
 *   "words": [
 *     {
 *       "lemma": "Straße",
 *       "pos": "noun",
 *       "translations": ["utca"],
 *       "categories": ["stadt"],
 *       "noun": { "gender": "feminine", "plural": "Straßen", "genitive": "Straße" },
 *       "examples": [{ "sentence": "Die Straße ist breit.", "translation": "Az utca széles." }],
 *       "audio_url": "audio/de/strasse.mp3",
 *       "is_active": true
 *     }
 *   ]
 * }
 * ```
 *
 * A mezőnevek snake_case-ek, a felsorolt értékek (szófaj, nem, eset …) a
 * Prisma enumok kisbetűs nevei. A nyelvtani adatok szófajonként külön
 * objektumban vannak (`noun`, `verb`, `adjective`), így egy újabb nyelv a saját
 * mezőivel bővítheti a formátumot anélkül, hogy a meglévőket érintené.
 *
 * Az ellenőrzés szigorú: ismeretlen mező, hiányzó kötelező mező, érvénytelen
 * érték vagy az adatbázis CHECK kényszereibe ütköző kombináció hibát ad, a fájl
 * és a szó megjelölésével. Hiba esetén semmi nem íródik az adatbázisba.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
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
import { SeedAttributes, SeedCategory, SeedExample, SeedTranslation, SeedValency, SeedWord, wordKey } from './seed-writer';

export const VOCABULARY_DIR = join(__dirname, 'data', 'vocabulary');

// ---------------------------------------------------------------------------
// A fájlformátum típusai
// ---------------------------------------------------------------------------

export interface VocabularyFile {
  language: string;
  level: string;
  words: VocabularyEntry[];
}

/** Egy fordítás: egyszerű szöveg, vagy szöveg jelentésárnyalattal. */
export type TranslationEntry = string | { text: string; note: string };

export interface ExampleEntry {
  sentence: string;
  translation: string;
}

export interface NounEntry {
  /** Hiányzik, ha a főnév csak többes számú. */
  gender?: string;
  /** Alapértelmezés: regular. */
  number?: 'singular_only' | 'plural_only';
  /** Hiányzik, ha a főnév csak egyes számú. */
  plural?: string;
  genitive?: string;
  n_declension?: true;
}

export interface VerbEntry {
  conjugation: string;
  auxiliary: string;
  present_3sg: string;
  preterite_3sg: string;
  past_participle: string;
  separable_prefix?: string;
  reflexive?: 'accusative' | 'dative';
}

export interface AdjectiveEntry {
  comparative?: string;
  superlative?: string;
  irregular_comparison?: true;
  predicative_only?: true;
}

export interface ValencyEntry {
  preposition: string | null;
  case: string;
  reflexive?: true;
  pattern: string;
  meaning: string;
  examples?: ExampleEntry[];
}

export interface VocabularyEntry {
  lemma: string;
  pos: string;
  /** Azonos alakú, azonos szófajú szavak sorszáma (der See = 1, die See = 2); alapértelmezés: 1. */
  homograph?: number;
  translations: TranslationEntry[];
  categories: string[];
  noun?: NounEntry;
  verb?: VerbEntry;
  adjective?: AdjectiveEntry;
  valencies?: ValencyEntry[];
  examples?: ExampleEntry[];
  ipa?: string;
  frequency_rank?: number;
  audio_url?: string;
  is_active: boolean;
}

export interface CategoryEntry {
  slug: string;
  name_hu: string;
  name_de: string;
  parent?: string;
}

// ---------------------------------------------------------------------------
// Hibakezelés
// ---------------------------------------------------------------------------

/** Az összes talált formátumhiba egyben, helymegjelöléssel. */
export class VocabularyFormatError extends Error {
  constructor(readonly problems: string[]) {
    super(`A szólista hibás (${problems.length} hiba):\n  ${problems.join('\n  ')}`);
    this.name = 'VocabularyFormatError';
  }
}

type Json = Record<string, unknown>;

/** Egy JSON objektum mezőinek típusos olvasása; minden hibát a közös listába gyűjt. */
class Reader {
  private readonly seen = new Set<string>();

  constructor(
    private readonly obj: Json,
    readonly where: string,
    private readonly problems: string[],
  ) {}

  static of(value: unknown, where: string, problems: string[]): Reader | null {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      problems.push(`${where}: objektumot vártam`);
      return null;
    }
    return new Reader(value as Json, where, problems);
  }

  fail(message: string): void {
    this.problems.push(`${this.where}: ${message}`);
  }

  /** Beágyazott objektum olvasója, ugyanabba a hibalistába. */
  nested(value: unknown, where: string): Reader | null {
    return Reader.of(value, `${this.where} › ${where}`, this.problems);
  }

  has(key: string): boolean {
    return this.obj[key] !== undefined;
  }

  raw(key: string): unknown {
    this.seen.add(key);
    return this.obj[key];
  }

  string(key: string, { max = 300, optional = false }: { max?: number; optional?: boolean }): string | undefined {
    const v = this.raw(key);
    if (v === undefined) {
      if (!optional) this.fail(`hiányzik: „${key}”`);
      return undefined;
    }
    if (typeof v !== 'string' || v.trim() === '') {
      this.fail(`„${key}”: nem üres szöveget vártam`);
      return undefined;
    }
    if (v !== v.trim()) this.fail(`„${key}”: szóköz a szöveg elején vagy végén`);
    if (v.length > max) this.fail(`„${key}”: legfeljebb ${max} karakter lehet`);
    return v;
  }

  enumValue<E extends string>(key: string, values: Record<string, E>, optional = false): E | undefined {
    const v = this.raw(key);
    if (v === undefined) {
      if (!optional) this.fail(`hiányzik: „${key}”`);
      return undefined;
    }
    const allowed = Object.values(values).map((x) => x.toLowerCase());
    if (typeof v !== 'string' || !allowed.includes(v)) {
      this.fail(`„${key}”: érvénytelen érték (${JSON.stringify(v)}); lehetséges: ${allowed.join(', ')}`);
      return undefined;
    }
    return v.toUpperCase() as E;
  }

  flag(key: string): boolean {
    const v = this.raw(key);
    if (v === undefined) return false;
    if (v !== true) this.fail(`„${key}”: csak true lehet (hamis értéknél hagyd el a mezőt)`);
    return v === true;
  }

  boolean(key: string, fallback: boolean): boolean {
    const v = this.raw(key);
    if (v === undefined) return fallback;
    if (typeof v !== 'boolean') this.fail(`„${key}”: true vagy false lehet`);
    return v === true;
  }

  array(key: string, optional = false): unknown[] {
    const v = this.raw(key);
    if (v === undefined) {
      if (!optional) this.fail(`hiányzik: „${key}”`);
      return [];
    }
    if (!Array.isArray(v)) {
      this.fail(`„${key}”: tömböt vártam`);
      return [];
    }
    return v;
  }

  /** Az ismeretlen (elgépelt) mezők jelzése – a beolvasás végén hívandó. */
  done(): void {
    for (const key of Object.keys(this.obj)) {
      if (!this.seen.has(key)) this.fail(`ismeretlen mező: „${key}”`);
    }
  }
}

// ---------------------------------------------------------------------------
// JSON → SeedWord
// ---------------------------------------------------------------------------

/** Egy szólista-fájl beolvasása. A hibákat a `problems` listába gyűjti. */
export function readVocabularyFile(json: unknown, source: string, problems: string[]): { language: string; words: SeedWord[] } {
  const file = Reader.of(json, source, problems);
  if (!file) return { language: '', words: [] };
  const language = file.string('language', { max: 8 }) ?? '';
  const levelRaw = file.raw('level');
  const level = Object.values(CefrLevel).find((l) => l === levelRaw);
  if (!level)
    file.fail(`„level”: érvénytelen CEFR szint (${JSON.stringify(levelRaw)}); lehetséges: ${Object.values(CefrLevel).join(', ')}`);
  const words: SeedWord[] = [];
  for (const [i, entry] of file.array('words').entries()) {
    const w = readWord(entry, `${source} › words[${i}]`, problems, language, level ?? CefrLevel.A1);
    if (w) words.push(w);
  }
  file.done();
  return { language, words };
}

function readWord(value: unknown, where: string, problems: string[], language: string, level: CefrLevel): SeedWord | null {
  const preview = typeof value === 'object' && value !== null ? (value as Json).lemma : undefined;
  const r = Reader.of(value, typeof preview === 'string' ? `${where} „${preview}”` : where, problems);
  if (!r) return null;

  const lemma = r.string('lemma', { max: 200 });
  const partOfSpeech = r.enumValue('pos', PartOfSpeech);
  const homograph = r.raw('homograph');
  if (homograph !== undefined && (!Number.isInteger(homograph) || (homograph as number) < 1)) {
    r.fail('„homograph”: pozitív egész szám lehet');
  }
  const translations = r.array('translations').map((t, i) => readTranslation(t, r, i));
  if (translations.length === 0) r.fail('legalább egy fordítás kell');
  const categories = r.array('categories').map((c) => {
    if (typeof c !== 'string' || c === '') r.fail('„categories”: kategória-slugokat vártam');
    return String(c);
  });
  if (categories.length === 0) r.fail('legalább egy kategória kell');

  const attributes = readAttributes(r, partOfSpeech, lemma ?? '');
  const valencies = r.array('valencies', true).map((v, i) => readValency(r.nested(v, `valencies[${i}]`)));
  checkValencies(valencies, r);
  const examples = r.array('examples', true).map((e, i) => readExample(r.nested(e, `examples[${i}]`)));

  const ipa = r.string('ipa', { max: 200, optional: true });
  const rank = r.raw('frequency_rank');
  if (rank !== undefined && (!Number.isInteger(rank) || (rank as number) < 1)) r.fail('„frequency_rank”: pozitív egész szám lehet');
  const audioUrl = r.string('audio_url', { max: 1024, optional: true });
  if (!r.has('is_active')) r.fail('hiányzik: „is_active”');
  const isActive = r.boolean('is_active', true);
  r.done();

  if (!lemma || !partOfSpeech || translations.length === 0) return null;
  return {
    language,
    lemma,
    partOfSpeech,
    ...(homograph !== undefined ? { homographNo: homograph as number } : {}),
    cefrLevel: level,
    ...(ipa ? { ipa } : {}),
    ...(rank !== undefined ? { frequencyRank: rank as number } : {}),
    ...(audioUrl ? { audioUrl } : {}),
    isActive,
    categories,
    translations: translations as [SeedTranslation, ...SeedTranslation[]],
    ...(attributes ? { attributes } : {}),
    ...(valencies.length > 0 ? { valencies } : {}),
    ...(examples.length > 0 ? { examples } : {}),
  };
}

function readTranslation(value: unknown, r: Reader, i: number): SeedTranslation {
  if (typeof value === 'string') {
    if (value.trim() === '' || value !== value.trim() || value.length > 300) r.fail(`translations[${i}]: érvénytelen fordítás`);
    return { text: value };
  }
  const t = r.nested(value, `translations[${i}]`);
  if (!t) return { text: '' };
  const text = t.string('text', {}) ?? '';
  const note = t.string('note', {}) ?? '';
  t.done();
  return { text, senseNote: note };
}

function readExample(r: Reader | null): SeedExample {
  if (!r) return { sentence: '', translation: '' };
  const example = { sentence: r.string('sentence', { max: 1000 }) ?? '', translation: r.string('translation', { max: 1000 }) ?? '' };
  r.done();
  return example;
}

function readValency(r: Reader | null): SeedValency {
  if (!r) return { preposition: null, governedCase: GrammaticalCase.ACCUSATIVE, pattern: '', meaning: '' };
  const prep = r.raw('preposition');
  if (prep !== null && (typeof prep !== 'string' || prep.trim() === '' || prep.length > 30)) {
    r.fail('„preposition”: elöljáró (szöveg) vagy null – esetvonzatnál null');
  }
  const governedCase = r.enumValue('case', GrammaticalCase) ?? GrammaticalCase.ACCUSATIVE;
  if (prep !== null && governedCase === GrammaticalCase.NOMINATIVE) r.fail('elöljárós vonzat nem lehet alanyesetű');
  const isReflexive = r.flag('reflexive');
  const pattern = r.string('pattern', { max: 200 }) ?? '';
  const meaning = r.string('meaning', { max: 300 }) ?? '';
  const examples = r.array('examples', true).map((e, i) => readExample(r.nested(e, `examples[${i}]`)));
  r.done();
  return {
    preposition: typeof prep === 'string' ? prep : null,
    governedCase,
    ...(isReflexive ? { isReflexive } : {}),
    pattern,
    meaning,
    ...(examples.length > 0 ? { examples } : {}),
  };
}

/** Ugyanaz a vonzat (elöljáró + eset + visszahatóság) csak egyszer szerepelhet – az adatbázis egyedi indexe szerint. */
function checkValencies(valencies: SeedValency[], r: Reader): void {
  const keys = valencies.map((v) => `${v.preposition ?? '-'}:${v.governedCase}:${v.isReflexive ?? false}`);
  if (new Set(keys).size !== keys.length) r.fail('ismétlődő vonzat (azonos elöljáró, eset és visszahatóság)');
}

const GRAMMAR_KEYS = { NOUN: 'noun', VERB: 'verb', ADJECTIVE: 'adjective' } as const;

function readAttributes(r: Reader, pos: PartOfSpeech | undefined, lemma: string): SeedAttributes | undefined {
  for (const [p, key] of Object.entries(GRAMMAR_KEYS)) {
    if (pos !== p && r.has(key)) r.fail(`„${key}” csak ${key} szófajú szónál adható meg`);
  }
  if (pos !== PartOfSpeech.NOUN && pos !== PartOfSpeech.VERB && pos !== PartOfSpeech.ADJECTIVE) return undefined;
  const key = GRAMMAR_KEYS[pos];
  if (!r.has(key)) {
    r.fail(`hiányzik: „${key}” (a szófaj nyelvtani adatai)`);
    return undefined;
  }
  const g = r.nested(r.raw(key), key);
  if (!g) return undefined;
  const attributes = pos === PartOfSpeech.NOUN ? readNoun(g) : pos === PartOfSpeech.VERB ? readVerb(g, lemma) : readAdjective(g);
  g.done();
  return attributes;
}

function readNoun(g: Reader): SeedAttributes {
  const numberType = g.enumValue('number', NumberType, true) ?? NumberType.REGULAR;
  if (numberType === NumberType.REGULAR && g.has('number')) g.fail('„number”: a szabályos (regular) alapértelmezés, hagyd el');
  const gender = g.enumValue('gender', GrammaticalGender, numberType === NumberType.PLURAL_ONLY) ?? null;
  const pluralForm = g.string('plural', { max: 200, optional: numberType === NumberType.SINGULAR_ONLY }) ?? null;
  const genitiveSingular = g.string('genitive', { max: 200, optional: true }) ?? null;
  const isNDeclension = g.flag('n_declension');
  // Az adatbázis CHECK kényszerei.
  if (numberType === NumberType.PLURAL_ONLY && gender) g.fail('csak többes számú főnévnek nincs neme („gender”)');
  if (numberType === NumberType.SINGULAR_ONLY && pluralForm) g.fail('csak egyes számú főnévnek nincs többes száma („plural”)');
  return { kind: 'noun', data: { gender, numberType, pluralForm, genitiveSingular, isNDeclension } };
}

function readVerb(g: Reader, lemma: string): SeedAttributes {
  const conjugationType = g.enumValue('conjugation', ConjugationType) ?? ConjugationType.REGULAR;
  const auxiliary = g.enumValue('auxiliary', AuxiliaryVerb) ?? AuxiliaryVerb.HABEN;
  const present3sg = g.string('present_3sg', { max: 200 }) ?? '';
  const preterite3sg = g.string('preterite_3sg', { max: 200 }) ?? '';
  const pastParticiple = g.string('past_participle', { max: 200 }) ?? '';
  const separablePrefix = g.string('separable_prefix', { max: 20, optional: true }) ?? null;
  if (separablePrefix && !lemma.startsWith(separablePrefix)) g.fail(`az elváló igekötő („${separablePrefix}”) nem a lemma eleje`);
  const reflexive = g.raw('reflexive');
  let reflexiveType: ReflexiveType = ReflexiveType.NONE;
  if (reflexive === 'accusative') reflexiveType = ReflexiveType.ACCUSATIVE;
  else if (reflexive === 'dative') reflexiveType = ReflexiveType.DATIVE;
  else if (reflexive !== undefined) g.fail('„reflexive”: accusative vagy dative lehet (nem visszaható igénél hagyd el)');
  return {
    kind: 'verb',
    data: {
      conjugationType,
      auxiliary,
      present3sg,
      preterite3sg,
      pastParticiple,
      isSeparable: separablePrefix !== null,
      separablePrefix,
      reflexiveType,
    },
  };
}

function readAdjective(g: Reader): SeedAttributes {
  const comparative = g.string('comparative', { max: 200, optional: true }) ?? null;
  const superlative = g.string('superlative', { max: 200, optional: true }) ?? null;
  if ((comparative === null) !== (superlative === null)) g.fail('a középfok és a felsőfok csak együtt adható meg (vagy egyik sem)');
  return {
    kind: 'adjective',
    data: {
      comparative,
      superlative,
      isIrregularComparison: g.flag('irregular_comparison'),
      isPredicativeOnly: g.flag('predicative_only'),
    },
  };
}

/** A kategóriafájl beolvasása; a szülőnek a gyermek előtt kell szerepelnie. */
export function readCategories(json: unknown, source: string, problems: string[]): SeedCategory[] {
  if (!Array.isArray(json)) {
    problems.push(`${source}: kategóriák tömbjét vártam`);
    return [];
  }
  const slugs = new Set<string>();
  const categories: SeedCategory[] = [];
  for (const [i, value] of json.entries()) {
    const r = Reader.of(value, `${source} › [${i}]`, problems);
    if (!r) continue;
    const slug = r.string('slug', { max: 100 }) ?? '';
    const nameHu = r.string('name_hu', { max: 100 }) ?? '';
    const nameDe = r.string('name_de', { max: 100 }) ?? '';
    const parent = r.string('parent', { max: 100, optional: true });
    r.done();
    if (slug && !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) r.fail(`„slug”: csak kisbetű, számjegy és kötőjel lehet (${slug})`);
    if (slugs.has(slug)) r.fail(`kétszer szereplő kategória: ${slug}`);
    if (parent && !slugs.has(parent)) r.fail(`a szülőkategória („${parent}”) ismeretlen, vagy a gyermeke után szerepel`);
    slugs.add(slug);
    categories.push({ slug, nameHu, nameDe, ...(parent ? { parent } : {}) });
  }
  return categories;
}

// ---------------------------------------------------------------------------
// A teljes szókincs betöltése
// ---------------------------------------------------------------------------

export interface Vocabulary {
  categories: SeedCategory[];
  words: SeedWord[];
}

function readJson(path: string, source: string, problems: string[]): unknown {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    problems.push(`${source}: ${e instanceof SyntaxError ? `érvénytelen JSON (${e.message})` : String(e)}`);
    return undefined;
  }
}

/**
 * Szólista-fájlok beolvasása ismert kategóriák mellett: formátum,
 * kategóriahivatkozások és ismétlődő szavak ellenőrzése.
 *
 * @throws VocabularyFormatError az összes talált hibával.
 */
export function loadWordFiles(paths: string[], knownCategories: Iterable<string>, baseDir = VOCABULARY_DIR): SeedWord[] {
  const problems: string[] = [];
  const known = new Set(knownCategories);
  const words: SeedWord[] = [];
  const seen = new Map<string, string>();
  for (const path of paths) {
    const source = path.startsWith(baseDir) ? path.slice(baseDir.length + 1) : path;
    const json = readJson(path, source, problems);
    if (json === undefined) continue;
    for (const w of readVocabularyFile(json, source, problems).words) {
      const key = wordKey(w);
      const first = seen.get(key);
      if (first) problems.push(`${source}: „${w.lemma}” már szerepel (${first}) – azonos alakú szónál adj meg „homograph” sorszámot`);
      seen.set(key, source);
      for (const c of w.categories) {
        if (!known.has(c)) problems.push(`${source}: „${w.lemma}”: ismeretlen kategória: ${c}`);
      }
      words.push(w);
    }
  }
  if (problems.length > 0) throw new VocabularyFormatError(problems);
  return words;
}

/**
 * A mellékelt teljes szókincs: `categories.json` és minden `<nyelv>/<szint>.json`.
 *
 * @throws VocabularyFormatError az összes talált hibával.
 */
export function loadVocabulary(dir = VOCABULARY_DIR): Vocabulary {
  const problems: string[] = [];
  const categories = readCategories(readJson(join(dir, 'categories.json'), 'categories.json', problems), 'categories.json', problems);
  if (problems.length > 0) throw new VocabularyFormatError(problems);
  const files = readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .flatMap((d) =>
      readdirSync(join(dir, d.name))
        .filter((f) => f.endsWith('.json'))
        .sort()
        .map((f) => join(dir, d.name, f)),
    );
  const words = loadWordFiles(
    files,
    categories.map((c) => c.slug),
    dir,
  );
  return { categories, words };
}

// ---------------------------------------------------------------------------
// SeedWord → JSON (exporthoz és a formátum oda-vissza tesztjéhez)
// ---------------------------------------------------------------------------

const lower = (v: string): string => v.toLowerCase();

function exampleEntry(e: SeedExample): ExampleEntry {
  return { sentence: e.sentence, translation: e.translation };
}

/** Egy szó a JSON formátumban. A szintet és a nyelvet a fájl adja, ezért itt nem szerepel. */
export function toVocabularyEntry(w: SeedWord): VocabularyEntry {
  const entry: VocabularyEntry = {
    lemma: w.lemma,
    pos: lower(w.partOfSpeech),
    ...((w.homographNo ?? 1) !== 1 ? { homograph: w.homographNo } : {}),
    translations: w.translations.map((t) => (t.senseNote ? { text: t.text, note: t.senseNote } : t.text)),
    categories: [...w.categories],
    is_active: w.isActive ?? true,
  };
  const a = w.attributes;
  if (a?.kind === 'noun') {
    const d = a.data;
    const numberType = d.numberType ?? NumberType.REGULAR;
    entry.noun = {
      ...(d.gender ? { gender: lower(d.gender) } : {}),
      ...(numberType !== NumberType.REGULAR ? { number: lower(numberType) as NounEntry['number'] } : {}),
      ...(d.pluralForm ? { plural: d.pluralForm } : {}),
      ...(d.genitiveSingular ? { genitive: d.genitiveSingular } : {}),
      ...(d.isNDeclension ? { n_declension: true as const } : {}),
    };
  } else if (a?.kind === 'verb') {
    const d = a.data;
    const reflexive = d.reflexiveType && d.reflexiveType !== ReflexiveType.NONE ? lower(d.reflexiveType) : undefined;
    entry.verb = {
      conjugation: lower(d.conjugationType),
      auxiliary: lower(d.auxiliary),
      present_3sg: d.present3sg,
      preterite_3sg: d.preterite3sg,
      past_participle: d.pastParticiple,
      ...(d.separablePrefix ? { separable_prefix: d.separablePrefix } : {}),
      ...(reflexive ? { reflexive: reflexive as VerbEntry['reflexive'] } : {}),
    };
  } else if (a?.kind === 'adjective') {
    const d = a.data;
    entry.adjective = {
      ...(d.comparative ? { comparative: d.comparative } : {}),
      ...(d.superlative ? { superlative: d.superlative } : {}),
      ...(d.isIrregularComparison ? { irregular_comparison: true as const } : {}),
      ...(d.isPredicativeOnly ? { predicative_only: true as const } : {}),
    };
  }
  if (w.valencies?.length) {
    entry.valencies = w.valencies.map((v) => ({
      preposition: v.preposition,
      case: lower(v.governedCase),
      ...(v.isReflexive ? { reflexive: true as const } : {}),
      pattern: v.pattern,
      meaning: v.meaning,
      ...(v.examples?.length ? { examples: v.examples.map(exampleEntry) } : {}),
    }));
  }
  if (w.examples?.length) entry.examples = w.examples.map(exampleEntry);
  if (w.ipa) entry.ipa = w.ipa;
  if (w.frequencyRank !== undefined) entry.frequency_rank = w.frequencyRank;
  if (w.audioUrl) entry.audio_url = w.audioUrl;
  // Az is_active a végére kerül, a javaslat mintájához igazodva.
  const { is_active, ...rest } = entry;
  return { ...rest, is_active };
}

export function toCategoryEntry(c: SeedCategory): CategoryEntry {
  return { slug: c.slug, name_hu: c.nameHu, name_de: c.nameDe, ...(c.parent ? { parent: c.parent } : {}) };
}

/** Egy szint szavai a fájl kanonikus, olvasható alakjában. */
export function formatVocabularyFile(language: string, level: CefrLevel, words: SeedWord[]): string {
  return formatJson({ language, level, words: words.map(toVocabularyEntry) }) + '\n';
}

export function formatCategories(categories: SeedCategory[]): string {
  return formatJson(categories.map(toCategoryEntry), 2) + '\n';
}

const INLINE_WIDTH = 120;

/**
 * Olvasható JSON: a szavak mezői soronként, a rövid tömbök és objektumok (fordítások,
 * kategóriák, nyelvtani adatok, példamondatok) egy sorban, ha kiférnek.
 */
function formatJson(value: unknown, depth = 0, indent = 0): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  const pad = '  '.repeat(indent);
  const oneLine = inlineJson(value);
  if (depth >= 3 && pad.length + oneLine.length <= INLINE_WIDTH) return oneLine;
  const inner = '  '.repeat(indent + 1);
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    return `[\n${value.map((v) => inner + formatJson(v, depth + 1, indent + 1)).join(',\n')}\n${pad}]`;
  }
  const fields = Object.entries(value).map(([k, v]) => `${inner}${JSON.stringify(k)}: ${formatJson(v, depth + 1, indent + 1)}`);
  return `{\n${fields.join(',\n')}\n${pad}}`;
}

function inlineJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(inlineJson).join(', ')}]`;
  if (value !== null && typeof value === 'object') {
    return `{ ${Object.entries(value)
      .map(([k, v]) => `${JSON.stringify(k)}: ${inlineJson(v)}`)
      .join(', ')} }`;
  }
  return JSON.stringify(value);
}
