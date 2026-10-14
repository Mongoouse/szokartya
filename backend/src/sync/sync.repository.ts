import { Injectable } from '@nestjs/common';
import { CardType, Prisma, ReviewLog, UserProgress } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { WORD_DETAIL_INCLUDE, WordWithDetails } from '../words/word-detail';
import type { KeysetStart } from './sync-cursor';

/**
 * Keyset (időbélyeg, id) feltétel. Indexek: user_progress (user_id, updated_at),
 * words (updated_at), review_logs (user_id, received_at).
 */
function keyset<F extends string>(field: F, start: KeysetStart): Record<string, unknown> {
  switch (start.kind) {
    case 'all':
      return {};
    case 'since':
      return { [field]: { gte: start.t } };
    case 'after':
      return { OR: [{ [field]: { gt: start.t } }, { [field]: start.t, id: { gt: start.id } }] };
  }
}

/** A szinkronizáció adatelérési rétege. A törölt sorokat is visszaadja (tombstone). */
@Injectable()
export class SyncRepository {
  constructor(private readonly prisma: PrismaService) {}

  progressChanges(userId: string, start: KeysetStart, limit: number): Promise<UserProgress[]> {
    return this.prisma.userProgress.findMany({
      where: { userId, ...(keyset('updatedAt', start) as Prisma.UserProgressWhereInput) },
      orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
      take: limit,
    });
  }

  /** A felhasználó számára látható szavak (központi + saját) változásai. */
  wordChanges(userId: string, start: KeysetStart, limit: number): Promise<WordWithDetails[]> {
    return this.prisma.word.findMany({
      where: {
        AND: [{ OR: [{ ownerId: null }, { ownerId: userId }] }, keyset('updatedAt', start) as Prisma.WordWhereInput],
      },
      orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
      take: limit,
      include: WORD_DETAIL_INCLUDE,
    });
  }

  reviewLogChanges(userId: string, start: KeysetStart, limit: number): Promise<ReviewLog[]> {
    return this.prisma.reviewLog.findMany({
      where: { userId, ...(keyset('receivedAt', start) as Prisma.ReviewLogWhereInput) },
      orderBy: [{ receivedAt: 'asc' }, { id: 'asc' }],
      take: limit,
    });
  }

  /** Kártya a természetes kulcsa alapján – törölt is. */
  findCardByNaturalKey(userId: string, wordId: string, cardType: CardType): Promise<UserProgress | null> {
    return this.prisma.userProgress.findUnique({
      where: { userId_wordId_cardType: { userId, wordId, cardType } },
    });
  }

  findOwnedCardIncludingDeleted(userId: string, id: string): Promise<UserProgress | null> {
    return this.prisma.userProgress.findFirst({ where: { id, userId } });
  }

  createCard(data: { id: string; userId: string; wordId: string; cardType: CardType }): Promise<UserProgress> {
    return this.prisma.userProgress.create({ data });
  }

  restoreCard(id: string): Promise<UserProgress> {
    return this.prisma.userProgress.update({ where: { id }, data: { deletedAt: null } });
  }

  /**
   * Feltételes módosítás: csak akkor ír, ha a verzió azóta nem változott
   * (optimista konkurencia). @returns true, ha a módosítás megtörtént.
   */
  async updateCardIfVersion(
    id: string,
    expectedVersion: number,
    data: { isSuspended?: boolean; deletedAt?: Date | null; flagsChangedAt: Date },
  ): Promise<boolean> {
    const { count } = await this.prisma.userProgress.updateMany({ where: { id, version: expectedVersion }, data });
    return count === 1;
  }
}
