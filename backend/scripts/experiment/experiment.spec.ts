import { brierScore, expectedCalibrationError, Prediction, reliabilityCurve, wilsonInterval } from '../prediction-metrics';
import { compileHistory } from '../scheduler-evaluation';
import { fitPowerCalibration, runExperiment, TESTED_METRICS } from './experiment';
import { forestFigure, pairedScatterFigure, reliabilityFigure } from './figures';
import { MEMORY_MODELS, simulateLearner, simulateLearners } from './learner-simulation';
import { mulberry32 } from './random';

const outcome = (recalled: boolean): 0 | 1 => (recalled ? 1 : 0);

describe('kalibrációs mérőszámok', () => {
  it('Brier-pontszám és ECE: tökéletesen kalibrált sávoknál az ECE 0', () => {
    const preds: Prediction[] = [
      ...Array.from({ length: 10 }, (_, i) => ({ p: 0.75, y: outcome(i < 8) })), // 8 / 10
      ...Array.from({ length: 4 }, (_, i) => ({ p: 0.25, y: outcome(i === 0) })), // 1 / 4
    ];
    expect(
      brierScore([
        { p: 1, y: 1 },
        { p: 0, y: 1 },
      ]),
    ).toBe(0.5);
    const curve = reliabilityCurve(preds, 10);
    expect(curve.map((b) => b.n)).toEqual([4, 10]);
    expect(curve[1]!.observedRate).toBeCloseTo(0.8, 12);
    // |0.25 − 0.25| · 4 + |0.75 − 0.8| · 10, osztva 14-gyel
    expect(expectedCalibrationError(preds, 10)).toBeCloseTo(0.5 / 14, 12);
  });

  it('Wilson-intervallum (R: binom::binom.wilson(8, 10) → 0,490–0,943)', () => {
    const [lo, hi] = wilsonInterval(8, 10);
    expect(lo).toBeCloseTo(0.4902, 3);
    expect(hi).toBeCloseTo(0.9433, 3);
  });

  it('a hatványkalibráció visszakapja a torzítás kitevőjét', () => {
    // Valódi valószínűség q, a modell p = q^(1/2)-t mond (túlbecsül) → a jó kitevő k = 2.
    const random = mulberry32(5);
    const preds = Array.from({ length: 20_000 }, () => {
      const q = 0.5 + 0.5 * random();
      return { p: Math.sqrt(q), y: outcome(random() < q) };
    });
    expect(fitPowerCalibration(preds)).toBeCloseTo(2, 1);
  });
});

describe('szimulált tanulók', () => {
  it.each(MEMORY_MODELS)('%s: determinisztikus, és reális felidézési arányt ad', (memoryModel) => {
    const opts = { memoryModel, learners: 4, days: 60, seed: 9 };
    expect([...simulateLearner(0, opts).cards.values()]).toEqual([...simulateLearner(0, opts).cards.values()]);

    // Tanulónként eltér (képesség), ezért négy tanuló együttes arányát nézzük.
    const steps = simulateLearners(opts).flatMap((l) =>
      [...l.cards.values()].flatMap((events) => compileHistory(events).filter((s) => s.scored)),
    );
    expect(steps.length).toBeGreaterThan(800);
    const recall = steps.reduce((n, s) => n + s.y, 0) / steps.length;
    expect(recall).toBeGreaterThan(0.6);
    expect(recall).toBeLessThan(0.95);
    // A valódi valószínűség minden mintánál ismert (orákulum).
    expect(steps.every((s) => s.trueP !== undefined && s.trueP >= 0 && s.trueP <= 1)).toBe(true);
  });

  it('az ismétlések az alkalmazás (SM-2) szerint, időrendben és csak munkamenetben történnek', () => {
    const learner = simulateLearner(0, { memoryModel: 'actr', learners: 1, days: 60, seed: 1 });
    for (const events of learner.cards.values()) {
      for (let i = 1; i < events.length; i++) expect(events[i]!.reviewedAt.getTime()).toBeGreaterThan(events[i - 1]!.reviewedAt.getTime());
      for (const e of events) expect(Number.isInteger(e.grade) && e.grade >= 0 && e.grade <= 5).toBe(true);
    }
  });
});

describe('kísérlet', () => {
  // Kicsi, gyors konfiguráció: a módszer működését ellenőrzi, nem az eredményt.
  const learners = simulateLearners({ memoryModel: 'fsrs', learners: 6, days: 90, seed: 3 });
  const users = new Map(learners.map((l) => [l.userId, l.cards]));
  const result = runExperiment(users, { bootstrapResamples: 100, fit: { iterations: 15 }, seed: 1 });

  it('minden modell ugyanazon a teszthalmazon mér, és a modellek mintái párosak', () => {
    expect(result.users).toBe(6);
    expect(result.models).toEqual(['sm2', 'sm2Calibrated', 'fsrsDefault', 'fsrsPersonal', 'baseline', 'oracle']);
    for (const p of result.pooled) expect(p.n).toBe(result.testSamples);
    for (const u of result.perUser) expect(u.trainSamples).toBeGreaterThan(u.testSamples);
  });

  it('az orákulum (a valódi valószínűség) jobb log-veszteségű, mint az illesztés nélküli modellek', () => {
    // A személyre illesztett modellek véges teszthalmazon véletlenül megelőzhetik, ezért azokat nem vetjük össze.
    const ll = Object.fromEntries(result.pooled.map((p) => [p.model, p.metrics.logLoss]));
    for (const m of ['sm2', 'fsrsDefault', 'baseline']) expect(ll.oracle).toBeLessThan(ll[m]!);
  });

  it('a kalibrálás a felhasználónkénti AUC-t nem változtatja (monoton transzformáció)', () => {
    for (const u of result.perUser) expect(u.metrics.sm2Calibrated!.auc).toBeCloseTo(u.metrics.sm2!.auc, 12);
  });

  it('összehasonlításonként és mérőszámonként van próba, a Holm-korrekció nem csökkenti a p-értéket', () => {
    expect(result.comparisons).toHaveLength(5 * 3);
    for (const c of result.comparisons) {
      expect(c.users).toBeGreaterThan(0);
      expect(c.pHolm).toBeGreaterThanOrEqual(c.wilcoxon.pValue);
      expect(c.meanDifference.low).toBeLessThanOrEqual(c.meanDifference.high);
    }
  });

  it('ugyanazzal a maggal bájtra azonos eredményt ad', () => {
    const again = runExperiment(users, { bootstrapResamples: 100, fit: { iterations: 15 }, seed: 1 });
    expect(JSON.stringify(again)).toBe(JSON.stringify(result));
  });

  it('az ábrák jól formált SVG-k (a szöveges tartalom escape-elve)', () => {
    const tinyP = { ...result, comparisons: result.comparisons.map((c) => ({ ...c, pHolm: 1e-9 })) };
    const figures = [
      forestFigure(tinyP, 'logLoss', 'Különbségek', 'teszt'),
      reliabilityFigure(result, 'Kalibráció', 'teszt'),
      pairedScatterFigure(result, 'Felhasználók', 'teszt'),
      ...TESTED_METRICS.map((m) => forestFigure(result, m, 'Különbségek', 'teszt')),
    ];
    for (const svg of figures) {
      expect(svg.startsWith('<svg ')).toBe(true);
      expect(svg.trimEnd().endsWith('</svg>')).toBe(true);
      // Nyers „<” csak tag elején állhat (pl. a „< 0,001” p-érték escape-elve kerül be).
      expect(svg).not.toMatch(/<(?![a-z/])/);
      expect(svg).not.toMatch(/NaN|undefined/);
    }
  });

  it('a kevés teszt mintájú felhasználók kimaradnak', () => {
    const r = runExperiment(users, { bootstrapResamples: 10, fit: { iterations: 1 }, minTestSamples: 100_000 });
    expect(r.users).toBe(0);
    expect(r.excludedUsers).toBe(6);
    expect(r.comparisons).toHaveLength(0);
  });
});
