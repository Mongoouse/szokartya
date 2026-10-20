import { CardType, GrammaticalGender, NumberType, PartOfSpeech } from '@prisma/client';
import { applicableCardTypes, EnrollableWord, isCardTypeApplicable } from './card-applicability';

function word(overrides: Partial<EnrollableWord>): EnrollableWord {
  return { id: 'w', partOfSpeech: PartOfSpeech.ADVERB, nounAttributes: null, verbAttributes: null, _count: { valencies: 0 }, ...overrides };
}

const tisch = word({
  partOfSpeech: PartOfSpeech.NOUN,
  nounAttributes: { gender: GrammaticalGender.MASCULINE, numberType: NumberType.REGULAR, pluralForm: 'Tische' },
});

describe('kártyatípusok alkalmazhatósága', () => {
  it('megszámlálható főnév: névelő és többes szám is', () => {
    expect(applicableCardTypes(tisch)).toEqual([CardType.RECOGNITION, CardType.PRODUCTION, CardType.GENDER, CardType.PLURAL]);
  });

  it('csak egyes számú főnév: nincs többes szám; csak többes számú: nincs névelő', () => {
    const milch = word({
      partOfSpeech: PartOfSpeech.NOUN,
      nounAttributes: { gender: GrammaticalGender.FEMININE, numberType: NumberType.SINGULAR_ONLY, pluralForm: null },
    });
    const leute = word({
      partOfSpeech: PartOfSpeech.NOUN,
      nounAttributes: { gender: null, numberType: NumberType.PLURAL_ONLY, pluralForm: 'Leute' },
    });
    expect(isCardTypeApplicable(milch, CardType.PLURAL)).toBe(false);
    expect(isCardTypeApplicable(milch, CardType.GENDER)).toBe(true);
    expect(isCardTypeApplicable(leute, CardType.GENDER)).toBe(false);
    expect(isCardTypeApplicable(leute, CardType.PLURAL)).toBe(false);
  });

  it('ige: alapalakok csak kitöltött igei adatokkal; vonzat csak vonzatos szónál', () => {
    const warten = word({ partOfSpeech: PartOfSpeech.VERB, verbAttributes: { wordId: 'w' }, _count: { valencies: 1 } });
    expect(applicableCardTypes(warten)).toEqual([CardType.RECOGNITION, CardType.PRODUCTION, CardType.VERB_FORMS, CardType.VALENCY]);
    expect(isCardTypeApplicable(word({ partOfSpeech: PartOfSpeech.VERB }), CardType.VERB_FORMS)).toBe(false);
  });

  it('egyéb szófaj: csak felismerés és felidézés', () => {
    expect(applicableCardTypes(word({}))).toEqual([CardType.RECOGNITION, CardType.PRODUCTION]);
  });
});
