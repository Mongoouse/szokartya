/**
 * Alap mintakészlet: kevés szó, de szándékosan lefedi a séma határeseteit –
 * azonos alakú szavak (der See / die See), csak egyes / csak többes számú
 * főnevek, n-deklináció, elváló és visszaható igék, kettős segédige, elöljárós
 * és esetvonzatok, rendhagyó fokozás. Az integrációs tesztek erre épülnek.
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
import { SeedCategory, SeedSet, SeedWord } from './types';

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

export const CORE_SET: SeedSet = { name: 'core', categories: CATEGORIES, words: WORDS };
