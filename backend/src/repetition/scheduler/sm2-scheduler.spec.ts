import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  CardSchedulingState,
  DEFAULT_SCHEDULER_CONFIG,
  effectiveGrade,
  Grade,
  initialCardState,
  retrievabilityAt,
  scheduleReview,
  SchedulerConfig,
  updateEaseFactor,
} from './sm2-scheduler';

const MIN = 60_000;
const DAY = 86_400_000;
const T0 = new Date('2026-01-01T08:00:00.000Z');

const at = (ms: number) => new Date(T0.getTime() + ms);

/** Kártya adott állapotban (a tesztek olvashatóságáért). */
function card(overrides: Partial<CardSchedulingState> = {}): CardSchedulingState {
  return { ...initialCardState(), ...overrides };
}

function reviewCard(intervalDays: number, overrides: Partial<CardSchedulingState> = {}): CardSchedulingState {
  return card({
    state: 'REVIEW',
    intervalDays,
    repetitions: 3,
    totalReviews: 5,
    correctReviews: 5,
    lastReviewedAt: T0,
    nextReviewAt: at(intervalDays * DAY),
    stabilityDays: 10,
    ...overrides,
  });
}

function review(c: CardSchedulingState, grade: Grade, when: Date, responseTimeMs = 2000, config?: SchedulerConfig) {
  return scheduleReview(c, { grade, responseTimeMs, reviewedAt: when }, config);
}

describe('SM-2 ütemező', () => {
  describe('updateEaseFactor', () => {
    it.each([
      [5, 2.6],
      [4, 2.5],
      [3, 2.36],
      [2, 2.18],
      [1, 1.96],
      [0, 1.7],
    ] as [Grade, number][])('q = %i → EF 2.5-ről %d-re változik (SM-2 képlet)', (grade, expected) => {
      expect(updateEaseFactor(2.5, grade)).toBeCloseTo(expected, 10);
    });

    it('alsó korlát: 1.30 alá nem csökken', () => {
      expect(updateEaseFactor(1.3, 0)).toBe(1.3);
      expect(updateEaseFactor(1.35, 3)).toBe(1.3);
    });

    it('felső korlát: 5.00 fölé nem nő', () => {
      expect(updateEaseFactor(5.0, 5)).toBe(5.0);
      expect(updateEaseFactor(4.95, 5)).toBe(5.0);
    });

    it('két tizedesjegyre kerekít (lebegőpontos sodródás ellen)', () => {
      let ef = 2.5;
      for (let i = 0; i < 50; i++) ef = updateEaseFactor(ef, i % 2 === 0 ? 3 : 5);
      expect(Math.round(ef * 100) / 100).toBe(ef);
    });
  });

  describe('effectiveGrade (reakcióidő)', () => {
    it('lassú helyes válasz minősége eggyel csökken', () => {
      expect(effectiveGrade(5, 15_001)).toBe(4);
      expect(effectiveGrade(4, 20_000)).toBe(3);
    });

    it('a küszöbön (pontosan 15 s) még nem csökken', () => {
      expect(effectiveGrade(4, 15_000)).toBe(4);
    });

    it('3-as és sikertelen válasz nem csökken tovább (nem válik hibává)', () => {
      expect(effectiveGrade(3, 60_000)).toBe(3);
      expect(effectiveGrade(1, 60_000)).toBe(1);
    });
  });

  describe('bemenet-ellenőrzés', () => {
    it.each([-1, 6, 2.5, Number.NaN])('érvénytelen minőség (%p) → RangeError', (grade) => {
      expect(() => review(card(), grade as Grade, T0)).toThrow(RangeError);
    });

    it.each([-1, Number.POSITIVE_INFINITY, Number.NaN])('érvénytelen reakcióidő (%p) → RangeError', (rt) => {
      expect(() => review(card(), 4, T0, rt)).toThrow(RangeError);
    });

    it('a bemeneti állapotot nem módosítja', () => {
      const original = reviewCard(10);
      const snapshot = structuredClone(original);
      review(original, 1, at(10 * DAY));
      expect(original).toEqual(snapshot);
    });
  });

  describe('tanulási fázis (NEW / LEARNING)', () => {
    it('új kártya, jó válasz → LEARNING, 2. lépcső (10 perc)', () => {
      const { card: next } = review(card(), 4, T0);
      expect(next.state).toBe('LEARNING');
      expect(next.learningStep).toBe(1);
      expect(next.nextReviewAt).toEqual(at(10 * MIN));
      expect(next.intervalDays).toBe(0);
    });

    it('hiba → vissza az 1. lépcsőre (1 perc)', () => {
      const { card: next } = review(card({ state: 'LEARNING', learningStep: 1 }), 2, T0);
      expect(next.learningStep).toBe(0);
      expect(next.nextReviewAt).toEqual(at(1 * MIN));
    });

    it('utolsó lépcső után REVIEW, 1 napos intervallummal', () => {
      const { card: next } = review(card({ state: 'LEARNING', learningStep: 1 }), 3, T0);
      expect(next).toMatchObject({ state: 'REVIEW', intervalDays: 1, repetitions: 1, learningStep: 0 });
      expect(next.nextReviewAt).toEqual(at(DAY));
    });

    it('„könnyű” (5) válasz → azonnal REVIEW 4 napra', () => {
      const { card: next } = review(card(), 5, T0);
      expect(next).toMatchObject({ state: 'REVIEW', intervalDays: 4, repetitions: 1 });
    });

    it('a tanulási fázis nem változtatja az ease factort', () => {
      let c = card();
      for (const g of [0, 1, 3, 2, 4] as Grade[]) c = review(c, g, T0).card;
      expect(c.easeFactor).toBe(2.5);
    });

    it('lépcsők nélküli konfiguráció: első helyes válasz azonnal REVIEW', () => {
      const config = { ...DEFAULT_SCHEDULER_CONFIG, learningStepsMinutes: [] };
      expect(review(card(), 3, T0, 2000, config).card).toMatchObject({ state: 'REVIEW', intervalDays: 1 });
    });
  });

  describe('ismétlési fázis (REVIEW)', () => {
    it('második sikeres ismétlés után legalább 6 nap', () => {
      const c = reviewCard(1, { repetitions: 1, nextReviewAt: at(DAY) });
      expect(review(c, 4, at(DAY)).card.intervalDays).toBe(6);
    });

    it('időben: I′ = round(I · EF′)', () => {
      const c = reviewCard(10);
      expect(review(c, 4, at(10 * DAY)).card.intervalDays).toBe(25); // 10 · 2.5
      expect(review(c, 5, at(10 * DAY)).card.intervalDays).toBe(26); // 10 · 2.6
      expect(review(c, 3, at(10 * DAY)).card.intervalDays).toBe(24); // 10 · 2.36 = 23.6
    });

    it('sikeres időbeni ismétlés után az intervallum szigorúan nő (EF = 1.3 mellett is)', () => {
      const c = reviewCard(3, { easeFactor: 1.3 });
      expect(review(c, 3, at(3 * DAY)).card.intervalDays).toBeGreaterThan(3);
    });

    it('késés: a többletidő fele beszámít', () => {
      const c = reviewCard(10);
      // base = 10 + (30 − 10) / 2 = 20 → 20 · 2.5 = 50
      expect(review(c, 4, at(30 * DAY)).card.intervalDays).toBe(50);
    });

    it('korai ismétlés: az intervallum nem csökken és nem ugrik a minimumra', () => {
      const c = reviewCard(20);
      const early = review(c, 5, at(DAY)).card;
      expect(early.intervalDays).toBe(20);
      expect(review(reviewCard(1, { repetitions: 1 }), 5, at(MIN)).card.intervalDays).toBe(1);
    });

    it('a maximális intervallumnál megáll', () => {
      const c = reviewCard(30_000, { easeFactor: 3 });
      expect(review(c, 5, at(30_000 * DAY)).card.intervalDays).toBe(DEFAULT_SCHEDULER_CONFIG.maxIntervalDays);
    });

    it('a következő esedékesség = értékelés + intervallum', () => {
      const when = at(10 * DAY + 5 * MIN);
      const { card: next } = review(reviewCard(10), 4, when);
      expect(next.nextReviewAt!.getTime()).toBe(when.getTime() + next.intervalDays * DAY);
    });
  });

  describe('felejtés és újratanulás', () => {
    it('hiba REVIEW-ban: lapses + 1, ismétlésszám 0, intervallum fele, RELEARNING 10 percre', () => {
      const { card: next } = review(reviewCard(40, { lapses: 2 }), 1, at(40 * DAY));
      expect(next).toMatchObject({ state: 'RELEARNING', lapses: 3, repetitions: 0, intervalDays: 20, learningStep: 0 });
      expect(next.nextReviewAt).toEqual(at(40 * DAY + 10 * MIN));
      expect(next.easeFactor).toBe(1.96);
    });

    it('felejtés után az intervallum legalább 1 nap', () => {
      expect(review(reviewCard(1), 0, at(DAY)).card.intervalDays).toBe(1);
    });

    it('újratanulás sikere → REVIEW a csökkentett intervallummal', () => {
      const c = card({ state: 'RELEARNING', intervalDays: 20, lapses: 1, lastReviewedAt: T0, nextReviewAt: at(10 * MIN) });
      expect(review(c, 4, at(10 * MIN)).card).toMatchObject({ state: 'REVIEW', intervalDays: 20, repetitions: 1 });
    });

    it('újratanulás közbeni hiba nem növeli újra a lapses-t', () => {
      const c = card({ state: 'RELEARNING', intervalDays: 20, lapses: 1, lastReviewedAt: T0, nextReviewAt: at(10 * MIN) });
      expect(review(c, 1, at(10 * MIN)).card).toMatchObject({ state: 'RELEARNING', lapses: 1, learningStep: 0 });
    });

    it('újratanulási lépcsők nélkül a kártya REVIEW-ban marad a csökkentett intervallummal', () => {
      const config = { ...DEFAULT_SCHEDULER_CONFIG, relearningStepsMinutes: [] };
      const { card: next } = review(reviewCard(40), 1, at(40 * DAY), 2000, config);
      expect(next).toMatchObject({ state: 'REVIEW', intervalDays: 20, lapses: 1 });
      expect(next.nextReviewAt).toEqual(at(60 * DAY));
    });
  });

  describe('statisztikai metrikák', () => {
    it('számlálók: összes és helyes (a nyers minőség alapján, lassú válasz is helyes)', () => {
      let c = card();
      c = review(c, 4, T0, 30_000).card;
      c = review(c, 1, T0).card;
      expect(c).toMatchObject({ totalReviews: 2, correctReviews: 1 });
    });

    it('reakcióidő: exponenciális mozgóátlag (α = 0.3)', () => {
      let c = review(card(), 4, T0, 1000).card;
      expect(c.avgResponseMs).toBe(1000);
      c = review(c, 4, T0, 2000).card;
      expect(c.avgResponseMs).toBe(1300);
    });

    it('stabilitás: esedékességkor a becsült felidézési valószínűség = 90%', () => {
      const { card: next } = review(reviewCard(10), 4, at(10 * DAY));
      const r = retrievabilityAt(next, next.nextReviewAt!);
      expect(r).toBeCloseTo(0.9, 3);
    });

    it('retrievability: az értékelés pillanatában az előző stabilitásból számol', () => {
      const c = reviewCard(10, { stabilityDays: 10 });
      const result = review(c, 4, at(10 * DAY));
      expect(result.retrievabilityAtReview).toBeCloseTo(Math.exp(-1), 10);
      expect(result.elapsedDays).toBe(10);
    });

    it('retrievability: nem becsülhető, ha nincs előzmény', () => {
      expect(retrievabilityAt(card(), T0)).toBeNull();
      expect(review(card(), 4, T0).retrievabilityAtReview).toBeNull();
    });
  });

  describe('golden referencia (közös a Dart implementációval)', () => {
    interface GoldenStep {
      input: { grade: Grade; responseTimeMs: number; reviewedAt: string };
      expected: {
        card: Record<string, unknown>;
        effectiveGrade: number;
        elapsedDays: number | null;
        retrievabilityAtReview: number | null;
      };
    }
    const golden = JSON.parse(
      readFileSync(join(__dirname, '../../../../shared/fixtures/sm2-golden.json'), 'utf8'),
    ) as { cases: { name: string; steps: GoldenStep[] }[] };

    it.each(golden.cases.map((c) => [c.name, c.steps] as const))('%s', (_name, steps) => {
      let c = initialCardState();
      steps.forEach((step, i) => {
        const result = scheduleReview(c, { ...step.input, reviewedAt: new Date(step.input.reviewedAt) });
        c = result.card;
        const actual = {
          card: {
            ...c,
            lastReviewedAt: c.lastReviewedAt?.toISOString() ?? null,
            nextReviewAt: c.nextReviewAt?.toISOString() ?? null,
          },
          effectiveGrade: result.effectiveGrade,
          elapsedDays: result.elapsedDays,
          retrievabilityAtReview:
            result.retrievabilityAtReview === null ? null : Math.round(result.retrievabilityAtReview * 1e6) / 1e6,
        };
        expect({ step: i, ...actual }).toEqual({ step: i, ...step.expected });
      });
    });
  });
});
