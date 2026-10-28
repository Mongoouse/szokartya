/**
 * Az ütemezők összevető kísérlete: felhasználónkénti időbeli tanító / teszt
 * felosztás, öt (szimulációban hat) előrejelző modell, mérőszámok
 * felhasználónként és összesítve, páros statisztikai próbák.
 *
 * Kutatási kérdés: a felhasználó saját naplójára illesztett FSRS pontosabban
 * jósolja-e a felidézést, mint a rendszer jelenlegi SM-2 ütemezőjének
 * felejtési modellje? Elsődleges végpont: a felhasználónkénti log-veszteség
 * különbsége (FSRS személyre illesztve − SM-2), kétoldali Wilcoxon-próba.
 */
import { SchedulerConfig } from '../../src/repetition/scheduler/sm2-scheduler';
import {
  auc,
  brierScore,
  expectedCalibrationError,
  logLoss,
  Prediction,
  ReliabilityBin,
  reliabilityCurve,
  rmseBins,
} from '../prediction-metrics';
import { PersonalizationOptions, predictUserTestSet, ReviewEvent } from '../scheduler-evaluation';
import { bootstrapInterval, BootstrapInterval, holmAdjust, mean, median, wilcoxonSignedRank, WilcoxonResult } from './statistics';

export type ModelKey = 'sm2' | 'sm2Calibrated' | 'fsrsDefault' | 'fsrsPersonal' | 'baseline' | 'oracle';

export const MODEL_LABELS: Record<ModelKey, string> = {
  sm2: 'SM-2',
  sm2Calibrated: 'SM-2 (utólag kalibrálva)',
  fsrsDefault: 'FSRS-4.5 (alapsúlyok)',
  fsrsPersonal: 'FSRS-4.5 (személyre illesztve)',
  baseline: 'Átlag-alapvonal',
  oracle: 'Orákulum (valódi p)',
};

export type MetricKey = 'logLoss' | 'rmseBins' | 'auc' | 'ece' | 'brier';

export const METRICS: readonly { key: MetricKey; label: string; higherIsBetter: boolean }[] = [
  { key: 'logLoss', label: 'log-veszteség', higherIsBetter: false },
  { key: 'rmseBins', label: 'RMSE (sávos)', higherIsBetter: false },
  { key: 'auc', label: 'AUC', higherIsBetter: true },
  { key: 'ece', label: 'ECE', higherIsBetter: false },
  { key: 'brier', label: 'Brier', higherIsBetter: false },
];

/** A páros összehasonlítások: [a, b] → az a − b különbséget vizsgáljuk. Az első az elsődleges. */
export const COMPARISONS: readonly (readonly [ModelKey, ModelKey])[] = [
  ['fsrsPersonal', 'sm2'],
  ['fsrsDefault', 'sm2'],
  ['fsrsPersonal', 'fsrsDefault'],
  ['fsrsPersonal', 'sm2Calibrated'],
  ['fsrsPersonal', 'baseline'],
];

/** A statisztikai próbák mérőszámai (a Holm-korrekció mérőszámonként, az összehasonlításokra fut). */
export const TESTED_METRICS: readonly MetricKey[] = ['logLoss', 'rmseBins', 'auc'];

export type MetricValues = Record<MetricKey, number>;

export interface ExperimentOptions extends PersonalizationOptions {
  /** Ennél kevesebb teszt mintájú felhasználó kimarad (a felhasználónkénti mérőszám túl zajos lenne). */
  minTestSamples?: number;
  bootstrapResamples?: number;
  seed?: number;
  /** A kalibrációs görbe sávjainak száma. */
  calibrationBins?: number;
}

export interface UserResult {
  userId: string;
  trainSamples: number;
  testSamples: number;
  testRecallRate: number;
  personalized: boolean;
  /** Az SM-2 kalibrációs kitevője (p_kal = p^k; 1 = változatlan). */
  sm2CalibrationExponent: number;
  metrics: Partial<Record<ModelKey, MetricValues>>;
}

export interface PooledModelResult {
  model: ModelKey;
  label: string;
  n: number;
  meanPrediction: number;
  metrics: MetricValues;
  reliability: ReliabilityBin[];
}

export interface ComparisonResult {
  a: ModelKey;
  b: ModelKey;
  metric: MetricKey;
  /** Azon felhasználók száma, akiknél mindkét érték véges. */
  users: number;
  /** A felhasználónkénti a − b különbségek átlaga, bootstrap CI-vel (a felhasználók újramintavételezésével). */
  meanDifference: BootstrapInterval;
  medianDifference: number;
  /** Az összesített (pooled) mérőszámok különbsége, klaszter-bootstrap CI-vel. */
  pooledDifference: BootstrapInterval;
  /** Hány felhasználónál jobb az „a” modell (az adott mérőszám iránya szerint). */
  aBetterShare: number;
  wilcoxon: WilcoxonResult;
  /** Holm–Bonferroni szerint korrigált p-érték (mérőszámonként az összehasonlítások családján). */
  pHolm: number;
}

export interface ExperimentResult {
  users: number;
  excludedUsers: number;
  personalizedUsers: number;
  trainSamples: number;
  testSamples: number;
  testRecallRate: number;
  models: ModelKey[];
  pooled: PooledModelResult[];
  perUser: UserResult[];
  comparisons: ComparisonResult[];
  options: Required<Omit<ExperimentOptions, 'fit'>> & { fit: ExperimentOptions['fit'] };
}

interface UserPredictions {
  result: UserResult;
  preds: Partial<Record<ModelKey, Prediction[]>>;
}

const METRIC_FUNCTIONS: Record<MetricKey, (preds: readonly Prediction[], calibrationBins: number) => number> = {
  logLoss: (p) => logLoss(p),
  rmseBins: (p) => rmseBins(p),
  auc: (p) => auc(p),
  ece: (p, bins) => expectedCalibrationError(p, bins),
  brier: (p) => brierScore(p),
};

export function computeMetrics(preds: readonly Prediction[], calibrationBins = 10): MetricValues {
  const out = {} as MetricValues;
  for (const { key } of METRICS) out[key] = METRIC_FUNCTIONS[key](preds, calibrationBins);
  return out;
}

/**
 * Az SM-2 utólagos kalibrálása: p_kal = p^k, azaz R = exp(−k · t / S). Egyetlen
 * paraméter, a tanító halmazon log-veszteségre illesztve (aranymetszéses
 * keresés ln k-ban). Azt választja szét, hogy az SM-2 lemaradása a rossz
 * skálázásból (kalibráció) vagy a rangsorolásból (melyik szót felejti el) ered;
 * a rangsort (AUC) nem változtatja.
 */
export function fitPowerCalibration(train: readonly Prediction[]): number {
  if (train.length === 0) return 1;
  const loss = (lnK: number) => {
    const k = Math.exp(lnK);
    return logLoss(train.map(({ p, y }) => ({ p: Math.pow(p, k), y })));
  };
  let lo = Math.log(0.05);
  let hi = Math.log(20);
  const g = (Math.sqrt(5) - 1) / 2;
  let x1 = hi - g * (hi - lo);
  let x2 = lo + g * (hi - lo);
  let f1 = loss(x1);
  let f2 = loss(x2);
  for (let i = 0; i < 60; i++) {
    if (f1 < f2) {
      hi = x2;
      x2 = x1;
      f2 = f1;
      x1 = hi - g * (hi - lo);
      f1 = loss(x1);
    } else {
      lo = x1;
      x1 = x2;
      f1 = f2;
      x2 = lo + g * (hi - lo);
      f2 = loss(x2);
    }
  }
  return Math.exp((lo + hi) / 2);
}

function predictUser(
  userId: string,
  cards: ReadonlyMap<string, readonly ReviewEvent[]>,
  options: ExperimentOptions,
  config?: SchedulerConfig,
) {
  const set = predictUserTestSet(cards, options, config);
  if (!set) return null;
  const k = fitPowerCalibration(set.sm2Train);
  // Az alapvonal a felhasználó TANÍTÓ halmazbeli felidézési arányát mondja.
  const trainRate = set.trainSamples === 0 ? 0.9 : set.trainRecalled / set.trainSamples;
  const preds: Partial<Record<ModelKey, Prediction[]>> = {
    sm2: set.test.sm2,
    sm2Calibrated: set.test.sm2.map(({ p, y }) => ({ p: Math.pow(p, k), y })),
    fsrsDefault: set.test.fsrs,
    fsrsPersonal: set.test.personal,
    baseline: set.test.sm2.map(({ y }) => ({ p: trainRate, y })),
    ...(set.test.oracle ? { oracle: set.test.oracle } : {}),
  };
  const testSamples = set.test.sm2.length;
  return {
    preds,
    base: {
      userId,
      trainSamples: set.trainSamples,
      testSamples,
      testRecallRate: testSamples === 0 ? NaN : set.test.sm2.reduce((a, x) => a + x.y, 0) / testSamples,
      personalized: set.fit !== null,
      sm2CalibrationExponent: k,
    },
  };
}

export function runExperiment(
  users: ReadonlyMap<string, ReadonlyMap<string, readonly ReviewEvent[]>>,
  options: ExperimentOptions = {},
  config?: SchedulerConfig,
): ExperimentResult {
  const opts = {
    testFraction: options.testFraction ?? 0.2,
    minTrainSamples: options.minTrainSamples ?? 100,
    minTestSamples: options.minTestSamples ?? 30,
    bootstrapResamples: options.bootstrapResamples ?? 2000,
    seed: options.seed ?? 42,
    calibrationBins: options.calibrationBins ?? 10,
    fit: options.fit,
  };

  const included: UserPredictions[] = [];
  let excludedUsers = 0;
  for (const [userId, cards] of users) {
    const u = predictUser(userId, cards, opts, config);
    if (!u || u.base.testSamples < opts.minTestSamples) {
      excludedUsers++;
      continue;
    }
    const metrics: Partial<Record<ModelKey, MetricValues>> = {};
    for (const [key, p] of Object.entries(u.preds) as [ModelKey, Prediction[]][]) metrics[key] = computeMetrics(p, opts.calibrationBins);
    included.push({ result: { ...u.base, metrics }, preds: u.preds });
  }

  const models = (Object.keys(MODEL_LABELS) as ModelKey[]).filter((m) => included.length > 0 && included.every((u) => u.preds[m]));
  const pooledPreds = (model: ModelKey, idx: readonly number[]) => idx.flatMap((i) => included[i]!.preds[model]!);
  const all = included.map((_, i) => i);

  const pooled: PooledModelResult[] = models.map((model) => {
    const p = pooledPreds(model, all);
    return {
      model,
      label: MODEL_LABELS[model],
      n: p.length,
      meanPrediction: mean(p.map((x) => x.p)),
      metrics: computeMetrics(p, opts.calibrationBins),
      reliability: reliabilityCurve(p, opts.calibrationBins),
    };
  });

  const comparisons: ComparisonResult[] = [];
  for (const metric of TESTED_METRICS) {
    const higherIsBetter = METRICS.find((m) => m.key === metric)!.higherIsBetter;
    const family: Omit<ComparisonResult, 'pHolm'>[] = [];
    COMPARISONS.forEach(([a, b], ci) => {
      if (!models.includes(a) || !models.includes(b)) return;
      const pairs = included
        .map((u, i) => ({ i, d: u.result.metrics[a]![metric] - u.result.metrics[b]![metric] }))
        .filter((x) => Number.isFinite(x.d));
      const diffs = pairs.map((x) => x.d);
      const seed = opts.seed + 1000 * ci + TESTED_METRICS.indexOf(metric);
      const pooledMetric = (model: ModelKey, idx: readonly number[]) =>
        METRIC_FUNCTIONS[metric](pooledPreds(model, idx), opts.calibrationBins);
      family.push({
        a,
        b,
        metric,
        users: diffs.length,
        meanDifference: bootstrapInterval(diffs.length, (idx) => mean(idx.map((i) => diffs[i]!)), {
          resamples: opts.bootstrapResamples,
          seed,
        }),
        medianDifference: median(diffs),
        pooledDifference: bootstrapInterval(all.length, (idx) => pooledMetric(a, idx) - pooledMetric(b, idx), {
          resamples: opts.bootstrapResamples,
          seed: seed + 500,
        }),
        aBetterShare: diffs.length === 0 ? NaN : diffs.filter((d) => (higherIsBetter ? d > 0 : d < 0)).length / diffs.length,
        wilcoxon: wilcoxonSignedRank(diffs),
      });
    });
    const adjusted = holmAdjust(family.map((c) => c.wilcoxon.pValue));
    family.forEach((c, i) => comparisons.push({ ...c, pHolm: adjusted[i]! }));
  }

  const trainSamples = included.reduce((a, u) => a + u.result.trainSamples, 0);
  const testSamples = included.reduce((a, u) => a + u.result.testSamples, 0);
  const recalled = included.reduce((a, u) => a + u.result.testRecallRate * u.result.testSamples, 0);
  return {
    users: included.length,
    excludedUsers,
    personalizedUsers: included.filter((u) => u.result.personalized).length,
    trainSamples,
    testSamples,
    testRecallRate: testSamples === 0 ? NaN : recalled / testSamples,
    models,
    pooled,
    perUser: included.map((u) => u.result),
    comparisons,
    options: opts,
  };
}
