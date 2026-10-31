import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { CardState } from '@prisma/client';
import { localDayBounds } from '../common/utils/time-zone';
import { isCardTypeApplicable } from '../words/card-applicability';
import { DbClient, PrismaService } from '../prisma/prisma.service';
import { UsersRepository } from '../users/users.repository';
import { WordsRepository } from '../words/words.repository';
import {
  CardCountsDto,
  EnrollCardsDto,
  EnrollResultDto,
  ReviewResultDto,
  StudyCardDto,
  StudyQueueDto,
  StudyStatsDto,
  SubmitReviewDto,
} from './dto/study.dto';
import { toProgressUpdate, toSchedulingState } from './progress.mapper';
import { RepetitionRepository } from './repetition.repository';
import { Grade, scheduleReview, SchedulerConfig } from './scheduler/sm2-scheduler';

export const SCHEDULER_CONFIG = Symbol('SCHEDULER_CONFIG');

/** Egy értékelés bemenete (REST DTO és szinkron push közös alakja). */
export interface ReviewInputData {
  reviewId: string;
  grade: number;
  responseTimeMs: number;
  reviewedAt?: Date;
  deviceId?: string | null;
}

export interface ReviewOutcome {
  /** true: a reviewId-t a szerver már korábban feldolgozta. */
  duplicate: boolean;
  effectiveGrade: number;
}

/** Ennyivel lehet a kliens órája a szerveré előtt, mielőtt a szerveridőt használjuk. */
const MAX_CLOCK_SKEW_MS = 5 * 60_000;
const DAY_MS = 86_400_000;

/**
 * Adaptív tanulási szolgáltatás: napi kártyasor összeállítása, értékelések
 * feldolgozása és statisztika. Az ütemezési matematika a tiszta
 * `sm2-scheduler` modulban van; ez a réteg az állapotot, a tranzakciókat és a
 * napi kereteket kezeli.
 */
@Injectable()
export class RepetitionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: RepetitionRepository,
    private readonly users: UsersRepository,
    private readonly words: WordsRepository,
    @Inject(SCHEDULER_CONFIG) private readonly schedulerConfig: SchedulerConfig,
  ) {}

  // -------------------------------------------------------------------------
  // Napi sor
  // -------------------------------------------------------------------------

  /**
   * A napi ismétlendő kártyák szelektálása.
   *
   *  - learning: tanulási / újratanulási lépcsőn lévő kártyák a nap végéig –
   *    nem számítanak a keretbe, mert egy elkezdett tanulást be kell fejezni.
   *    A kliens a `nextReviewAt` alapján perc pontosan mutatja őket.
   *  - reviews: REVIEW állapotú, a helyi nap végéig esedékes kártyák,
   *    a napi ismétlési keretből még hátralévő mennyiségig.
   *  - newCards: új kártyák a napi új-kártya keretből hátralévő mennyiségig.
   *
   * A „nap” a felhasználó időzónájában értendő.
   */
  async getDailyQueue(userId: string, limit: number, now: Date = new Date()): Promise<StudyQueueDto> {
    const user = await this.requireUser(userId);
    const { start: dayStart, end: dayEnd } = localDayBounds(now, user.timezone);

    const [reviewsDoneToday, newIntroducedToday] = await Promise.all([
      this.repo.countReviewsSince(userId, dayStart, [CardState.REVIEW]),
      this.repo.countReviewsSince(userId, dayStart, [CardState.NEW]),
    ]);
    const reviewsRemaining = Math.max(0, user.dailyReviewLimit - reviewsDoneToday);
    const newRemaining = Math.max(0, user.dailyNewCardsLimit - newIntroducedToday);

    const [learning, reviews, newCards] = await Promise.all([
      this.repo.findDue(userId, dayEnd, [CardState.LEARNING, CardState.RELEARNING], limit),
      this.repo.findDue(userId, dayEnd, [CardState.REVIEW], Math.min(limit, reviewsRemaining)),
      this.repo.findNew(userId, Math.min(limit, newRemaining)),
    ]);

    return {
      generatedAt: now,
      dayEndsAt: dayEnd,
      learning: learning.map(StudyCardDto.fromEntity),
      reviews: reviews.map(StudyCardDto.fromEntity),
      newCards: newCards.map(StudyCardDto.fromEntity),
      reviewsRemainingToday: reviewsRemaining,
      newCardsRemainingToday: newRemaining,
    };
  }

  // -------------------------------------------------------------------------
  // Értékelés
  // -------------------------------------------------------------------------

  /**
   * Egy értékelési esemény feldolgozása egyetlen tranzakcióban:
   *  1. a kártya sorának zárolása (FOR UPDATE) – párhuzamos értékelések sorosítása;
   *  2. idempotencia: ha a `reviewId` már fel van dolgozva, a jelenlegi
   *     állapotot adjuk vissza, újraszámolás nélkül;
   *  3. az új állapot kiszámítása az SM-2 ütemezővel;
   *  4. `user_progress` frissítése és a `review_logs` bejegyzés beszúrása.
   * Bármely lépés hibája esetén minden visszagörgetődik: nem lehet napló
   * állapotváltozás nélkül, sem állapotváltozás napló nélkül.
   */
  async submitReview(userId: string, progressId: string, dto: SubmitReviewDto, now: Date = new Date()): Promise<ReviewResultDto> {
    const outcome = await this.applyReview(userId, progressId, dto, now);
    const card = await this.repo.findOwnedCard(userId, progressId);
    if (!card) {
      throw new NotFoundException('A kártya nem található');
    }
    return {
      reviewId: dto.reviewId,
      duplicate: outcome.duplicate,
      effectiveGrade: outcome.effectiveGrade,
      card: StudyCardDto.fromEntity(card),
    };
  }

  /**
   * Az értékelés tranzakciós magja – a REST végpont és a szinkronizációs
   * push közösen használja, így offline és online értékelés pontosan
   * ugyanazon a kódúton megy át.
   */
  async applyReview(userId: string, progressId: string, input: ReviewInputData, now: Date = new Date()): Promise<ReviewOutcome> {
    return this.prisma.$transaction(async (tx) => {
      const card = await this.repo.lockOwnedCard(userId, progressId, tx);
      if (!card) {
        throw new NotFoundException('A kártya nem található');
      }

      const existingLog = await this.repo.findReviewLog(input.reviewId, tx);
      if (existingLog) {
        if (existingLog.userId !== userId || existingLog.progressId !== progressId) {
          throw new ConflictException('A reviewId már egy másik értékeléshez tartozik');
        }
        return { duplicate: true, effectiveGrade: existingLog.grade };
      }
      if (card.isSuspended) {
        throw new ConflictException('Felfüggesztett kártya nem értékelhető');
      }

      const state = toSchedulingState(card);
      const reviewedAt = this.normalizeReviewedAt(input.reviewedAt, state.lastReviewedAt, now);
      const scheduled = scheduleReview(
        state,
        { grade: input.grade as Grade, responseTimeMs: input.responseTimeMs, reviewedAt },
        await this.configFor(userId, tx),
      );

      await this.repo.updateProgress(card.id, toProgressUpdate(scheduled.card), tx);
      await this.repo.createReviewLog(
        {
          id: input.reviewId,
          userId,
          progressId: card.id,
          grade: input.grade,
          responseTimeMs: input.responseTimeMs,
          reviewedAt,
          deviceId: input.deviceId ?? null,
          stateBefore: state.state,
          stateAfter: scheduled.card.state,
          easeFactorBefore: state.easeFactor,
          easeFactorAfter: scheduled.card.easeFactor,
          intervalDaysBefore: state.intervalDays,
          intervalDaysAfter: scheduled.card.intervalDays,
          elapsedDays: scheduled.elapsedDays,
          scheduledNextReviewAt: scheduled.card.nextReviewAt!,
        },
        tx,
      );
      return { duplicate: false, effectiveGrade: scheduled.effectiveGrade };
    });
  }

  /**
   * Az értékelés időpontjának normalizálása:
   *  - jövőbeli kliensidő (óraeltérés) → szerveridő;
   *  - az előző értékelésnél korábbi időpont (sorrenden kívül érkező offline
   *    esemény) → az előző értékelés ideje, hogy az eltelt idő ne legyen negatív.
   */
  private normalizeReviewedAt(clientTime: Date | undefined, lastReviewedAt: Date | null, now: Date): Date {
    let t = clientTime ?? now;
    if (t.getTime() > now.getTime() + MAX_CLOCK_SKEW_MS) {
      t = now;
    }
    if (lastReviewedAt && t < lastReviewedAt) {
      t = lastReviewedAt;
    }
    return t;
  }

  // -------------------------------------------------------------------------
  // Kártyakezelés
  // -------------------------------------------------------------------------

  /** Szavak felvétele a tanulandók közé a kért kártyatípusokkal. */
  async enroll(userId: string, dto: EnrollCardsDto): Promise<EnrollResultDto> {
    return this.prisma.$transaction(async (tx) => {
      const words = await this.words.findVisibleForEnrollment(userId, dto.wordIds, tx);
      const found = new Set(words.map((w) => w.id));
      const unknownWordIds = dto.wordIds.filter((id) => !found.has(id));

      const cards = words.flatMap((w) =>
        dto.cardTypes
          // Pl. névelőkártya csak nemmel rendelkező főnévnél értelmes (die Leute-nél nem).
          .filter((t) => isCardTypeApplicable(w, t))
          .map((cardType) => ({ userId, wordId: w.id, cardType })),
      );

      const restored = await this.repo.restoreCards(userId, [...found], dto.cardTypes, tx);
      const created = await this.repo.createCards(cards, tx);
      return { created, restored, unknownWordIds };
    });
  }

  async setSuspended(userId: string, progressId: string, isSuspended: boolean): Promise<StudyCardDto> {
    const { count } = await this.repo.setSuspended(userId, progressId, isSuspended);
    if (count === 0) {
      throw new NotFoundException('A kártya nem található');
    }
    const card = await this.repo.findOwnedCard(userId, progressId);
    return StudyCardDto.fromEntity(card!);
  }

  // -------------------------------------------------------------------------
  // Statisztika
  // -------------------------------------------------------------------------

  async getStats(userId: string, now: Date = new Date()): Promise<StudyStatsDto> {
    const user = await this.requireUser(userId);
    const { start: dayStart, end: dayEnd } = localDayBounds(now, user.timezone);
    const since30 = new Date(now.getTime() - 30 * DAY_MS);

    const [byState, dueNow, dueToday, reviewsToday, metrics] = await Promise.all([
      this.repo.countCardsByState(userId),
      this.repo.countDue(userId, now),
      this.repo.countDue(userId, dayEnd),
      this.repo.countReviewsSince(userId, dayStart, Object.values(CardState)),
      this.repo.reviewMetricsSince(userId, since30),
    ]);

    const cardsByState: CardCountsDto = { NEW: 0, LEARNING: 0, REVIEW: 0, RELEARNING: 0 };
    for (const row of byState) {
      cardsByState[row.state] = row._count._all;
    }
    const accuracy = metrics.total > 0 ? round3(metrics.correct / metrics.total) : null;

    return {
      cardsByState,
      dueNow,
      dueToday,
      reviewsToday,
      reviewsLast30Days: metrics.total,
      accuracyLast30Days: accuracy,
      errorRateLast30Days: accuracy === null ? null : round3(1 - accuracy),
      avgResponseMsLast30Days: metrics.avgResponseMs,
    };
  }

  /** Az ütemező konfigurációja a felhasználó választott célmegtartásával. */
  private async configFor(userId: string, db: DbClient): Promise<SchedulerConfig> {
    const user = await this.users.findActiveById(userId, db);
    const targetRetention = user?.targetRetention.toNumber() ?? this.schedulerConfig.targetRetention;
    return targetRetention === this.schedulerConfig.targetRetention ? this.schedulerConfig : { ...this.schedulerConfig, targetRetention };
  }

  private async requireUser(userId: string) {
    const user = await this.users.findActiveById(userId);
    if (!user) {
      throw new NotFoundException('A felhasználó nem található');
    }
    return user;
  }
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}
