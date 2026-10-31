/**
 * Tömör, soronkénti szólista-formátum (lásd `prisma/data/wortschatz.txt`
 * fejléce) beolvasása seed-rekordokká. Tiszta függvények: fájl- és
 * adatbázis-hozzáférés nélkül, így egységtesztelhető.
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
import type { SeedExample, SeedTranslation, SeedValency, SeedWord } from './seed-writer';

export class VocabularyFormatError extends Error {
  constructor(line: number, message: string) {
    super(`${line}. sor: ${message}`);
  }
}

const GENDER: Record<string, GrammaticalGender> = {
  der: GrammaticalGender.MASCULINE,
  die: GrammaticalGender.FEMININE,
  das: GrammaticalGender.NEUTER,
};

const CASE: Record<string, { value: GrammaticalCase; abbr: string }> = {
  A: { value: GrammaticalCase.ACCUSATIVE, abbr: 'Akk.' },
  D: { value: GrammaticalCase.DATIVE, abbr: 'Dat.' },
  G: { value: GrammaticalCase.GENITIVE, abbr: 'Gen.' },
};

const CONJUGATION: Record<string, ConjugationType> = {
  r: ConjugationType.REGULAR,
  i: ConjugationType.IRREGULAR,
  m: ConjugationType.MIXED,
};

const AUXILIARY: Record<string, AuxiliaryVerb> = {
  hat: AuxiliaryVerb.HABEN,
  ist: AuxiliaryVerb.SEIN,
  'hat/ist': AuxiliaryVerb.BOTH,
};

/** A teljes fájl feldolgozása. Hibás sornál a sorszámmal együtt dob. */
export function parseVocabulary(text: string): SeedWord[] {
  const words: SeedWord[] = [];
  for (const [i, raw] of text.split(/\r?\n/).entries()) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) continue;
    try {
      words.push(parseLine(line));
    } catch (err) {
      throw new VocabularyFormatError(i + 1, err instanceof Error ? err.message : String(err));
    }
  }
  return words;
}

export function parseLine(line: string): SeedWord {
  const f = line.split('|').map((s) => s.trim());
  const kind = f[0];
  const level = cefr(f[1]);
  switch (kind) {
    case 'N':
      return noun(level, f);
    case 'V':
      return verb(level, f);
    case 'A':
      return adjective(level, f);
    case 'X':
      return other(level, f);
    default:
      throw new Error(`ismeretlen sortípus: ${kind ?? ''}`);
  }
}

// N|szint|névelő|alak|többes szám|fordítások|kategóriák|példa|jelzők
function noun(level: CefrLevel, f: string[]): SeedWord {
  const [, , article, lemma, plural, translations, categories, example, flags] = f;
  const pluralOnly = article === 'pl';
  const gender = pluralOnly ? null : GENDER[required(article, 'névelő')];
  if (gender === undefined) {
    throw new Error(`érvénytelen névelő: ${article ?? ''}`);
  }
  const singularOnly = plural === '-';
  return {
    ...base(required(lemma, 'alak'), PartOfSpeech.NOUN, level, translations, categories, example),
    attributes: {
      kind: 'noun',
      data: {
        gender,
        numberType: pluralOnly ? NumberType.PLURAL_ONLY : singularOnly ? NumberType.SINGULAR_ONLY : NumberType.REGULAR,
        pluralForm: singularOnly ? null : required(plural, 'többes szám'),
        isNDeclension: (flags ?? '').includes('n'),
      },
    },
  };
}

// V|szint|alak|E/3 jelen|E/3 Präteritum|segédige + Partizip II|típus|fordítások|kategóriák|példa|vonzat
function verb(level: CefrLevel, f: string[]): SeedWord {
  const [, , rawLemma, present, preterite, perfect, type, translations, categories, example, valency] = f;
  let lemma = required(rawLemma, 'alak');
  let reflexiveType: ReflexiveType = ReflexiveType.NONE;
  if (lemma.startsWith('sich(D) ')) {
    reflexiveType = ReflexiveType.DATIVE;
    lemma = lemma.slice('sich(D) '.length);
  } else if (lemma.startsWith('sich ')) {
    reflexiveType = ReflexiveType.ACCUSATIVE;
    lemma = lemma.slice('sich '.length);
  }
  const { lemma: plain, homographNo } = homograph(lemma);
  const [prefix, rest] = plain.includes('·') ? plain.split('·', 2) : [null, plain];
  const fullLemma = `${prefix ?? ''}${rest}`;

  const [aux, participle] = required(perfect, 'Partizip II').split(/\s+/, 2);
  const auxiliary = AUXILIARY[aux ?? ''];
  if (!auxiliary || !participle) {
    throw new Error(`érvénytelen Perfekt alak: ${perfect ?? ''} (pl. „hat gemacht”)`);
  }
  const conjugationType = CONJUGATION[type ?? ''];
  if (!conjugationType) {
    throw new Error(`érvénytelen igetípus: ${type ?? ''} (r / i / m)`);
  }

  const display = reflexiveType === ReflexiveType.NONE ? fullLemma : `sich ${fullLemma}`;
  return {
    ...base(fullLemma, PartOfSpeech.VERB, level, translations, categories, example),
    homographNo,
    attributes: {
      kind: 'verb',
      data: {
        conjugationType,
        auxiliary,
        present3sg: required(present, 'jelen idő'),
        preterite3sg: required(preterite, 'Präteritum'),
        pastParticiple: participle,
        isSeparable: prefix !== null,
        separablePrefix: prefix,
        reflexiveType,
      },
    },
    valencies: valencies(display, valency, reflexiveType !== ReflexiveType.NONE),
  };
}

// A|szint|alak|középfok|felsőfok|fordítások|kategóriák|példa|jelzők
function adjective(level: CefrLevel, f: string[]): SeedWord {
  const [, , lemma, comparative, superlative, translations, categories, example, flags] = f;
  const comparable = comparative !== '-';
  // A jelzők helyén vonzat is állhat (zufrieden mit + Dat.).
  const valency = flags?.includes(':') ? flags : undefined;
  const flagList = valency ? [] : (flags ?? '').split(/\s+/);
  const name = required(lemma, 'alak');
  return {
    ...base(name, PartOfSpeech.ADJECTIVE, level, translations, categories, example),
    attributes: {
      kind: 'adjective',
      data: {
        comparative: comparable ? required(comparative, 'középfok') : null,
        superlative: comparable ? required(superlative, 'felsőfok') : null,
        isIrregularComparison: flagList.includes('!'),
        isPredicativeOnly: flagList.includes('p'),
      },
    },
    valencies: valencies(name, valency, false),
  };
}

// X|szint|szófaj|alak|fordítások|kategóriák|példa
function other(level: CefrLevel, f: string[]): SeedWord {
  const [, , pos, lemma, translations, categories, example] = f;
  const partOfSpeech = PartOfSpeech[pos as keyof typeof PartOfSpeech];
  if (!partOfSpeech || ([PartOfSpeech.NOUN, PartOfSpeech.VERB, PartOfSpeech.ADJECTIVE] as string[]).includes(partOfSpeech)) {
    throw new Error(`érvénytelen szófaj az X sorban: ${pos ?? ''}`);
  }
  return base(required(lemma, 'alak'), partOfSpeech, level, translations, categories, example);
}

// ---------------------------------------------------------------------------
// Segédfüggvények
// ---------------------------------------------------------------------------

function base(
  lemma: string,
  partOfSpeech: PartOfSpeech,
  cefrLevel: CefrLevel,
  translations: string | undefined,
  categories: string | undefined,
  example: string | undefined,
): SeedWord {
  const texts = required(translations, 'fordítás')
    .split(';')
    .map((t) => t.trim())
    .filter(Boolean);
  if (texts.length === 0) {
    throw new Error('legalább egy fordítás kötelező');
  }
  const examples = parseExample(example);
  const { lemma: plain, homographNo } = homograph(lemma);
  return {
    lemma: plain,
    partOfSpeech,
    homographNo,
    cefrLevel,
    categories: (categories ?? '')
      .split(',')
      .map((c) => c.trim())
      .filter(Boolean),
    translations: texts.map((text): SeedTranslation => ({ text })) as [SeedTranslation, ...SeedTranslation[]],
    ...(examples ? { examples: [examples] } : {}),
  };
}

/** „Tisch#2” → (Tisch, 2): azonos alakú, eltérő jelentésű szavak. */
function homograph(lemma: string): { lemma: string; homographNo: number } {
  const m = /^(.*)#(\d+)$/.exec(lemma);
  return m ? { lemma: m[1]!, homographNo: Number(m[2]) } : { lemma, homographNo: 1 };
}

function parseExample(raw: string | undefined): SeedExample | null {
  if (!raw) return null;
  const [sentence, translation] = raw.split(' = ', 2).map((s) => s.trim());
  if (!sentence || !translation) {
    throw new Error(`a példamondat formátuma „német = magyar”: ${raw}`);
  }
  return { sentence, translation };
}

/** „an:A:gondol valakire” → „denken an + Akk.” vonzat. */
function valencies(display: string, raw: string | undefined, isReflexive: boolean): SeedValency[] | undefined {
  if (!raw) return undefined;
  const [prep, caseCode, meaning] = raw.split(':', 3);
  const c = CASE[caseCode ?? ''];
  if (!c || !meaning) {
    throw new Error(`érvénytelen vonzat: ${raw} (elöljáró:A|D|G:jelentés)`);
  }
  const preposition = prep === '-' || !prep ? null : prep;
  const pattern = preposition ? `${display} ${preposition} + ${c.abbr}` : `${display} + ${c.abbr}`;
  return [{ preposition, governedCase: c.value, isReflexive, pattern, meaning }];
}

function cefr(raw: string | undefined): CefrLevel {
  const level = CefrLevel[raw as keyof typeof CefrLevel];
  if (!level) {
    throw new Error(`érvénytelen CEFR szint: ${raw ?? ''}`);
  }
  return level;
}

function required(value: string | undefined, field: string): string {
  if (value === undefined || value === '' || value === '-') {
    throw new Error(`hiányzó mező: ${field}`);
  }
  return value;
}
