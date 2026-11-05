import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
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
import { SeedWord, wordKey } from './seed-writer';
import {
  formatCategories,
  formatVocabularyFile,
  loadVocabulary,
  loadWordFiles,
  readVocabularyFile,
  toVocabularyEntry,
  VOCABULARY_DIR,
  VocabularyFormatError,
} from './vocabulary-json';

/** Egyetlen szó beolvasása egy A1-es német fájlból; a hibák a `problems` tömbbe kerülnek. */
function read(word: object): { words: SeedWord[]; problems: string[] } {
  const problems: string[] = [];
  const { words } = readVocabularyFile({ language: 'de', level: 'A1', words: [word] }, 'teszt.json', problems);
  return { words, problems };
}

function readOne(word: object): SeedWord {
  const { words, problems } = read(word);
  expect(problems).toEqual([]);
  return words[0]!;
}

const base = { translations: ['x'], categories: ['alltag'], is_active: true };

describe('szólista JSON formátum', () => {
  it('főnév: nem, többes szám, birtokos eset, n-deklináció, jelentésárnyalat, példamondat', () => {
    const w = readOne({
      lemma: 'Junge',
      pos: 'noun',
      translations: ['fiú', { text: 'srác', note: 'bizalmas' }],
      categories: ['menschen', 'familie'],
      noun: { gender: 'masculine', plural: 'Jungen', genitive: 'Jungen', n_declension: true },
      examples: [{ sentence: 'Der Junge spielt.', translation: 'A fiú játszik.' }],
      audio_url: 'audio/de/junge.mp3',
      is_active: true,
    });
    expect(w).toEqual({
      language: 'de',
      lemma: 'Junge',
      partOfSpeech: PartOfSpeech.NOUN,
      cefrLevel: CefrLevel.A1,
      audioUrl: 'audio/de/junge.mp3',
      isActive: true,
      categories: ['menschen', 'familie'],
      translations: [{ text: 'fiú' }, { text: 'srác', senseNote: 'bizalmas' }],
      attributes: {
        kind: 'noun',
        data: {
          gender: GrammaticalGender.MASCULINE,
          numberType: NumberType.REGULAR,
          pluralForm: 'Jungen',
          genitiveSingular: 'Jungen',
          isNDeclension: true,
        },
      },
      examples: [{ sentence: 'Der Junge spielt.', translation: 'A fiú játszik.' }],
    });
  });

  it('főnév: csak egyes és csak többes számú alak (a séma CHECK kényszereivel összhangban)', () => {
    expect(readOne({ ...base, lemma: 'Milch', pos: 'noun', noun: { gender: 'feminine', number: 'singular_only' } }).attributes).toEqual({
      kind: 'noun',
      data: {
        gender: GrammaticalGender.FEMININE,
        numberType: NumberType.SINGULAR_ONLY,
        pluralForm: null,
        genitiveSingular: null,
        isNDeclension: false,
      },
    });
    expect(readOne({ ...base, lemma: 'Eltern', pos: 'noun', noun: { number: 'plural_only', plural: 'Eltern' } }).attributes).toMatchObject({
      data: { gender: null, numberType: NumberType.PLURAL_ONLY, pluralForm: 'Eltern' },
    });
  });

  it('ige: elváló igekötő, visszaható alak, kettős segédige, homográf, vonzat példamondattal', () => {
    const w = readOne({
      ...base,
      lemma: 'vorstellen',
      pos: 'verb',
      homograph: 2,
      verb: {
        conjugation: 'regular',
        auxiliary: 'both',
        present_3sg: 'stellt sich vor',
        preterite_3sg: 'stellte sich vor',
        past_participle: 'vorgestellt',
        separable_prefix: 'vor',
        reflexive: 'dative',
      },
      valencies: [
        {
          preposition: null,
          case: 'accusative',
          reflexive: true,
          pattern: 'sich vorstellen + Akk.',
          meaning: 'elképzel valamit',
          examples: [{ sentence: 'Ich stelle mir das vor.', translation: 'Elképzelem.' }],
        },
      ],
    });
    expect(w).toMatchObject({
      homographNo: 2,
      attributes: {
        kind: 'verb',
        data: {
          conjugationType: ConjugationType.REGULAR,
          auxiliary: AuxiliaryVerb.BOTH,
          isSeparable: true,
          separablePrefix: 'vor',
          reflexiveType: ReflexiveType.DATIVE,
        },
      },
      valencies: [
        {
          preposition: null,
          governedCase: GrammaticalCase.ACCUSATIVE,
          isReflexive: true,
          examples: [{ sentence: 'Ich stelle mir das vor.' }],
        },
      ],
    });
  });

  it('melléknév: fokozás és jelzők; egyéb szófajnak nincs nyelvtani objektuma; logikai törlés', () => {
    expect(
      readOne({
        ...base,
        lemma: 'viel',
        pos: 'adjective',
        adjective: { comparative: 'mehr', superlative: 'am meisten', irregular_comparison: true },
      }).attributes,
    ).toEqual({
      kind: 'adjective',
      data: { comparative: 'mehr', superlative: 'am meisten', isIrregularComparison: true, isPredicativeOnly: false },
    });
    const heute = readOne({ ...base, lemma: 'heute', pos: 'adverb', is_active: false });
    expect(heute.attributes).toBeUndefined();
    expect(heute.isActive).toBe(false);
  });

  it.each<[string, object, RegExp]>([
    ['ismeretlen mező', { ...base, lemma: 'heute', pos: 'adverb', tags: ['x'] }, /ismeretlen mező: „tags”/],
    ['hiányzó is_active', { lemma: 'heute', pos: 'adverb', translations: ['ma'], categories: ['zeit'] }, /hiányzik: „is_active”/],
    ['ismeretlen szófaj', { ...base, lemma: 'heute', pos: 'adverbial' }, /„pos”: érvénytelen érték/],
    ['hiányzó fordítás', { ...base, lemma: 'heute', pos: 'adverb', translations: [] }, /legalább egy fordítás/],
    ['főnév nyelvtani adat nélkül', { ...base, lemma: 'Tisch', pos: 'noun' }, /hiányzik: „noun”/],
    ['nyelvtani adat rossz szófajnál', { ...base, lemma: 'heute', pos: 'adverb', noun: {} }, /„noun” csak noun szófajú/],
    ['többes szám hiányzik', { ...base, lemma: 'Tisch', pos: 'noun', noun: { gender: 'masculine' } }, /noun: hiányzik: „plural”/],
    [
      'csak többes számú nemmel',
      { ...base, lemma: 'Leute', pos: 'noun', noun: { gender: 'feminine', number: 'plural_only', plural: 'Leute' } },
      /nincs neme/,
    ],
    [
      'csak egyes számú többes számmal',
      { ...base, lemma: 'Milch', pos: 'noun', noun: { gender: 'feminine', number: 'singular_only', plural: 'Milche' } },
      /nincs többes száma/,
    ],
    ['ismeretlen nem', { ...base, lemma: 'Tisch', pos: 'noun', noun: { gender: 'der', plural: 'Tische' } }, /„gender”: érvénytelen érték/],
    [
      'igekötő nem a lemma eleje',
      {
        ...base,
        lemma: 'anrufen',
        pos: 'verb',
        verb: {
          conjugation: 'irregular',
          auxiliary: 'haben',
          present_3sg: 'ruft an',
          preterite_3sg: 'rief an',
          past_participle: 'angerufen',
          separable_prefix: 'auf',
        },
      },
      /nem a lemma eleje/,
    ],
    ['csak középfok', { ...base, lemma: 'gut', pos: 'adjective', adjective: { comparative: 'besser' } }, /csak együtt/],
    [
      'elöljárós alanyeset',
      { ...base, lemma: 'werden', pos: 'adverb', valencies: [{ preposition: 'zu', case: 'nominative', pattern: 'p', meaning: 'm' }] },
      /alanyesetű/,
    ],
    [
      'ismétlődő vonzat',
      {
        ...base,
        lemma: 'warten',
        pos: 'adverb',
        valencies: [
          { preposition: 'auf', case: 'accusative', pattern: 'a', meaning: 'a' },
          { preposition: 'auf', case: 'accusative', pattern: 'b', meaning: 'b' },
        ],
      },
      /ismétlődő vonzat/,
    ],
    ['szóköz a lemma körül', { ...base, lemma: ' heute', pos: 'adverb' }, /szóköz/],
    ['hamis jelző kiírva', { ...base, lemma: 'gut', pos: 'adjective', adjective: { predicative_only: false } }, /csak true lehet/],
  ])('hibás szó elutasítása: %s', (_name, word, message) => {
    const { problems } = read(word);
    expect(problems.join('\n')).toMatch(message);
  });

  it('a hibaüzenet megadja a fájlt, a szó helyét és a lemmát', () => {
    const { problems } = read({ ...base, lemma: 'Tisch', pos: 'noun', noun: { gender: 'masculine' } });
    expect(problems).toEqual(['teszt.json › words[0] „Tisch” › noun: hiányzik: „plural”']);
  });

  it('érvénytelen szint a fájl fejlécében', () => {
    const problems: string[] = [];
    readVocabularyFile({ language: 'de', level: 'Z9', words: [] }, 'x.json', problems);
    expect(problems.join()).toMatch(/érvénytelen CEFR szint/);
  });

  it('oda-vissza: a JSON alakból visszaolvasott szó azonos az eredetivel', () => {
    const { words } = loadVocabulary();
    for (const w of words.slice(0, 200)) {
      const back = readOne(toVocabularyEntry(w));
      expect({ ...back, cefrLevel: w.cefrLevel }).toEqual(w);
    }
  });
});

describe('szólista-fájlok importja', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'vocab-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  const write = (name: string, content: unknown): string => {
    const path = join(dir, name);
    writeFileSync(path, typeof content === 'string' ? content : JSON.stringify(content));
    return path;
  };

  it('összegyűjti a hibákat több fájlból: érvénytelen JSON, ismeretlen kategória, ismétlődő szó', () => {
    const word = { lemma: 'heute', pos: 'adverb', translations: ['ma'], categories: ['zeit'], is_active: true };
    const a = write('a.json', { language: 'de', level: 'A1', words: [word] });
    const b = write('b.json', { language: 'de', level: 'A2', words: [word, { ...word, lemma: 'morgen', categories: ['nincs'] }] });
    const c = write('c.json', '{ "language": ');
    let error: unknown;
    try {
      loadWordFiles([a, b, c], ['zeit'], dir);
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(VocabularyFormatError);
    const problems = (error as VocabularyFormatError).problems.join('\n');
    expect(problems).toMatch(/b\.json: „heute” már szerepel \(a\.json\)/);
    expect(problems).toMatch(/b\.json: „morgen”: ismeretlen kategória: nincs/);
    expect(problems).toMatch(/c\.json: érvénytelen JSON/);
  });

  it('a homográf-sorszám megkülönbözteti az azonos alakú szavakat', () => {
    const see = { pos: 'noun', lemma: 'See', translations: ['tó'], categories: ['natur'], is_active: true };
    const path = write('see.json', {
      language: 'de',
      level: 'A2',
      words: [
        { ...see, noun: { gender: 'masculine', plural: 'Seen' } },
        { ...see, homograph: 2, translations: ['tenger'], noun: { gender: 'feminine', number: 'singular_only' } },
      ],
    });
    expect(loadWordFiles([path], ['natur'], dir).map(wordKey)).toEqual(['word:de:NOUN:See:1', 'word:de:NOUN:See:2']);
  });
});

describe('a mellékelt szókincs', () => {
  const { categories, words } = loadVocabulary();
  const of = (pos: PartOfSpeech): SeedWord[] => words.filter((w) => w.partOfSpeech === pos);

  it('hibátlanul beolvasható, és nincs benne ismétlődő szó', () => {
    expect(words.length).toBeGreaterThan(2000);
    const keys = words.map(wordKey);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('a fájlok a kanonikus formázásban vannak (a formázó kimenete azonos a fájllal)', () => {
    expect(readFileSync(join(VOCABULARY_DIR, 'categories.json'), 'utf8')).toBe(formatCategories(categories));
    for (const level of [CefrLevel.A1, CefrLevel.A2, CefrLevel.B1, CefrLevel.B2]) {
      const file = readFileSync(join(VOCABULARY_DIR, 'de', `${level.toLowerCase()}.json`), 'utf8');
      expect(file).toBe(
        formatVocabularyFile(
          'de',
          level,
          words.filter((w) => w.cefrLevel === level),
        ),
      );
    }
  });

  it('minden szónak van példamondata fordítással (saját vagy vonzathoz kötött)', () => {
    const missing = words.filter((w) => {
      const all = [...(w.examples ?? []), ...(w.valencies ?? []).flatMap((v) => v.examples ?? [])];
      return !all.some((e) => e.sentence.trim() && e.translation?.trim());
    });
    expect(missing.map(wordKey)).toEqual([]);
  });

  it('minden főnévnek van neme (kivéve a csak többes számúakat), a B2 főneveknek birtokos esete is', () => {
    for (const w of of(PartOfSpeech.NOUN)) {
      if (w.attributes?.kind !== 'noun') throw new Error(`${w.lemma}: nincs főnévi attribútum`);
      const d = w.attributes.data;
      if (d.numberType === NumberType.PLURAL_ONLY) continue;
      expect(d.gender).toBeTruthy();
      if (w.cefrLevel === CefrLevel.B2) expect(d.genitiveSingular).toBeTruthy();
    }
  });

  it('a B2 szavak a gyűjtő- és egy tematikus kategóriában vannak; az igék nagy része vonzatos', () => {
    for (const w of words.filter((x) => x.cefrLevel === CefrLevel.B2)) {
      expect(w.categories[0]).toBe('b2-wortschatz');
      expect(w.categories).toHaveLength(2);
    }
    const verbs = of(PartOfSpeech.VERB).filter((w) => w.cefrLevel === CefrLevel.B2);
    expect(verbs.filter((w) => (w.valencies?.length ?? 0) > 0).length / verbs.length).toBeGreaterThan(0.5);
  });
});
