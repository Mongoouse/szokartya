/**
 * Mintaadatok a központi (kurált) szótárhoz.
 *
 * A szkript idempotens: minden rekord determinisztikus UUID-t kap (UUID v5 a
 * természetes kulcsból), és `upsert`-tel kerül be, így többszöri futtatás sem
 * hoz létre duplikátumot. Egy szó összes rekordja egyetlen tranzakcióban íródik.
 *
 * A minták szándékosan lefedik a séma határeseteit: azonos alakú szavak
 * (der See / die See), csak egyes / csak többes számú főnevek, n-deklináció,
 * elváló és visszaható igék, kettős segédige, elöljárós és esetvonzatok,
 * rendhagyó fokozás.
 */
import { createHash } from 'node:crypto';
import {
  AuxiliaryVerb,
  CefrLevel,
  ConjugationType,
  GrammaticalCase,
  GrammaticalGender,
  NumberType,
  PartOfSpeech,
  Prisma,
  PrismaClient,
  ReflexiveType,
} from '@prisma/client';

const prisma = new PrismaClient();

/** Rögzített névtér a seed-azonosítókhoz (RFC 4122 UUID v5). */
const SEED_NAMESPACE = 'b7c2a4f0-6a51-4f3e-9d0e-2c1f5e8a9b10';

/** Determinisztikus UUID v5 egy természetes kulcsból. */
function seedId(key: string): string {
  const ns = Buffer.from(SEED_NAMESPACE.replace(/-/g, ''), 'hex');
  const hash = createHash('sha1').update(ns).update(key, 'utf8').digest();
  const bytes = hash.subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x50; // verzió: 5
  bytes[8] = (bytes[8]! & 0x3f) | 0x80; // variáns: RFC 4122
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// ---------------------------------------------------------------------------
// Seed adatszerkezetek
// ---------------------------------------------------------------------------

interface SeedTranslation {
  text: string;
  senseNote?: string;
}

interface SeedValency {
  preposition: string | null;
  governedCase: GrammaticalCase;
  isReflexive?: boolean;
  pattern: string;
  meaning: string;
  examples?: SeedExample[];
}

interface SeedExample {
  sentence: string;
  translation: string;
}

type SeedAttributes =
  | { kind: 'noun'; data: Omit<Prisma.NounAttributesUncheckedCreateInput, 'wordId' | 'partOfSpeech'> }
  | { kind: 'verb'; data: Omit<Prisma.VerbAttributesUncheckedCreateInput, 'wordId' | 'partOfSpeech'> }
  | { kind: 'adjective'; data: Omit<Prisma.AdjectiveAttributesUncheckedCreateInput, 'wordId' | 'partOfSpeech'> };

interface SeedWord {
  lemma: string;
  partOfSpeech: PartOfSpeech;
  homographNo?: number;
  cefrLevel: CefrLevel;
  ipa?: string;
  frequencyRank?: number;
  categories: string[];
  /** Az első elem az elsődleges fordítás. */
  translations: [SeedTranslation, ...SeedTranslation[]];
  attributes?: SeedAttributes;
  valencies?: SeedValency[];
  examples?: SeedExample[];
}

interface SeedCategory {
  slug: string;
  nameHu: string;
  nameDe: string;
  parent?: string;
}

// ---------------------------------------------------------------------------
// Adatok
// ---------------------------------------------------------------------------

/** Szülők a gyermekeik előtt (a FK miatt). */
const CATEGORIES: SeedCategory[] = [
  { slug: 'alltag', nameHu: 'Hétköznapok', nameDe: 'Alltag' },
  { slug: 'haushalt', nameHu: 'Háztartás', nameDe: 'Haushalt', parent: 'alltag' },
  { slug: 'lebensmittel', nameHu: 'Élelmiszerek', nameDe: 'Lebensmittel', parent: 'alltag' },
  { slug: 'natur', nameHu: 'Természet', nameDe: 'Natur' },
  { slug: 'menschen', nameHu: 'Emberek', nameDe: 'Menschen' },
  { slug: 'bildung', nameHu: 'Oktatás', nameDe: 'Bildung' },
  { slug: 'verkehr', nameHu: 'Közlekedés', nameDe: 'Verkehr' },
  { slug: 'gefuehle', nameHu: 'Érzelmek', nameDe: 'Gefühle' },
  { slug: 'grundwortschatz', nameHu: 'Alapszókincs', nameDe: 'Grundwortschatz' },
];

const WORDS: SeedWord[] = [
  // --- Főnevek -------------------------------------------------------------
  {
    lemma: 'Tisch',
    partOfSpeech: PartOfSpeech.NOUN,
    cefrLevel: CefrLevel.A1,
    ipa: 'tɪʃ',
    frequencyRank: 812,
    categories: ['haushalt'],
    translations: [{ text: 'asztal', senseNote: 'bútor' }],
    attributes: {
      kind: 'noun',
      data: {
        gender: GrammaticalGender.MASCULINE,
        numberType: NumberType.REGULAR,
        pluralForm: 'Tische',
        genitiveSingular: 'Tisches',
      },
    },
    examples: [{ sentence: 'Das Buch liegt auf dem Tisch.', translation: 'A könyv az asztalon fekszik.' }],
  },
  {
    lemma: 'See',
    partOfSpeech: PartOfSpeech.NOUN,
    homographNo: 1,
    cefrLevel: CefrLevel.A2,
    ipa: 'zeː',
    categories: ['natur'],
    translations: [{ text: 'tó' }],
    attributes: {
      kind: 'noun',
      data: {
        gender: GrammaticalGender.MASCULINE,
        numberType: NumberType.REGULAR,
        pluralForm: 'Seen',
        genitiveSingular: 'Sees',
      },
    },
    examples: [{ sentence: 'Im Sommer schwimmen wir im See.', translation: 'Nyáron a tóban úszunk.' }],
  },
  {
    lemma: 'See',
    partOfSpeech: PartOfSpeech.NOUN,
    homographNo: 2,
    cefrLevel: CefrLevel.B1,
    ipa: 'zeː',
    categories: ['natur'],
    translations: [{ text: 'tenger' }],
    attributes: {
      kind: 'noun',
      data: {
        gender: GrammaticalGender.FEMININE,
        // A „tenger” jelentésben gyakorlatilag csak egyes számban használatos.
        numberType: NumberType.SINGULAR_ONLY,
        genitiveSingular: 'See',
      },
    },
    examples: [{ sentence: 'Die Fischer fahren auf die See hinaus.', translation: 'A halászok kihajóznak a tengerre.' }],
  },
  {
    lemma: 'Leute',
    partOfSpeech: PartOfSpeech.NOUN,
    cefrLevel: CefrLevel.A1,
    categories: ['menschen'],
    translations: [{ text: 'emberek' }],
    attributes: { kind: 'noun', data: { numberType: NumberType.PLURAL_ONLY, pluralForm: 'Leute' } },
  },
  {
    lemma: 'Milch',
    partOfSpeech: PartOfSpeech.NOUN,
    cefrLevel: CefrLevel.A1,
    categories: ['lebensmittel'],
    translations: [{ text: 'tej' }],
    attributes: {
      kind: 'noun',
      data: { gender: GrammaticalGender.FEMININE, numberType: NumberType.SINGULAR_ONLY, genitiveSingular: 'Milch' },
    },
  },
  {
    lemma: 'Student',
    partOfSpeech: PartOfSpeech.NOUN,
    cefrLevel: CefrLevel.A1,
    categories: ['bildung', 'menschen'],
    translations: [{ text: 'egyetemi hallgató' }, { text: 'diák' }],
    attributes: {
      kind: 'noun',
      data: {
        gender: GrammaticalGender.MASCULINE,
        numberType: NumberType.REGULAR,
        pluralForm: 'Studenten',
        genitiveSingular: 'Studenten',
        isNDeclension: true,
      },
    },
    examples: [{ sentence: 'Ich kenne den Studenten aus Wien.', translation: 'Ismerem a bécsi hallgatót.' }],
  },
  {
    lemma: 'Angst',
    partOfSpeech: PartOfSpeech.NOUN,
    cefrLevel: CefrLevel.A2,
    categories: ['gefuehle'],
    translations: [{ text: 'félelem' }],
    attributes: {
      kind: 'noun',
      data: {
        gender: GrammaticalGender.FEMININE,
        numberType: NumberType.REGULAR,
        pluralForm: 'Ängste',
        genitiveSingular: 'Angst',
      },
    },
    valencies: [
      {
        preposition: 'vor',
        governedCase: GrammaticalCase.DATIVE,
        pattern: 'Angst vor + Dat.',
        meaning: 'félelem valamitől',
        examples: [{ sentence: 'Sie hat Angst vor Hunden.', translation: 'Fél a kutyáktól.' }],
      },
    ],
  },

  // --- Igék ----------------------------------------------------------------
  {
    lemma: 'warten',
    partOfSpeech: PartOfSpeech.VERB,
    cefrLevel: CefrLevel.A1,
    frequencyRank: 420,
    categories: ['grundwortschatz'],
    translations: [{ text: 'vár' }],
    attributes: {
      kind: 'verb',
      data: {
        conjugationType: ConjugationType.REGULAR,
        auxiliary: AuxiliaryVerb.HABEN,
        present3sg: 'wartet',
        preterite3sg: 'wartete',
        pastParticiple: 'gewartet',
      },
    },
    valencies: [
      {
        preposition: 'auf',
        governedCase: GrammaticalCase.ACCUSATIVE,
        pattern: 'warten auf + Akk.',
        meaning: 'vár valakire/valamire',
        examples: [{ sentence: 'Ich warte auf den Bus.', translation: 'A buszra várok.' }],
      },
    ],
  },
  {
    lemma: 'abhängen',
    partOfSpeech: PartOfSpeech.VERB,
    cefrLevel: CefrLevel.B1,
    categories: ['grundwortschatz'],
    translations: [{ text: 'függ (valamitől)' }],
    attributes: {
      kind: 'verb',
      data: {
        conjugationType: ConjugationType.IRREGULAR,
        auxiliary: AuxiliaryVerb.HABEN,
        present3sg: 'hängt ab',
        preterite3sg: 'hing ab',
        pastParticiple: 'abgehangen',
        isSeparable: true,
        separablePrefix: 'ab',
      },
    },
    valencies: [
      {
        preposition: 'von',
        governedCase: GrammaticalCase.DATIVE,
        pattern: 'abhängen von + Dat.',
        meaning: 'függ valamitől/valakitől',
        examples: [{ sentence: 'Das hängt vom Wetter ab.', translation: 'Ez az időjárástól függ.' }],
      },
    ],
  },
  {
    lemma: 'fahren',
    partOfSpeech: PartOfSpeech.VERB,
    cefrLevel: CefrLevel.A1,
    frequencyRank: 260,
    categories: ['verkehr'],
    translations: [{ text: 'utazik, megy (járművel)' }, { text: 'vezet', senseNote: 'járművet' }],
    attributes: {
      kind: 'verb',
      data: {
        conjugationType: ConjugationType.IRREGULAR,
        auxiliary: AuxiliaryVerb.BOTH,
        present3sg: 'fährt',
        preterite3sg: 'fuhr',
        pastParticiple: 'gefahren',
      },
    },
    examples: [
      { sentence: 'Wir sind nach Berlin gefahren.', translation: 'Berlinbe utaztunk.' },
      { sentence: 'Er hat das Auto in die Garage gefahren.', translation: 'Beállt az autóval a garázsba.' },
    ],
  },
  {
    lemma: 'freuen',
    partOfSpeech: PartOfSpeech.VERB,
    cefrLevel: CefrLevel.A2,
    categories: ['gefuehle'],
    translations: [{ text: 'örül' }],
    attributes: {
      kind: 'verb',
      data: {
        conjugationType: ConjugationType.REGULAR,
        auxiliary: AuxiliaryVerb.HABEN,
        present3sg: 'freut sich',
        preterite3sg: 'freute sich',
        pastParticiple: 'gefreut',
        reflexiveType: ReflexiveType.ACCUSATIVE,
      },
    },
    valencies: [
      {
        preposition: 'auf',
        governedCase: GrammaticalCase.ACCUSATIVE,
        isReflexive: true,
        pattern: 'sich freuen auf + Akk.',
        meaning: 'örül valaminek (jövőbeli)',
        examples: [{ sentence: 'Ich freue mich auf den Urlaub.', translation: 'Várom a szabadságot.' }],
      },
      {
        preposition: 'über',
        governedCase: GrammaticalCase.ACCUSATIVE,
        isReflexive: true,
        pattern: 'sich freuen über + Akk.',
        meaning: 'örül valaminek (megtörtént)',
        examples: [{ sentence: 'Sie freut sich über das Geschenk.', translation: 'Örül az ajándéknak.' }],
      },
    ],
  },
  {
    lemma: 'helfen',
    partOfSpeech: PartOfSpeech.VERB,
    cefrLevel: CefrLevel.A1,
    categories: ['grundwortschatz'],
    translations: [{ text: 'segít' }],
    attributes: {
      kind: 'verb',
      data: {
        conjugationType: ConjugationType.IRREGULAR,
        auxiliary: AuxiliaryVerb.HABEN,
        present3sg: 'hilft',
        preterite3sg: 'half',
        pastParticiple: 'geholfen',
      },
    },
    valencies: [
      {
        preposition: null,
        governedCase: GrammaticalCase.DATIVE,
        pattern: 'helfen + Dat.',
        meaning: 'segít valakinek',
        examples: [{ sentence: 'Kannst du mir helfen?', translation: 'Tudsz nekem segíteni?' }],
      },
    ],
  },

  // --- Melléknevek -----------------------------------------------------------
  {
    lemma: 'schnell',
    partOfSpeech: PartOfSpeech.ADJECTIVE,
    cefrLevel: CefrLevel.A1,
    categories: ['grundwortschatz'],
    translations: [{ text: 'gyors' }],
    attributes: { kind: 'adjective', data: { comparative: 'schneller', superlative: 'am schnellsten' } },
  },
  {
    lemma: 'gut',
    partOfSpeech: PartOfSpeech.ADJECTIVE,
    cefrLevel: CefrLevel.A1,
    frequencyRank: 95,
    categories: ['grundwortschatz'],
    translations: [{ text: 'jó' }],
    attributes: {
      kind: 'adjective',
      data: { comparative: 'besser', superlative: 'am besten', isIrregularComparison: true },
    },
  },
  {
    lemma: 'stolz',
    partOfSpeech: PartOfSpeech.ADJECTIVE,
    cefrLevel: CefrLevel.B1,
    categories: ['gefuehle'],
    translations: [{ text: 'büszke' }],
    attributes: { kind: 'adjective', data: { comparative: 'stolzer', superlative: 'am stolzesten' } },
    valencies: [
      {
        preposition: 'auf',
        governedCase: GrammaticalCase.ACCUSATIVE,
        pattern: 'stolz auf + Akk.',
        meaning: 'büszke valamire/valakire',
        examples: [{ sentence: 'Die Eltern sind stolz auf ihre Tochter.', translation: 'A szülők büszkék a lányukra.' }],
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Írás
// ---------------------------------------------------------------------------

function wordKey(w: SeedWord): string {
  return `word:de:${w.partOfSpeech}:${w.lemma}:${w.homographNo ?? 1}`;
}

async function seedCategories(): Promise<Map<string, string>> {
  const ids = new Map<string, string>();
  for (const c of CATEGORIES) {
    const id = seedId(`category:${c.slug}`);
    const parentId = c.parent ? ids.get(c.parent) : undefined;
    if (c.parent && !parentId) {
      throw new Error(`Ismeretlen szülőkategória: ${c.parent} (${c.slug})`);
    }
    const data = { slug: c.slug, nameHu: c.nameHu, nameDe: c.nameDe, parentId: parentId ?? null };
    await prisma.category.upsert({ where: { id }, create: { id, ...data }, update: data });
    ids.set(c.slug, id);
  }
  return ids;
}

async function seedAttributes(tx: Prisma.TransactionClient, wordId: string, attrs: SeedAttributes): Promise<void> {
  switch (attrs.kind) {
    case 'noun':
      await tx.nounAttributes.upsert({ where: { wordId }, create: { wordId, ...attrs.data }, update: attrs.data });
      return;
    case 'verb':
      await tx.verbAttributes.upsert({ where: { wordId }, create: { wordId, ...attrs.data }, update: attrs.data });
      return;
    case 'adjective':
      await tx.adjectiveAttributes.upsert({ where: { wordId }, create: { wordId, ...attrs.data }, update: attrs.data });
      return;
  }
}

async function seedExamples(
  tx: Prisma.TransactionClient,
  wordId: string,
  keyPrefix: string,
  examples: SeedExample[],
  valencyId: string | null,
): Promise<void> {
  for (const [i, ex] of examples.entries()) {
    const id = seedId(`${keyPrefix}:example:${i}`);
    const data = { wordId, valencyId, sentence: ex.sentence, translation: ex.translation, sortOrder: i };
    await tx.exampleSentence.upsert({ where: { id }, create: { id, ...data }, update: data });
  }
}

async function seedWord(w: SeedWord, categoryIds: Map<string, string>): Promise<void> {
  const key = wordKey(w);
  const wordId = seedId(key);

  await prisma.$transaction(async (tx) => {
    const wordData = {
      language: 'de',
      lemma: w.lemma,
      partOfSpeech: w.partOfSpeech,
      homographNo: w.homographNo ?? 1,
      cefrLevel: w.cefrLevel,
      ipa: w.ipa ?? null,
      frequencyRank: w.frequencyRank ?? null,
    };
    await tx.word.upsert({ where: { id: wordId }, create: { id: wordId, ...wordData }, update: wordData });

    if (w.attributes) {
      await seedAttributes(tx, wordId, w.attributes);
    }

    for (const [i, t] of w.translations.entries()) {
      const id = seedId(`${key}:translation:hu:${t.text}`);
      const data = { wordId, language: 'hu', text: t.text, senseNote: t.senseNote ?? null, isPrimary: i === 0, sortOrder: i };
      await tx.translation.upsert({ where: { id }, create: { id, ...data }, update: data });
    }

    for (const [i, v] of (w.valencies ?? []).entries()) {
      const vKey = `${key}:valency:${v.preposition ?? '-'}:${v.governedCase}:${v.isReflexive ?? false}`;
      const id = seedId(vKey);
      const data = {
        wordId,
        preposition: v.preposition,
        governedCase: v.governedCase,
        isReflexive: v.isReflexive ?? false,
        pattern: v.pattern,
        meaning: v.meaning,
        sortOrder: i,
      };
      await tx.valency.upsert({ where: { id }, create: { id, ...data }, update: data });
      await seedExamples(tx, wordId, vKey, v.examples ?? [], id);
    }

    await seedExamples(tx, wordId, key, w.examples ?? [], null);

    for (const slug of w.categories) {
      const categoryId = categoryIds.get(slug);
      if (!categoryId) {
        throw new Error(`Ismeretlen kategória: ${slug} (${w.lemma})`);
      }
      await tx.wordCategory.upsert({
        where: { wordId_categoryId: { wordId, categoryId } },
        create: { wordId, categoryId },
        update: {},
      });
    }
  });
}

async function main(): Promise<void> {
  const categoryIds = await seedCategories();
  for (const w of WORDS) {
    await seedWord(w, categoryIds);
  }
  console.log(`Seed kész: ${CATEGORIES.length} kategória, ${WORDS.length} szó.`);
}

main()
  .catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
