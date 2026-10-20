import { FSRS45_DEFAULT_WEIGHTS, fsrsInitialState, fsrsNextState, fsrsRetrievability, ratingFromSm2Grade } from './fsrs';
import { auc, logLoss, Prediction, rmseBins } from './prediction-metrics';
import { evaluate, predictHistory, ReviewEvent } from './scheduler-evaluation';

const DAY = 86_400_000;
const T0 = new Date('2026-01-01T08:00:00Z').getTime();
const ev = (offsetMs: number, grade: number): ReviewEvent => ({ grade, responseTimeMs: 2000, reviewedAt: new Date(T0 + offsetMs) });

describe('FSRS-4.5 memóriamodell', () => {
  it('R(S, S) = 0.9, és t = 0-nál 1', () => {
    expect(fsrsRetrievability(7, 7)).toBeCloseTo(0.9, 10);
    expect(fsrsRetrievability(0, 3)).toBe(1);
  });

  it('kezdőállapot: S = w[G−1], a nehézség a [1, 10] tartományban', () => {
    expect(fsrsInitialState(3).stability).toBe(FSRS45_DEFAULT_WEIGHTS[2]);
    expect(fsrsInitialState(1).difficulty).toBeGreaterThan(fsrsInitialState(4).difficulty);
    for (const r of [1, 2, 3, 4] as const) {
      const d = fsrsInitialState(r).difficulty;
      expect(d).toBeGreaterThanOrEqual(1);
      expect(d).toBeLessThanOrEqual(10);
    }
  });

  it('sikeres felidézés növeli, felejtés csökkenti a stabilitást; „Easy” > „Good” > „Hard”', () => {
    const s = fsrsInitialState(3);
    const good = fsrsNextState(s, s.stability, 3);
    const easy = fsrsNextState(s, s.stability, 4);
    const hard = fsrsNextState(s, s.stability, 2);
    const again = fsrsNextState(s, s.stability, 1);
    expect(good.stability).toBeGreaterThan(s.stability);
    expect(easy.stability).toBeGreaterThan(good.stability);
    expect(good.stability).toBeGreaterThan(hard.stability);
    expect(again.stability).toBeLessThan(s.stability);
    expect(again.difficulty).toBeGreaterThan(s.difficulty);
  });

  it('SM-2 minőség → FSRS értékelés', () => {
    expect([0, 1, 2, 3, 4, 5].map(ratingFromSm2Grade)).toEqual([1, 1, 1, 2, 3, 4]);
  });
});

describe('előrejelzési mértékek', () => {
  it('log-veszteség: konstans 0.5 → ln 2; tökéletes → ~0', () => {
    expect(
      logLoss([
        { p: 0.5, y: 1 },
        { p: 0.5, y: 0 },
      ]),
    ).toBeCloseTo(Math.LN2, 10);
    expect(
      logLoss([
        { p: 1, y: 1 },
        { p: 0, y: 0 },
      ]),
    ).toBeLessThan(1e-5);
  });

  it('RMSE (sávos): jól kalibrált előrejelzésnél 0', () => {
    // 16 előrejelzés p = 0.75-tel, ebből 12 sikeres → tökéletes kalibráció.
    const preds: Prediction[] = Array.from({ length: 16 }, (_, i) => ({ p: 0.75, y: i < 12 ? 1 : 0 }));
    expect(rmseBins(preds)).toBeCloseTo(0, 10);
    expect(rmseBins([{ p: 0.9, y: 0 }])).toBeCloseTo(0.9, 10);
  });

  it('AUC: tökéletes rangsor 1, fordított 0, holtverseny 0.5', () => {
    expect(
      auc([
        { p: 0.2, y: 0 },
        { p: 0.8, y: 1 },
      ]),
    ).toBe(1);
    expect(
      auc([
        { p: 0.8, y: 0 },
        { p: 0.2, y: 1 },
      ]),
    ).toBe(0);
    expect(
      auc([
        { p: 0.5, y: 0 },
        { p: 0.5, y: 1 },
      ]),
    ).toBe(0.5);
    expect(auc([{ p: 0.5, y: 1 }])).toBeNaN();
  });
});

describe('SM-2 ↔ FSRS összevetés', () => {
  it('az azonos napi (tanulási lépcsős) ismétlések nem kerülnek a mintába', () => {
    // Új kártya: 0 perc, +1 perc, +10 perc (tanulási lépcsők), majd 1, 7 és 20 nap múlva.
    const events = [ev(0, 4), ev(60_000, 4), ev(11 * 60_000, 4), ev(DAY + 11 * 60_000, 4), ev(8 * DAY, 2), ev(20 * DAY, 4)];
    const { sm2, fsrs } = predictHistory(events);
    expect(sm2).toHaveLength(3);
    expect(fsrs).toHaveLength(3);
    expect(sm2.map((p) => p.y)).toEqual([1, 0, 1]);
    for (const p of [...sm2, ...fsrs]) {
      expect(p.p).toBeGreaterThan(0);
      expect(p.p).toBeLessThanOrEqual(1);
    }
  });

  it('a sorrendtől független (időrendbe rendez), és a teljes kiértékelés összesít', () => {
    const events = [ev(20 * DAY, 4), ev(0, 4), ev(DAY, 5), ev(5 * DAY, 3)];
    const histories = new Map([
      ['a', events],
      ['b', [ev(0, 3), ev(2 * DAY, 1), ev(3 * DAY, 4)]],
    ]);
    const result = evaluate(histories);
    expect(result).toMatchObject({ cards: 2, reviews: 7 });
    expect(result.samples).toBe(3 + 2);
    expect(result.scores.map((s) => s.n)).toEqual([5, 5, 5]);
    expect(result.recallRate).toBeCloseTo(4 / 5, 10);
  });
});
