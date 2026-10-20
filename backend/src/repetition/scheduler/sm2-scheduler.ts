/**
 * Módosított SM-2 ismétlésütemező – tiszta (pure) függvények.
 *
 * Nincs keretrendszer-, adatbázis- vagy órafüggősége: minden bemenet (beleértve
 * az értékelés időpontját) paraméter, ezért determinisztikus és önállóan
 * tesztelhető. A Flutter kliens 1:1-es portja (`mobile/lib/domain/sm2_scheduler.dart`)
 * offline ütemez; a két implementáció egyezését a közös golden fájl
 * (`shared/fixtures/sm2-golden.json`) biztosítja – módosításkor mindkettőt
 * frissíteni kell, majd: `npm run test:golden:update`.
 *
 * Eltérések az eredeti SM-2-től (SuperMemo, 1987) és indoklásuk:
 *  1. Tanulási lépcsők (LEARNING / RELEARNING): az új vagy elfelejtett kártya
 *     perc alapú lépcsőkön megy végig, mielőtt napos intervallumot kap. Az
 *     eredeti SM-2 rögtön 1 napot adna, ami a kezdeti rögzítésnél túl hosszú.
 *  2. A tanulási fázis nem módosítja az ease factort: a kezdeti hibák a
 *     memorizálás természetes részei, nem a kártya nehézségét jelzik.
 *  3. Reakcióidő: helyes, de lassú válasz (> slowResponseMs) minősége eggyel
 *     csökken (4→3, 5→4) – a lassú felidézés gyengébb emléknyomra utal.
 *  4. Késői ismétlés: ha a felhasználó az esedékesség után ismétel és mégis
 *     emlékszik, a többletidő fele beszámít (az emlék erősebb a vártnál).
 *     Korai ismétlés nem csökkenti az intervallumot.
 *  5. Felejtés (lapse) után az intervallum nem nullázódik, hanem
 *     lapseIntervalMultiplier-rel csökken – a korábbi tudás nem vész el teljesen.
 *  6. Felejtési görbe: R(t) = exp(-t / S). A stabilitást (S) úgy becsüljük,
 *     hogy a következő esedékességkor a felidézési valószínűség épp a célérték
 *     (targetRetention) legyen.
 */

/** Válaszminőség az SM-2 0–5 skáláján. 0–2: sikertelen, 3–5: sikeres felidézés. */
export type Grade = 0 | 1 | 2 | 3 | 4 | 5;

export type CardState = 'NEW' | 'LEARNING' | 'REVIEW' | 'RELEARNING';

export interface SchedulerConfig {
  /** Új kártya tanulási lépcsői percben. */
  learningStepsMinutes: readonly number[];
  /** Elfelejtett kártya újratanulási lépcsői percben (üres = nincs újratanulás). */
  relearningStepsMinutes: readonly number[];
  /** Intervallum a tanulási fázis normál befejezésekor (nap). */
  graduatingIntervalDays: number;
  /** Intervallum, ha a kártyát „könnyű” (5) válasszal lépteti ki a tanulásból (nap). */
  easyIntervalDays: number;
  /** Második sikeres ismétlés utáni minimális intervallum (SM-2: 6 nap). */
  secondIntervalDays: number;
  initialEaseFactor: number;
  minEaseFactor: number;
  maxEaseFactor: number;
  /** Felejtéskor az intervallum szorzója (0–1). */
  lapseIntervalMultiplier: number;
  maxIntervalDays: number;
  /** E fölötti reakcióidő esetén a helyes válasz minősége eggyel csökken. */
  slowResponseMs: number;
  /** Cél felidézési valószínűség az esedékesség pillanatában (0–1). */
  targetRetention: number;
  /** A reakcióidő exponenciális mozgóátlagának súlya (0–1). */
  responseTimeEmaAlpha: number;
}

export const DEFAULT_SCHEDULER_CONFIG: Readonly<SchedulerConfig> = Object.freeze({
  learningStepsMinutes: [1, 10],
  relearningStepsMinutes: [10],
  graduatingIntervalDays: 1,
  easyIntervalDays: 4,
  secondIntervalDays: 6,
  initialEaseFactor: 2.5,
  minEaseFactor: 1.3,
  maxEaseFactor: 5.0,
  lapseIntervalMultiplier: 0.5,
  maxIntervalDays: 36_500,
  slowResponseMs: 15_000,
  targetRetention: 0.9,
  responseTimeEmaAlpha: 0.3,
});

/**
 * Az SM-2 alapintervallumai erre a felidézési valószínűségre vannak kalibrálva
 * (a módosított SM-2 tipikus 85–90%-os megtartást ad).
 */
export const REFERENCE_RETENTION = 0.9;

/**
 * Intervallumszorzó a felhasználó által választott célmegtartáshoz.
 *
 * A felejtési görbe R(t) = exp(−t / S); adott S mellett a célértéket
 * t = S · (−ln R_cél) idő múlva éri el. A referencia-intervallumhoz képesti
 * arány tehát ln(R_cél) / ln(R_ref): 0.90 → 1 (változatlan), 0.95 → ≈ 0.49
 * (sűrűbb ismétlés), 0.80 → ≈ 2.12 (ritkább ismétlés). Mivel a stabilitás
 * becslése ugyanezzel a céllal számol, S nem függ a választott céltól.
 */
export function retentionIntervalFactor(targetRetention: number): number {
  if (!(targetRetention > 0 && targetRetention < 1)) {
    throw new RangeError(`Érvénytelen célmegtartás: ${targetRetention} (0 és 1 közötti szám várt)`);
  }
  return Math.log(targetRetention) / Math.log(REFERENCE_RETENTION);
}

/** Egy kártya ütemezési állapota (a `user_progress` releváns mezői). */
export interface CardSchedulingState {
  state: CardState;
  easeFactor: number;
  intervalDays: number;
  repetitions: number;
  learningStep: number;
  lapses: number;
  totalReviews: number;
  correctReviews: number;
  avgResponseMs: number | null;
  stabilityDays: number | null;
  lastReviewedAt: Date | null;
  nextReviewAt: Date | null;
}

export interface ReviewInput {
  grade: Grade;
  responseTimeMs: number;
  reviewedAt: Date;
}

export interface ScheduleResult {
  /** Az új állapot. */
  card: CardSchedulingState;
  /** A reakcióidővel korrigált minőség, amellyel az ütemező számolt. */
  effectiveGrade: Grade;
  /** Az előző ismétlés óta eltelt napok (első ismétlésnél null). */
  elapsedDays: number | null;
  /** Becsült felidézési valószínűség az értékelés pillanatában (ha becsülhető). */
  retrievabilityAtReview: number | null;
}

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;

/** Új kártya kiinduló állapota. */
export function initialCardState(config: SchedulerConfig = DEFAULT_SCHEDULER_CONFIG): CardSchedulingState {
  return {
    state: 'NEW',
    easeFactor: config.initialEaseFactor,
    intervalDays: 0,
    repetitions: 0,
    learningStep: 0,
    lapses: 0,
    totalReviews: 0,
    correctReviews: 0,
    avgResponseMs: null,
    stabilityDays: null,
    lastReviewedAt: null,
    nextReviewAt: null,
  };
}

export function isGrade(value: unknown): value is Grade {
  return Number.isInteger(value) && (value as number) >= 0 && (value as number) <= 5;
}

/**
 * Az SM-2 ease factor frissítése:
 *   EF' = EF + (0.1 − (5 − q) · (0.08 + (5 − q) · 0.02))
 * q = 5 → +0.10, q = 4 → ±0, q = 3 → −0.14, q = 0 → −0.80; [min, max] közé szorítva.
 */
export function updateEaseFactor(easeFactor: number, grade: Grade, config: SchedulerConfig = DEFAULT_SCHEDULER_CONFIG): number {
  const d = 5 - grade;
  const next = easeFactor + (0.1 - d * (0.08 + d * 0.02));
  return round2(clamp(next, config.minEaseFactor, config.maxEaseFactor));
}

/** Reakcióidő-korrekció: helyes, de lassú válasznál a minőség eggyel csökken (min. 3). */
export function effectiveGrade(grade: Grade, responseTimeMs: number, config: SchedulerConfig = DEFAULT_SCHEDULER_CONFIG): Grade {
  if (grade >= 4 && responseTimeMs > config.slowResponseMs) {
    return (grade - 1) as Grade;
  }
  return grade;
}

/** Felidézési valószínűség egy adott pillanatban: R = exp(−t / S). */
export function retrievabilityAt(card: Pick<CardSchedulingState, 'stabilityDays' | 'lastReviewedAt'>, at: Date): number | null {
  if (card.stabilityDays === null || card.stabilityDays <= 0 || card.lastReviewedAt === null) {
    return null;
  }
  const elapsedDays = Math.max(0, (at.getTime() - card.lastReviewedAt.getTime()) / DAY_MS);
  return Math.exp(-elapsedDays / card.stabilityDays);
}

/**
 * Egy értékelés feldolgozása: a kártya következő állapotának kiszámítása.
 * A bemenetet nem módosítja.
 */
export function scheduleReview(
  card: CardSchedulingState,
  review: ReviewInput,
  config: SchedulerConfig = DEFAULT_SCHEDULER_CONFIG,
): ScheduleResult {
  if (!isGrade(review.grade)) {
    throw new RangeError(`Érvénytelen minőség: ${String(review.grade)} (0–5 egész szám várt)`);
  }
  if (!Number.isFinite(review.responseTimeMs) || review.responseTimeMs < 0) {
    throw new RangeError(`Érvénytelen reakcióidő: ${review.responseTimeMs}`);
  }

  const now = review.reviewedAt;
  const grade = effectiveGrade(review.grade, review.responseTimeMs, config);
  const passed = grade >= 3;
  const elapsedDays = card.lastReviewedAt === null ? null : Math.max(0, (now.getTime() - card.lastReviewedAt.getTime()) / DAY_MS);

  // Statisztikai számlálók – a nyers (nem korrigált) minőség alapján: a helyes
  // válasz akkor is helyes, ha lassú volt.
  const next: CardSchedulingState = {
    ...card,
    totalReviews: card.totalReviews + 1,
    correctReviews: card.correctReviews + (review.grade >= 3 ? 1 : 0),
    avgResponseMs: ema(card.avgResponseMs, review.responseTimeMs, config.responseTimeEmaAlpha),
    lastReviewedAt: now,
  };

  switch (card.state) {
    case 'NEW':
    case 'LEARNING':
      applyLearning(next, card, grade, now, config);
      break;
    case 'REVIEW':
      applyReview(next, card, grade, passed, elapsedDays, now, config);
      break;
    case 'RELEARNING':
      applyRelearning(next, card, grade, passed, now, config);
      break;
  }

  // Stabilitás: S úgy, hogy R(következő esedékesség) = targetRetention.
  const untilNextDays = Math.max((next.nextReviewAt!.getTime() - now.getTime()) / DAY_MS, 1 / 1440);
  next.stabilityDays = round4(untilNextDays / -Math.log(config.targetRetention));

  return {
    card: next,
    effectiveGrade: grade,
    elapsedDays: elapsedDays === null ? null : round4(elapsedDays),
    retrievabilityAtReview: retrievabilityAt(card, now),
  };
}

// ---------------------------------------------------------------------------
// Állapotonkénti átmenetek (a `next` objektumot módosítják)
// ---------------------------------------------------------------------------

function applyLearning(next: CardSchedulingState, card: CardSchedulingState, grade: Grade, now: Date, config: SchedulerConfig): void {
  const steps = config.learningStepsMinutes;

  if (grade === 5 || steps.length === 0) {
    graduate(next, grade === 5 ? config.easyIntervalDays : config.graduatingIntervalDays, now);
    return;
  }
  if (grade < 3) {
    toStep(next, 'LEARNING', 0, steps, now);
    return;
  }
  const nextStep = card.state === 'NEW' ? 1 : card.learningStep + 1;
  if (nextStep >= steps.length) {
    graduate(next, config.graduatingIntervalDays, now);
  } else {
    toStep(next, 'LEARNING', nextStep, steps, now);
  }
}

function applyReview(
  next: CardSchedulingState,
  card: CardSchedulingState,
  grade: Grade,
  passed: boolean,
  elapsedDays: number | null,
  now: Date,
  config: SchedulerConfig,
): void {
  next.easeFactor = updateEaseFactor(card.easeFactor, grade, config);

  if (!passed) {
    // Felejtés (lapse).
    next.lapses = card.lapses + 1;
    next.repetitions = 0;
    next.intervalDays = clamp(Math.round(card.intervalDays * config.lapseIntervalMultiplier), 1, config.maxIntervalDays);
    if (config.relearningStepsMinutes.length > 0) {
      toStep(next, 'RELEARNING', 0, config.relearningStepsMinutes, now);
    } else {
      next.state = 'REVIEW';
      next.learningStep = 0;
      next.nextReviewAt = addDays(now, next.intervalDays);
    }
    return;
  }

  next.repetitions = card.repetitions + 1;
  const scheduled = card.intervalDays;
  const actual = elapsedDays ?? scheduled;
  const onTime = actual >= scheduled;
  const factor = retentionIntervalFactor(config.targetRetention);
  let candidate: number;
  if (onTime) {
    // Időben vagy késve: a késés fele beszámít; az intervallum szigorúan nő,
    // a második sikeres ismétlés után legalább secondIntervalDays.
    const base = scheduled + (actual - scheduled) / 2;
    const floor = next.repetitions <= 2 ? config.secondIntervalDays : scheduled + 1;
    candidate = Math.max(floor, scheduled + 1, Math.round(base * next.easeFactor * factor));
  } else {
    // Korai ismétlés: csak a ténylegesen eltelt idő számít; az intervallum nem
    // csökken, de a korai siker sem „ugrat” előre (nincs minimum-emelés).
    candidate = Math.max(scheduled, Math.round(actual * next.easeFactor * factor));
  }
  next.intervalDays = clamp(candidate, 1, config.maxIntervalDays);
  next.state = 'REVIEW';
  next.learningStep = 0;
  next.nextReviewAt = addDays(now, next.intervalDays);
}

function applyRelearning(
  next: CardSchedulingState,
  card: CardSchedulingState,
  grade: Grade,
  passed: boolean,
  now: Date,
  config: SchedulerConfig,
): void {
  const steps = config.relearningStepsMinutes;
  if (!passed && steps.length > 0) {
    toStep(next, 'RELEARNING', 0, steps, now);
    return;
  }
  const nextStep = card.learningStep + 1;
  if (grade === 5 || nextStep >= steps.length) {
    // Vissza az ismétlési fázisba a felejtéskor csökkentett intervallummal.
    graduate(next, Math.max(card.intervalDays, 1), now);
  } else {
    toStep(next, 'RELEARNING', nextStep, steps, now);
  }
}

function graduate(next: CardSchedulingState, intervalDays: number, now: Date): void {
  next.state = 'REVIEW';
  next.learningStep = 0;
  next.repetitions = 1;
  next.intervalDays = intervalDays;
  next.nextReviewAt = addDays(now, intervalDays);
}

function toStep(next: CardSchedulingState, state: 'LEARNING' | 'RELEARNING', step: number, steps: readonly number[], now: Date): void {
  next.state = state;
  next.learningStep = step;
  next.nextReviewAt = new Date(now.getTime() + steps[step]! * MINUTE_MS);
}

// ---------------------------------------------------------------------------
// Segédfüggvények
// ---------------------------------------------------------------------------

function ema(previous: number | null, sample: number, alpha: number): number {
  return Math.round(previous === null ? sample : alpha * sample + (1 - alpha) * previous);
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}
