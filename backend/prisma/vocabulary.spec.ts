import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  AuxiliaryVerb,
  ConjugationType,
  GrammaticalCase,
  GrammaticalGender,
  NumberType,
  PartOfSpeech,
  ReflexiveType,
} from '@prisma/client';
import { parseLine, parseVocabulary, VocabularyFormatError } from './vocabulary';

describe('szólista-formátum', () => {
  it('főnév: névelő → nem, többes szám, n-deklináció, példamondat', () => {
    const w = parseLine('N|A1|der|Junge|Jungen|fiú;srác|menschen,familie|Der Junge spielt. = A fiú játszik.|n');
    expect(w).toMatchObject({
      lemma: 'Junge',
      partOfSpeech: PartOfSpeech.NOUN,
      cefrLevel: 'A1',
      categories: ['menschen', 'familie'],
      translations: [{ text: 'fiú' }, { text: 'srác' }],
      examples: [{ sentence: 'Der Junge spielt.', translation: 'A fiú játszik.' }],
      attributes: {
        kind: 'noun',
        data: { gender: GrammaticalGender.MASCULINE, numberType: NumberType.REGULAR, pluralForm: 'Jungen', isNDeclension: true },
      },
    });
  });

  it('főnév: csak egyes és csak többes számú alak (a séma CHECK kényszereivel összhangban)', () => {
    expect(parseLine('N|A1|die|Milch|-|tej|lebensmittel').attributes).toEqual({
      kind: 'noun',
      data: { gender: GrammaticalGender.FEMININE, numberType: NumberType.SINGULAR_ONLY, pluralForm: null, isNDeclension: false },
    });
    expect(parseLine('N|A1|pl|Eltern|Eltern|szülők|familie').attributes).toMatchObject({
      data: { gender: null, numberType: NumberType.PLURAL_ONLY, pluralForm: 'Eltern' },
    });
  });

  it('ige: elváló igekötő, visszaható alak, segédige, vonzat mintával', () => {
    const w = parseLine(
      'V|B1|sich vor·bereiten|bereitet sich vor|bereitete sich vor|hat vorbereitet|r|felkészül|bildung||auf:A:felkészül valamire',
    );
    expect(w).toMatchObject({
      lemma: 'vorbereiten',
      homographNo: 1,
      attributes: {
        kind: 'verb',
        data: {
          conjugationType: ConjugationType.REGULAR,
          auxiliary: AuxiliaryVerb.HABEN,
          pastParticiple: 'vorbereitet',
          isSeparable: true,
          separablePrefix: 'vor',
          reflexiveType: ReflexiveType.ACCUSATIVE,
        },
      },
      valencies: [
        {
          preposition: 'auf',
          governedCase: GrammaticalCase.ACCUSATIVE,
          isReflexive: true,
          pattern: 'sich vorbereiten auf + Akk.',
          meaning: 'felkészül valamire',
        },
      ],
    });
  });

  it('ige: kettős segédige, részes esetű visszaható alak homográf-sorszámmal, elöljáró nélküli vonzat', () => {
    expect(parseLine('V|A1|fahren|fährt|fuhr|hat/ist gefahren|i|utazik|verkehr').attributes).toMatchObject({
      data: { auxiliary: AuxiliaryVerb.BOTH, conjugationType: ConjugationType.IRREGULAR },
    });
    expect(parseLine('V|B1|sich(D) vor·stellen#2|stellt sich vor|stellte sich vor|hat vorgestellt|r|elképzel|x')).toMatchObject({
      lemma: 'vorstellen',
      homographNo: 2,
      attributes: { data: { reflexiveType: ReflexiveType.DATIVE } },
    });
    expect(parseLine('V|A2|danken|dankt|dankte|hat gedankt|r|megköszön|x||-:D:megköszön valakinek').valencies).toEqual([
      {
        preposition: null,
        governedCase: GrammaticalCase.DATIVE,
        isReflexive: false,
        pattern: 'danken + Dat.',
        meaning: 'megköszön valakinek',
      },
    ]);
  });

  it('melléknév: fokozás, rendhagyó és állítmányi jelző, nem fokozható, vonzat', () => {
    expect(parseLine('A|A1|viel|mehr|am meisten|sok|x||!').attributes).toEqual({
      kind: 'adjective',
      data: { comparative: 'mehr', superlative: 'am meisten', isIrregularComparison: true, isPredicativeOnly: false },
    });
    expect(parseLine('A|B1|schuld|-|-|hibás|x||p').attributes).toMatchObject({
      data: { comparative: null, superlative: null, isPredicativeOnly: true },
    });
    expect(parseLine('A|A2|zufrieden|zufriedener|am zufriedensten|elégedett|x||mit:D:elégedett valamivel').valencies).toMatchObject([
      { pattern: 'zufrieden mit + Dat.', meaning: 'elégedett valamivel' },
    ]);
  });

  it('egyéb szófaj: határozószó, kötőszó; a főbb szófajok itt nem engedettek', () => {
    expect(parseLine('X|A1|ADVERB|heute|ma|zeit')).toMatchObject({ lemma: 'heute', partOfSpeech: PartOfSpeech.ADVERB });
    expect(() => parseLine('X|A1|NOUN|Tisch|asztal|x')).toThrow(/szófaj/);
  });

  it('hibás sorok: a hibaüzenet a sorszámot is tartalmazza', () => {
    const text = '# fejléc\n\nN|A1|der|Tisch|Tische|asztal|x\nN|Z9|der|Stuhl|Stühle|szék|x\n';
    expect(() => parseVocabulary(text)).toThrow(VocabularyFormatError);
    expect(() => parseVocabulary(text)).toThrow(/^4\. sor: érvénytelen CEFR szint/);
    expect(() => parseLine('N|A1|dem|Tisch|Tische|asztal|x')).toThrow(/névelő/);
    expect(() => parseLine('V|A1|gehen|geht|ging|gegangen|i|megy|x')).toThrow(/Perfekt/);
    expect(() => parseLine('N|A1|der|Tisch|Tische||x')).toThrow(/fordítás/);
    expect(() => parseLine('N|A1|der|Tisch|Tische|asztal|x|nincs fordítás')).toThrow(/példamondat/);
  });

  it('a mellékelt szólista hibátlanul beolvasható, és nincs benne ismétlődő szó', () => {
    const words = parseVocabulary(readFileSync(join(__dirname, 'data', 'wortschatz.txt'), 'utf8'));
    expect(words.length).toBeGreaterThan(400);
    const keys = words.map((w) => `${w.partOfSpeech}:${w.lemma}:${w.homographNo ?? 1}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
