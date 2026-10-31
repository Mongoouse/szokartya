import { CardType, GrammaticalGender, NumberType, PartOfSpeech } from '@prisma/client';

/** Egy szó azon adatai, amelyekből eldönthető, milyen kártyák képezhetők belőle. */
export interface EnrollableWord {
  id: string;
  partOfSpeech: PartOfSpeech;
  nounAttributes: { gender: GrammaticalGender | null; numberType: NumberType; pluralForm: string | null } | null;
  verbAttributes: { wordId: string } | null;
  _count: { valencies: number };
}

/**
 * Kártyatípus alkalmazhatósága. Egy szóból csak olyan kártya készül, amelynek
 * van értelmes kérdése és válasza:
 *  - GENDER:     nemmel rendelkező főnév (die Leute-nél nincs névelő);
 *  - PLURAL:     megszámlálható főnév ismert többes számmal (die Milch-nél nincs);
 *  - VERB_FORMS: ige kitöltött alapalakokkal;
 *  - VALENCY:    legalább egy vonzattal rendelkező szó.
 */
export function isCardTypeApplicable(word: EnrollableWord, type: CardType): boolean {
  const noun = word.partOfSpeech === PartOfSpeech.NOUN ? word.nounAttributes : null;
  switch (type) {
    case CardType.RECOGNITION:
    case CardType.PRODUCTION:
      return true;
    case CardType.GENDER:
      return noun?.gender != null;
    case CardType.PLURAL:
      return noun?.numberType === NumberType.REGULAR && noun.pluralForm != null;
    case CardType.VERB_FORMS:
      return word.partOfSpeech === PartOfSpeech.VERB && word.verbAttributes != null;
    case CardType.VALENCY:
      return word._count.valencies > 0;
  }
}

/** Az összes kártyatípus, amely a szóra alkalmazható. */
export function applicableCardTypes(word: EnrollableWord): CardType[] {
  return Object.values(CardType).filter((t) => isCardTypeApplicable(word, t));
}
