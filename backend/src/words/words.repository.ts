import { Injectable } from '@nestjs/common';
import { AuxiliaryVerb, Category, CefrLevel, ConjugationType, GrammaticalGender, NumberType, PartOfSpeech, Prisma } from '@prisma/client';
import { DbClient, PrismaService } from '../prisma/prisma.service';
import { EnrollableWord } from './card-applicability';
import { visibleWordsWhere, WORD_DETAIL_INCLUDE, WordWithDetails } from './word-detail';

export interface WordFilter {
  q?: string;
  cefrLevel?: Prisma.WordWhereInput['cefrLevel'];
  partOfSpeech?: Prisma.WordWhereInput['partOfSpeech'];
  categorySlug?: string;
}

@Injectable()
export class WordsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findPage(userId: string, filter: WordFilter, limit: number, offset: number): Promise<{ items: WordWithDetails[]; total: number }> {
    const where = this.buildWhere(userId, filter);
    const [items, total] = await this.prisma.$transaction([
      this.prisma.word.findMany({
        where,
        include: WORD_DETAIL_INCLUDE,
        // Stabil rendezés: gyakoriság, majd betűrend, végül az azonosító.
        orderBy: [{ frequencyRank: { sort: 'asc', nulls: 'last' } }, { lemma: 'asc' }, { id: 'asc' }],
        take: limit,
        skip: offset,
      }),
      this.prisma.word.count({ where }),
    ]);
    return { items, total };
  }

  findVisibleById(userId: string, id: string, db: DbClient = this.prisma): Promise<WordWithDetails | null> {
    return db.word.findFirst({ where: { id, ...visibleWordsWhere(userId) }, include: WORD_DETAIL_INCLUDE });
  }

  /** A megadott azonosítók közül a felhasználó számára láthatók, a kártyatípusok alkalmazhatóságához szükséges adatokkal. */
  findVisibleForEnrollment(userId: string, ids: string[], db: DbClient = this.prisma): Promise<EnrollableWord[]> {
    return db.word.findMany({
      where: { id: { in: ids }, ...visibleWordsWhere(userId) },
      select: {
        id: true,
        partOfSpeech: true,
        nounAttributes: { select: { gender: true, numberType: true, pluralForm: true } },
        verbAttributes: { select: { wordId: true } },
        _count: { select: { valencies: { where: { deletedAt: null } } } },
      },
    });
  }

  findCategories(): Promise<Category[]> {
    return this.prisma.category.findMany({ orderBy: [{ sortOrder: 'asc' }, { nameHu: 'asc' }] });
  }

  private buildWhere(userId: string, filter: WordFilter): Prisma.WordWhereInput {
    const and: Prisma.WordWhereInput[] = [visibleWordsWhere(userId)];
    if (filter.cefrLevel) {
      and.push({ cefrLevel: filter.cefrLevel });
    }
    if (filter.partOfSpeech) {
      and.push({ partOfSpeech: filter.partOfSpeech });
    }
    if (filter.categorySlug) {
      and.push({ categories: { some: { category: { slug: filter.categorySlug } } } });
    }
    if (filter.q) {
      // ILIKE '%q%' – a trigram GIN indexek (words.lemma, translations.text) szolgálják ki.
      const q = filter.q.trim();
      and.push({
        OR: [
          { lemma: { contains: q, mode: 'insensitive' } },
          { translations: { some: { deletedAt: null, text: { contains: q, mode: 'insensitive' } } } },
        ],
      });
    }
    return { AND: and };
  }

  findById(id: string, db: DbClient = this.prisma) {
    return db.word.findUnique({ where: { id }, select: { id: true, ownerId: true, deletedAt: true } });
  }

  /** A következő szabad homográf-sorszám a felhasználó azonos alakú, azonos szófajú szavai között (törölteket is számolva). */
  async nextHomographNo(ownerId: string, lemma: string, partOfSpeech: PartOfSpeech, db: DbClient = this.prisma): Promise<number> {
    const { _max } = await db.word.aggregate({ where: { ownerId, language: 'de', lemma, partOfSpeech }, _max: { homographNo: true } });
    return (_max.homographNo ?? 0) + 1;
  }

  /** Saját szó a nyelvtani adataival, fordításaival és példamondatával – egy tranzakción belül hívandó. */
  async createCustom(data: CustomWordData, db: DbClient): Promise<WordWithDetails> {
    const { id, ownerId, lemma, partOfSpeech, homographNo, cefrLevel, noun, verb, translations, example } = data;
    await db.word.create({ data: { id, ownerId, language: 'de', lemma, partOfSpeech, homographNo, cefrLevel } });
    if (noun) {
      await db.nounAttributes.create({ data: { wordId: id, ...noun } });
    }
    if (verb) {
      await db.verbAttributes.create({ data: { wordId: id, ...verb } });
    }
    await db.translation.createMany({
      data: translations.map((text, i) => ({ wordId: id, language: 'hu', text, isPrimary: i === 0, sortOrder: i })),
    });
    if (example) {
      await db.exampleSentence.create({ data: { wordId: id, sentence: example.sentence, translation: example.translation ?? null } });
    }
    return db.word.findUniqueOrThrow({ where: { id }, include: WORD_DETAIL_INCLUDE });
  }

  /** Saját szó törlése (tombstone) a hozzá tartozó kártyákkal együtt. @returns false, ha nincs ilyen saját szó. */
  async softDeleteCustom(ownerId: string, id: string, now: Date, db: DbClient): Promise<boolean> {
    const { count } = await db.word.updateMany({ where: { id, ownerId, deletedAt: null }, data: { deletedAt: now } });
    if (count === 0) return false;
    await db.userProgress.updateMany({ where: { wordId: id, userId: ownerId, deletedAt: null }, data: { deletedAt: now } });
    return true;
  }
}

export interface CustomWordData {
  id: string;
  ownerId: string;
  lemma: string;
  partOfSpeech: PartOfSpeech;
  homographNo: number;
  cefrLevel: CefrLevel | null;
  noun: { gender: GrammaticalGender | null; numberType: NumberType; pluralForm: string | null } | null;
  verb: {
    conjugationType: ConjugationType;
    auxiliary: AuxiliaryVerb;
    present3sg: string;
    preterite3sg: string;
    pastParticiple: string;
  } | null;
  translations: string[];
  example: { sentence: string; translation?: string } | null;
}
