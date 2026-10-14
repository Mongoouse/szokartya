import { Injectable } from '@nestjs/common';
import { Category, Prisma } from '@prisma/client';
import { DbClient, PrismaService } from '../prisma/prisma.service';
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

  async findPage(
    userId: string,
    filter: WordFilter,
    limit: number,
    offset: number,
  ): Promise<{ items: WordWithDetails[]; total: number }> {
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

  /** A megadott azonosítók közül a felhasználó számára láthatók, a főnévi nemmel. */
  findVisibleForEnrollment(userId: string, ids: string[], db: DbClient = this.prisma) {
    return db.word.findMany({
      where: { id: { in: ids }, ...visibleWordsWhere(userId) },
      select: { id: true, partOfSpeech: true, nounAttributes: { select: { gender: true } } },
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
}
