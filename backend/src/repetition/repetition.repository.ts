import { Injectable } from '@nestjs/common';
import { CardState, CardType, Prisma, ReviewLog, UserProgress } from '@prisma/client';
import { DbClient, PrismaService } from '../prisma/prisma.service';
import { WORD_DETAIL_INCLUDE } from '../words/word-detail';

export const CARD_INCLUDE = { word: { include: WORD_DETAIL_INCLUDE } } satisfies Prisma.UserProgressInclude;
export type ProgressWithWord = Prisma.UserProgressGetPayload<{ include: typeof CARD_INCLUDE }>;

/** Aktív (nem törölt, nem felfüggesztett) kártyák – a részleges indexek feltételével egyezően. */
const ACTIVE = { deletedAt: null, isSuspended: false } as const;

/**
 * A `user_progress` és `review_logs` táblák adatelérési rétege.
 *
 * A lekérdezések alakja szándékosan követi a Fázis 1 részleges indexeit
 * (`user_progress_due_idx`, `user_progress_new_idx`), hogy a tervező index
 * range scant és rendezésmentes LIMIT-et használhasson.
 */
@Injectable()
export class RepetitionRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Esedékes, már tanult kártyák a megadott időpontig, esedékesség szerint. */
  findDue(userId: string, dueBefore: Date, states: CardState[], limit: number, db: DbClient = this.prisma): Promise<ProgressWithWord[]> {
    if (limit <= 0) {
      return Promise.resolve([]);
    }
    return db.userProgress.findMany({
      where: { userId, ...ACTIVE, state: { in: states, not: CardState.NEW }, nextReviewAt: { lte: dueBefore } },
      orderBy: [{ nextReviewAt: 'asc' }, { id: 'asc' }],
      take: limit,
      include: CARD_INCLUDE,
    });
  }

  /** Új kártyák felvételi sorrendben. */
  findNew(userId: string, limit: number, db: DbClient = this.prisma): Promise<ProgressWithWord[]> {
    if (limit <= 0) {
      return Promise.resolve([]);
    }
    return db.userProgress.findMany({
      where: { userId, ...ACTIVE, state: CardState.NEW },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: limit,
      include: CARD_INCLUDE,
    });
  }

  /**
   * A kártya sorának zárolása (SELECT … FOR UPDATE) a tranzakció végéig.
   * Indoklás: egy kártya párhuzamos értékelései (pl. két eszközről, vagy
   * dupla kattintás) így sorosan futnak, és egyik sem írja felül a másik
   * ütemezését (lost update). A zár soronkénti, más kártyákat nem blokkol.
   */
  async lockOwnedCard(userId: string, progressId: string, db: DbClient): Promise<UserProgress | null> {
    const rows = await db.$queryRaw<{ id: string }[]>`
      SELECT id FROM user_progress
       WHERE id = ${progressId}::uuid AND user_id = ${userId}::uuid AND deleted_at IS NULL
       FOR UPDATE`;
    if (rows.length === 0) {
      return null;
    }
    return db.userProgress.findUnique({ where: { id: progressId } });
  }

  findReviewLog(id: string, db: DbClient = this.prisma): Promise<ReviewLog | null> {
    return db.reviewLog.findUnique({ where: { id } });
  }

  updateProgress(id: string, data: Prisma.UserProgressUpdateInput, db: DbClient): Promise<UserProgress> {
    return db.userProgress.update({ where: { id }, data });
  }

  createReviewLog(data: Prisma.ReviewLogUncheckedCreateInput, db: DbClient): Promise<ReviewLog> {
    return db.reviewLog.create({ data });
  }

  /** Kártyák felvétele; a már létezőket (user, szó, kártyatípus) kihagyja. */
  async createCards(cards: { userId: string; wordId: string; cardType: CardType }[], db: DbClient = this.prisma): Promise<number> {
    if (cards.length === 0) {
      return 0;
    }
    const { count } = await db.userProgress.createMany({ data: cards, skipDuplicates: true });
    return count;
  }

  /** Korábban törölt (soft delete) kártyák visszaállítása, megtartva a tanulási előzményt. */
  async restoreCards(userId: string, wordIds: string[], cardTypes: CardType[], db: DbClient = this.prisma): Promise<number> {
    const { count } = await db.userProgress.updateMany({
      where: { userId, wordId: { in: wordIds }, cardType: { in: cardTypes }, deletedAt: { not: null } },
      data: { deletedAt: null },
    });
    return count;
  }

  setSuspended(userId: string, progressId: string, isSuspended: boolean): Promise<Prisma.BatchPayload> {
    return this.prisma.userProgress.updateMany({
      where: { id: progressId, userId, deletedAt: null },
      data: { isSuspended, flagsChangedAt: new Date() },
    });
  }

  findOwnedCard(userId: string, progressId: string): Promise<ProgressWithWord | null> {
    return this.prisma.userProgress.findFirst({
      where: { id: progressId, userId, deletedAt: null },
      include: CARD_INCLUDE,
    });
  }

  /** Az adott időszakban értékelt kártyák száma, értékelés előtti állapot szerint. */
  countReviewsSince(userId: string, since: Date, statesBefore: CardState[]): Promise<number> {
    return this.prisma.reviewLog.count({
      where: { userId, reviewedAt: { gte: since }, stateBefore: { in: statesBefore } },
    });
  }

  countCardsByState(userId: string) {
    return this.prisma.userProgress.groupBy({
      by: ['state'],
      where: { userId, ...ACTIVE },
      _count: { _all: true },
    });
  }

  countDue(userId: string, dueBefore: Date): Promise<number> {
    return this.prisma.userProgress.count({
      where: { userId, ...ACTIVE, state: { not: CardState.NEW }, nextReviewAt: { lte: dueBefore } },
    });
  }

  /** Aggregált napló-metrikák egy időszakra. */
  async reviewMetricsSince(userId: string, since: Date): Promise<{ total: number; correct: number; avgResponseMs: number | null }> {
    const [agg, correct] = await this.prisma.$transaction([
      this.prisma.reviewLog.aggregate({
        where: { userId, reviewedAt: { gte: since } },
        _count: { _all: true },
        _avg: { responseTimeMs: true },
      }),
      this.prisma.reviewLog.count({ where: { userId, reviewedAt: { gte: since }, grade: { gte: 3 } } }),
    ]);
    const avg = agg._avg.responseTimeMs;
    return { total: agg._count._all, correct, avgResponseMs: avg === null ? null : Math.round(avg) };
  }
}
