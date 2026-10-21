/**
 * A seed szókészletek közös adatszerkezetei (a `seed.ts` és a szólisták is
 * ezeket használják).
 */
import { CefrLevel, GrammaticalCase, PartOfSpeech, Prisma } from '@prisma/client';

export interface SeedTranslation {
  text: string;
  senseNote?: string;
}

export interface SeedExample {
  sentence: string;
  translation: string;
}

export interface SeedValency {
  preposition: string | null;
  governedCase: GrammaticalCase;
  isReflexive?: boolean;
  pattern: string;
  meaning: string;
  examples?: SeedExample[];
}

export type SeedAttributes =
  | { kind: 'noun'; data: Omit<Prisma.NounAttributesUncheckedCreateInput, 'wordId' | 'partOfSpeech'> }
  | { kind: 'verb'; data: Omit<Prisma.VerbAttributesUncheckedCreateInput, 'wordId' | 'partOfSpeech'> }
  | { kind: 'adjective'; data: Omit<Prisma.AdjectiveAttributesUncheckedCreateInput, 'wordId' | 'partOfSpeech'> };

export interface SeedWord {
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

export interface SeedCategory {
  slug: string;
  nameHu: string;
  nameDe: string;
  parent?: string;
}

/** Egy önállóan betölthető szókészlet (pl. alap minták, B2 szókincs). */
export interface SeedSet {
  name: string;
  categories: SeedCategory[];
  words: SeedWord[];
}

/** Természetes kulcs – ebből képződik a determinisztikus UUID is. */
export function wordKey(w: Pick<SeedWord, 'partOfSpeech' | 'lemma' | 'homographNo'>): string {
  return `word:de:${w.partOfSpeech}:${w.lemma}:${w.homographNo ?? 1}`;
}
