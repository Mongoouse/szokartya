/**
 * Az SM-2 ütemező „golden” referenciafájljának előállítása.
 *
 * A fájl rögzített értékelési sorozatokat (abszolút időbélyegekkel) és az
 * ütemező minden lépés utáni teljes állapotát tartalmazza. A backend (Jest) és
 * a Flutter kliens (flutter_test) tesztjei UGYANEHHEZ a fájlhoz hasonlítanak,
 * így a két implementáció bármilyen eltérése mindkét oldalon hibát ad.
 *
 * Újragenerálás (csak szándékos algoritmusváltozás után, átnézve a diffet!):
 *   npm run test:golden:update
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CardSchedulingState, Grade, initialCardState, scheduleReview } from '../src/repetition/scheduler/sm2-scheduler';

type When = 'due' | 'now' | { lateDays: number } | { earlyFraction: number } | { afterMinutes: number };
interface StepSpec {
  grade: Grade;
  responseTimeMs: number;
  when?: When;
}

const DAY = 86_400_000;
const START = Date.UTC(2026, 0, 1, 8, 0, 0);

const repeat = (n: number, step: StepSpec): StepSpec[] => Array.from({ length: n }, () => step);

const CASES: { name: string; description: string; steps: StepSpec[] }[] = [
  {
    name: 'happy_path',
    description: 'Mindig „jó” (4), időben: 1 perc → 10 perc → 1 → 6 → 15 → 38 → 95 nap',
    steps: repeat(7, { grade: 4, responseTimeMs: 2000 }),
  },
  {
    name: 'lapse_and_relearn',
    description: 'Felejtés REVIEW állapotban, majd újratanulás és visszatérés',
    steps: [
      ...repeat(5, { grade: 4, responseTimeMs: 2000 }),
      { grade: 1, responseTimeMs: 5000 },
      { grade: 2, responseTimeMs: 4000 },
      { grade: 4, responseTimeMs: 2000 },
      { grade: 4, responseTimeMs: 2000 },
    ],
  },
  {
    name: 'slow_responses',
    description: 'Helyes, de lassú válaszok: a minőség eggyel csökken (5→4, 4→3), 3 alatt nem',
    steps: [
      { grade: 4, responseTimeMs: 2000 },
      { grade: 4, responseTimeMs: 2000 },
      { grade: 5, responseTimeMs: 20_000 },
      { grade: 4, responseTimeMs: 15_001 },
      { grade: 4, responseTimeMs: 15_000 },
      { grade: 3, responseTimeMs: 60_000 },
    ],
  },
  {
    name: 'late_reviews',
    description: 'Késve ismételt, de felidézett kártya: a késés fele beszámít',
    steps: [
      ...repeat(3, { grade: 4, responseTimeMs: 2000 }),
      { grade: 4, responseTimeMs: 2000, when: { lateDays: 10 } },
      { grade: 3, responseTimeMs: 3000, when: { lateDays: 40 } },
      { grade: 5, responseTimeMs: 1000, when: { lateDays: 0.5 } },
    ],
  },
  {
    name: 'early_reviews',
    description: 'Korai ismétlés: az intervallum nem nő a minimumra és nem is csökken',
    steps: [
      ...repeat(4, { grade: 4, responseTimeMs: 2000 }),
      { grade: 5, responseTimeMs: 1000, when: 'now' },
      { grade: 4, responseTimeMs: 2000, when: { earlyFraction: 0.5 } },
      { grade: 4, responseTimeMs: 2000, when: { earlyFraction: 0.1 } },
      { grade: 4, responseTimeMs: 2000 },
    ],
  },
  {
    name: 'easy_new_card',
    description: '„Könnyű” (5) új kártya: azonnal REVIEW 4 napra',
    steps: repeat(4, { grade: 5, responseTimeMs: 900 }),
  },
  {
    name: 'learning_failures',
    description: 'Tanulási fázisban ismételt hiba: vissza az első lépcsőre, EF nem változik',
    steps: [
      { grade: 0, responseTimeMs: 8000 },
      { grade: 1, responseTimeMs: 7000 },
      { grade: 3, responseTimeMs: 6000 },
      { grade: 2, responseTimeMs: 6000 },
      { grade: 3, responseTimeMs: 5000 },
      { grade: 4, responseTimeMs: 4000 },
      { grade: 3, responseTimeMs: 4000 },
    ],
  },
  {
    name: 'ease_floor',
    description: 'Sorozatos „nehéz” (3) és felejtés: az EF 1.30-nál megáll',
    steps: [
      ...repeat(3, { grade: 4, responseTimeMs: 2000 }),
      ...repeat(4, { grade: 3, responseTimeMs: 3000 }),
      { grade: 0, responseTimeMs: 9000 },
      { grade: 3, responseTimeMs: 3000 },
      ...repeat(4, { grade: 3, responseTimeMs: 3000 }),
    ],
  },
  {
    name: 'ease_ceiling_and_max_interval',
    description: 'Sorozatos „könnyű” (5): az EF 5.00-nál, az intervallum 36 500 napnál megáll',
    steps: repeat(30, { grade: 5, responseTimeMs: 800 }),
  },
  {
    name: 'relearning_easy_exit',
    description: 'Újratanulásból „könnyű” válasszal azonnali visszatérés',
    steps: [
      ...repeat(4, { grade: 4, responseTimeMs: 2000 }),
      { grade: 0, responseTimeMs: 9000 },
      { grade: 5, responseTimeMs: 1000 },
      { grade: 4, responseTimeMs: 2000 },
    ],
  },
  {
    name: 'out_of_schedule_minutes',
    description: 'Tanulási lépcső előtti / utáni értékelés (perc pontosság)',
    steps: [
      { grade: 3, responseTimeMs: 4000 },
      { grade: 3, responseTimeMs: 4000, when: { afterMinutes: 3 } },
      { grade: 4, responseTimeMs: 3000, when: { afterMinutes: 600 } },
      { grade: 4, responseTimeMs: 3000, when: { afterMinutes: 4000 } },
    ],
  },
];

function serialize(c: CardSchedulingState) {
  return {
    state: c.state,
    easeFactor: c.easeFactor,
    intervalDays: c.intervalDays,
    repetitions: c.repetitions,
    learningStep: c.learningStep,
    lapses: c.lapses,
    totalReviews: c.totalReviews,
    correctReviews: c.correctReviews,
    avgResponseMs: c.avgResponseMs,
    stabilityDays: c.stabilityDays,
    lastReviewedAt: c.lastReviewedAt?.toISOString() ?? null,
    nextReviewAt: c.nextReviewAt?.toISOString() ?? null,
  };
}

function resolveTime(when: When | undefined, previousAt: number, card: CardSchedulingState): number {
  const due = card.nextReviewAt?.getTime() ?? previousAt;
  if (when === undefined || when === 'due') return due;
  if (when === 'now') return previousAt;
  if ('lateDays' in when) return due + Math.round(when.lateDays * DAY);
  if ('earlyFraction' in when) return previousAt + Math.round(when.earlyFraction * (due - previousAt));
  return previousAt + when.afterMinutes * 60_000;
}

const output = {
  description:
    'SM-2 ütemező referenciaadatok. GENERÁLT fájl (backend/scripts/generate-sm2-golden.ts) – kézzel ne szerkeszd.',
  initial: serialize(initialCardState()),
  cases: CASES.map(({ name, description, steps }) => {
    let card = initialCardState();
    let at = START;
    return {
      name,
      description,
      steps: steps.map((s) => {
        at = resolveTime(s.when, at, card);
        const result = scheduleReview(card, { grade: s.grade, responseTimeMs: s.responseTimeMs, reviewedAt: new Date(at) });
        card = result.card;
        return {
          input: { grade: s.grade, responseTimeMs: s.responseTimeMs, reviewedAt: new Date(at).toISOString() },
          expected: {
            card: serialize(result.card),
            effectiveGrade: result.effectiveGrade,
            elapsedDays: result.elapsedDays,
            retrievabilityAtReview: result.retrievabilityAtReview === null ? null : Math.round(result.retrievabilityAtReview * 1e6) / 1e6,
          },
        };
      }),
    };
  }),
};

const target = join(__dirname, '..', '..', 'shared', 'fixtures', 'sm2-golden.json');
writeFileSync(target, `${JSON.stringify(output, null, 2)}\n`);
console.log(`Golden fájl írva: ${target} (${CASES.length} eset)`);
