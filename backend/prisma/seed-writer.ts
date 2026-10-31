/**
 * A szókatalógus idempotens írása – a seed és a szólista-importáló közös kódja.
 *
 * Minden rekord determinisztikus UUID-t kap (UUID v5 a természetes kulcsból),
 * és `upsert`-tel kerül be, így többszöri futtatás sem hoz létre duplikátumot.
 * Egy szó összes rekordja egyetlen tranzakcióban íródik.
 */
import { createHash } from 'node:crypto';
import { CefrLevel, GrammaticalCase, PartOfSpeech, Prisma, PrismaClient } from '@prisma/client';

/** Rögzített névtér a seed-azonosítókhoz (RFC 4122 UUID v5). */
const SEED_NAMESPACE = 'b7c2a4f0-6a51-4f3e-9d0e-2c1f5e8a9b10';

/** Determinisztikus UUID v5 egy természetes kulcsból. */
export function seedId(key: string): string {
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

export interface SeedTranslation {
  text: string;
  senseNote?: string;
}

export interface SeedValency {
  preposition: string | null;
  governedCase: GrammaticalCase;
  isReflexive?: boolean;
  pattern: string;
  meaning: string;
  examples?: SeedExample[];
}

export interface SeedExample {
  sentence: string;
  translation: string;
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

// ---------------------------------------------------------------------------
// Írás
// ---------------------------------------------------------------------------

export function wordKey(w: Pick<SeedWord, 'partOfSpeech' | 'lemma' | 'homographNo'>): string {
  return `word:de:${w.partOfSpeech}:${w.lemma}:${w.homographNo ?? 1}`;
}

/** Kategóriák írása (szülők a gyermekeik előtt). @returns slug → azonosító. */
export async function seedCategories(prisma: PrismaClient, categories: SeedCategory[]): Promise<Map<string, string>> {
  const ids = new Map<string, string>();
  for (const c of categories) {
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

export async function seedWord(prisma: PrismaClient, w: SeedWord, categoryIds: Map<string, string>): Promise<void> {
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
