import { Prisma, UserProgress } from '@prisma/client';
import type { CardSchedulingState } from './scheduler/sm2-scheduler';

/** DB sor → ütemező állapot (Decimal → number). */
export function toSchedulingState(p: UserProgress): CardSchedulingState {
  return {
    state: p.state,
    easeFactor: p.easeFactor.toNumber(),
    intervalDays: p.intervalDays,
    repetitions: p.repetitions,
    learningStep: p.learningStep,
    lapses: p.lapses,
    totalReviews: p.totalReviews,
    correctReviews: p.correctReviews,
    avgResponseMs: p.avgResponseMs,
    stabilityDays: p.stabilityDays?.toNumber() ?? null,
    lastReviewedAt: p.lastReviewedAt,
    nextReviewAt: p.nextReviewAt,
  };
}

/** Ütemező állapot → `user_progress` UPDATE adat. */
export function toProgressUpdate(s: CardSchedulingState): Prisma.UserProgressUpdateInput {
  return {
    state: s.state,
    easeFactor: new Prisma.Decimal(s.easeFactor.toFixed(2)),
    intervalDays: s.intervalDays,
    repetitions: s.repetitions,
    learningStep: s.learningStep,
    lapses: s.lapses,
    totalReviews: s.totalReviews,
    correctReviews: s.correctReviews,
    avgResponseMs: s.avgResponseMs,
    stabilityDays: s.stabilityDays === null ? null : new Prisma.Decimal(s.stabilityDays.toFixed(4)),
    lastReviewedAt: s.lastReviewedAt,
    nextReviewAt: s.nextReviewAt,
  };
}
