import { FSRS45_DEFAULT_WEIGHTS, FsrsMemoryState, fsrsInitialState, fsrsNextState, fsrsRetrievability, FsrsRating } from './fsrs';
import { FSRS45_WEIGHT_BOUNDS, fitFsrsWeights } from './fsrs-optimizer';
import { compileHistory, evaluatePersonalized, ReviewEvent } from './scheduler-evaluation';

const DAY = 86_400_000;
const T0 = new Date('2026-01-01T08:00:00Z').getTime();
const GRADE: Record<FsrsRating, number> = { 1: 1, 2: 3, 3: 4, 4: 5 };

/** Determinisztikus álvéletlen (mulberry32) – a tesztek reprodukálhatók. */
function rng(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Szimulált tanuló, akinek a felejtését egy ISMERT súlyú FSRS modell írja le.
 * Kártyánként: tanulás (két azonos napi értékelés), majd ismétlések, amikor a
 * valódi felidézési valószínűség ~85%-ra esik (szórással); a kimenet ebből sorsolva.
 */
function simulateLearner(trueWeights: readonly number[], cards: number, seed: number): Map<string, ReviewEvent[]> {
  const random = rng(seed);
  const histories = new Map<string, ReviewEvent[]>();
  for (let c = 0; c < cards; c++) {
    let day = Math.floor(random() * 30);
    const events: ReviewEvent[] = [
      { grade: 4, responseTimeMs: 2000, reviewedAt: new Date(T0 + day * DAY) },
      { grade: 4, responseTimeMs: 2000, reviewedAt: new Date(T0 + day * DAY + 10 * 60_000) },
    ];
    let state: FsrsMemoryState = fsrsInitialState(3, trueWeights);
    for (let i = 0; i < 8; i++) {
      const ideal = state.stability * (81 / 19) * (0.85 ** -2 - 1);
      const gap = Math.max(1, Math.round(ideal * (0.6 + random())));
      day += gap;
      const recalled = random() < fsrsRetrievability(gap, state.stability);
      const u = random();
      const rating: FsrsRating = !recalled ? 1 : u < 0.15 ? 2 : u < 0.85 ? 3 : 4;
      events.push({ grade: GRADE[rating], responseTimeMs: 2000, reviewedAt: new Date(T0 + day * DAY) });
      state = fsrsNextState(state, gap, rating, trueWeights);
    }
    histories.set(`card-${c}`, events);
  }
  return histories;
}

/** Az átlagosnál sokkal gyorsabban felejtő tanuló. */
const FORGETFUL = FSRS45_DEFAULT_WEIGHTS.map((w, i) => (i <= 3 ? w * 0.35 : i === 8 ? 0.9 : w));

describe('FSRS súlyok személyre illesztése', () => {
  it('a tanító log-veszteség csökken, a súlyok a megengedett tartományban maradnak', () => {
    const histories = [...simulateLearner(FORGETFUL, 120, 1).values()].map((e) => compileHistory(e));
    const fit = fitFsrsWeights(histories, { iterations: 30 });
    expect(fit.trainSamples).toBeGreaterThan(500);
    expect(fit.finalLoss).toBeLessThan(fit.initialLoss - 0.01);
    fit.weights.forEach((w, i) => {
      const [lo, hi] = FSRS45_WEIGHT_BOUNDS[i]!;
      expect(w).toBeGreaterThanOrEqual(lo);
      expect(w).toBeLessThanOrEqual(hi);
    });
    // A gyorsabb felejtést a kezdeti stabilitás csökkentésével tanulja meg.
    expect(fit.weights[2]!).toBeLessThan(FSRS45_DEFAULT_WEIGHTS[2]!);
  });

  it('a kihagyott, időben későbbi adaton is jobban jósol, mint az alapsúlyok', () => {
    // Kisebb teszthalmaznál a véletlen zaj elnyomná a különbséget (a valódi
    // súlyok vesztesége is csak az alsó korlát): ~600 teszt mintával mérünk.
    const users = new Map([['forgetful', simulateLearner(FORGETFUL, 400, 2)]]);
    const result = evaluatePersonalized(users, { fit: { iterations: 25 } });
    expect(result.personalizedUsers).toBe(1);
    expect(result.testSamples).toBeGreaterThan(500);
    const [, fsrsDefault, personal] = result.scores;
    expect(personal!.logLoss).toBeLessThan(fsrsDefault!.logLoss);
    // Az alapsúlyok túlbecsülik a felidézést, a személyre illesztett modell kevésbé.
    expect(Math.abs(personal!.meanPrediction - result.testRecallRate)).toBeLessThan(
      Math.abs(fsrsDefault!.meanPrediction - result.testRecallRate),
    );
  });

  it('nincs adatszivárgás: a tanítási határ utáni kimenetek nem befolyásolják a súlyokat', () => {
    const cards = simulateLearner(FORGETFUL, 60, 3);
    const trainBefore = new Date(T0 + 60 * DAY);
    const flipped = [...cards.values()].map((events) =>
      events.map((e) => (e.reviewedAt >= trainBefore ? { ...e, grade: e.grade >= 3 ? 1 : 5 } : e)),
    );
    const a = fitFsrsWeights(
      [...cards.values()].map((e) => compileHistory(e)),
      { iterations: 15, trainBefore },
    );
    const b = fitFsrsWeights(
      flipped.map((e) => compileHistory(e)),
      { iterations: 15, trainBefore },
    );
    expect(a.trainSamples).toBeGreaterThan(50);
    expect(b.weights).toEqual(a.weights);
  });

  it('kevés adatnál nem illeszt: az alapsúlyok maradnak', () => {
    const users = new Map([['new-user', simulateLearner(FORGETFUL, 3, 4)]]);
    const result = evaluatePersonalized(users);
    expect(result.personalizedUsers).toBe(0);
    expect(result.fits[0]!.weights).toBeNull();
    expect(result.scores[2]!.logLoss).toBeCloseTo(result.scores[1]!.logLoss, 12);
  });
});
