/**
 * Az SM-2 (a rendszer ütemezője) és az FSRS-4.5 memóriamodell előrejelző
 * képességének összevetése ugyanazokon az értékelési előzményeken.
 *
 * Módszer: kártyánként időrendben végigjátsszuk az értékeléseket; minden
 * legalább egynapos szünet utáni értékelés előtt mindkét modell megmondja,
 * mekkora valószínűséggel emlékszik a felhasználó (p), és ezt vetjük össze a
 * tényleges kimenettel (minőség ≥ 3 → felidézte). Az azonos napi (tanulási
 * lépcsős) ismétlések nem kerülnek a mintába, mert ott mindkét modell
 * gyakorlatilag 1-et mondana.
 *
 *  - SM-2: R = exp(−t / S), ahol S a rendszer stabilitásbecslése (a
 *    `scheduleReview` újrajátszásából, tehát pontosan a futó ütemező értéke);
 *  - FSRS-4.5: R = (1 + 19/81 · t / S)^−0.5 az alapértelmezett súlyokkal.
 */
import { CardSchedulingState, Grade, initialCardState, scheduleReview, SchedulerConfig } from '../src/repetition/scheduler/sm2-scheduler';
import { FSRS45_DEFAULT_WEIGHTS, ratingFromSm2Grade } from './fsrs';
import { FitOptions, FitResult, fitFsrsWeights, fsrsPredict, FsrsStep } from './fsrs-optimizer';
import { auc, logLoss, Prediction, rmseBins } from './prediction-metrics';

const DAY_MS = 86_400_000;

export interface ReviewEvent {
  grade: number;
  responseTimeMs: number;
  reviewedAt: Date;
  /** Csak szimulált naplóban: a valódi felidézési valószínűség (az „orákulum” előrejelzése). */
  trueRecallProbability?: number;
}

export interface ModelScore {
  model: string;
  n: number;
  logLoss: number;
  rmseBins: number;
  auc: number;
  meanPrediction: number;
}

export interface EvaluationResult {
  cards: number;
  reviews: number;
  /** A mintába került (≥ 1 napos szünet utáni) értékelések. */
  samples: number;
  /** Tényleges felidézési arány a mintában. */
  recallRate: number;
  scores: ModelScore[];
}

/** Egy mintába kerülő lépés az SM-2 előrejelzésével együtt. */
export interface CompiledStep extends FsrsStep {
  /** Az SM-2 előrejelzése (csak a mintába kerülő lépéseknél). */
  sm2P?: number;
  /** A valódi felidézési valószínűség, ha ismert (szimuláció). */
  trueP?: number;
}

/**
 * Egy kártya előzményének előkészítése: időrend, az SM-2 újrajátszása, és
 * hogy melyik értékelés kerül a mintába. Mindkét modell ugyanazokon a
 * lépéseken jósol, így az összevetés azonos mintán történik.
 */
export function compileHistory(events: readonly ReviewEvent[], config?: SchedulerConfig): CompiledStep[] {
  const sorted = [...events].sort((a, b) => a.reviewedAt.getTime() - b.reviewedAt.getTime());
  const steps: CompiledStep[] = [];
  let sm2State: CardSchedulingState = initialCardState(config);
  let fsrsLast: Date | null = null;

  for (const e of sorted) {
    const sinceLast = sm2State.lastReviewedAt ? (e.reviewedAt.getTime() - sm2State.lastReviewedAt.getTime()) / DAY_MS : null;
    const elapsedDays = fsrsLast ? (e.reviewedAt.getTime() - fsrsLast.getTime()) / DAY_MS : 0;
    const scored = sinceLast !== null && sinceLast >= 1 && !!sm2State.stabilityDays && fsrsLast !== null;
    const updates = fsrsLast === null || elapsedDays >= 1;
    steps.push({
      rating: ratingFromSm2Grade(e.grade),
      elapsedDays,
      updates,
      scored,
      y: e.grade >= 3 ? 1 : 0,
      reviewedAt: e.reviewedAt,
      ...(scored ? { sm2P: Math.exp(-sinceLast / sm2State.stabilityDays!) } : {}),
      ...(scored && e.trueRecallProbability !== undefined ? { trueP: e.trueRecallProbability } : {}),
    });
    if (updates) fsrsLast = e.reviewedAt;
    sm2State = scheduleReview(
      sm2State,
      { grade: e.grade as Grade, responseTimeMs: Math.max(0, e.responseTimeMs), reviewedAt: e.reviewedAt },
      config,
    ).card;
  }
  return steps;
}

export function sm2Predictions(steps: readonly CompiledStep[], filter?: (s: FsrsStep) => boolean): Prediction[] {
  return steps.filter((s) => s.sm2P !== undefined && (!filter || filter(s))).map((s) => ({ p: s.sm2P!, y: s.y }));
}

/** Egy kártya előzményéből a két modell előrejelzései (FSRS alapsúlyokkal). */
export function predictHistory(events: readonly ReviewEvent[], config?: SchedulerConfig): { sm2: Prediction[]; fsrs: Prediction[] } {
  const steps = compileHistory(events, config);
  return { sm2: sm2Predictions(steps), fsrs: fsrsPredict(steps, FSRS45_DEFAULT_WEIGHTS) };
}

export function evaluate(histories: ReadonlyMap<string, readonly ReviewEvent[]>, config?: SchedulerConfig): EvaluationResult {
  const sm2: Prediction[] = [];
  const fsrs: Prediction[] = [];
  let reviews = 0;
  for (const events of histories.values()) {
    reviews += events.length;
    const p = predictHistory(events, config);
    sm2.push(...p.sm2);
    fsrs.push(...p.fsrs);
  }
  const recallRate = sm2.length === 0 ? NaN : sm2.reduce((a, x) => a + x.y, 0) / sm2.length;
  // Viszonyítási alap: mindig a minta átlagos felidézési arányát mondó „modell”.
  const baseline = sm2.map(({ y }) => ({ p: recallRate, y }));
  return {
    cards: histories.size,
    reviews,
    samples: sm2.length,
    recallRate,
    scores: [score('SM-2 (módosított, exp. felejtés)', sm2), score('FSRS-4.5 (alapparaméterek)', fsrs), score('Átlag-alapvonal', baseline)],
  };
}

function score(model: string, preds: Prediction[]): ModelScore {
  return {
    model,
    n: preds.length,
    logLoss: logLoss(preds),
    rmseBins: rmseBins(preds),
    auc: auc(preds),
    meanPrediction: preds.length === 0 ? NaN : preds.reduce((a, x) => a + x.p, 0) / preds.length,
  };
}

// ---------------------------------------------------------------------------
// Személyre illesztett FSRS – időbeli tanító / teszt felosztással
// ---------------------------------------------------------------------------

export interface PersonalizationOptions {
  /** A felhasználónként időben utolsó minták ekkora hányada a teszthalmaz. */
  testFraction?: number;
  /** Ennél kevesebb tanító mintánál nem illesztünk (az alapsúlyok maradnak). */
  minTrainSamples?: number;
  fit?: Omit<FitOptions, 'trainBefore'>;
}

export interface UserFit {
  userId: string;
  trainSamples: number;
  testSamples: number;
  /** Az illesztett súlyok, vagy null, ha kevés volt az adat. */
  weights: number[] | null;
  trainLossBefore: number;
  trainLossAfter: number;
}

export interface PersonalizedEvaluation {
  users: number;
  personalizedUsers: number;
  trainSamples: number;
  testSamples: number;
  /** Tényleges felidézési arány a teszthalmazon. */
  testRecallRate: number;
  /** Minden modell a teszthalmazon (a tanítás ezt nem látta). */
  scores: ModelScore[];
  fits: UserFit[];
}

/** Egy felhasználó időbeli tanító / teszt felosztása és a modellek előrejelzései. */
export interface UserTestSet {
  trainSamples: number;
  trainRecalled: number;
  /** Az illesztés eredménye, vagy null, ha kevés volt a tanító minta. */
  fit: FitResult | null;
  /** Az SM-2 előrejelzései a tanító halmazon (pl. utólagos kalibrációhoz). */
  sm2Train: Prediction[];
  /**
   * A teszthalmaz előrejelzései. A tömbök elemenként ugyanarra az értékelésre
   * vonatkoznak (azonos sorrend), így mintaszinten is párosíthatók.
   */
  test: { sm2: Prediction[]; fsrs: Prediction[]; personal: Prediction[]; oracle: Prediction[] | null };
}

/**
 * Felhasználónként: a minták időrendjében az első (1 − testFraction) rész a
 * tanító, a többi a teszthalmaz. Az FSRS súlyait csak a tanító részre
 * illesztjük, és minden modellt a teszthalmazon mérünk. A teszthalmazbeli
 * előrejelzés a korábbi (tanító időszakbeli és azóta történt) értékelésekre
 * épül – ugyanúgy, ahogy a valódi használatban. Null, ha nincs legalább két minta.
 */
export function predictUserTestSet(
  cards: ReadonlyMap<string, readonly ReviewEvent[]>,
  options: PersonalizationOptions = {},
  config?: SchedulerConfig,
): UserTestSet | null {
  const { testFraction = 0.2, minTrainSamples = 100, fit } = options;
  const histories = [...cards.values()].map((events) => compileHistory(events, config));
  const times = histories
    .flat()
    .filter((s) => s.scored)
    .map((s) => s.reviewedAt.getTime())
    .sort((a, b) => a - b);
  if (times.length < 2) return null;
  const cutoff = new Date(times[Math.min(times.length - 1, Math.floor(times.length * (1 - testFraction)))]!);
  const isTest = (s: FsrsStep) => s.reviewedAt >= cutoff;
  const isTrain = (s: FsrsStep) => s.reviewedAt < cutoff;

  const sm2Train = histories.flatMap((h) => sm2Predictions(h, isTrain));
  const fitted = sm2Train.length >= minTrainSamples ? fitFsrsWeights(histories, { ...fit, trainBefore: cutoff }) : null;
  const weights = fitted?.weights ?? FSRS45_DEFAULT_WEIGHTS;
  const testSteps = histories.flatMap((h) => h.filter((s) => s.sm2P !== undefined && isTest(s)));
  const hasOracle = testSteps.length > 0 && testSteps.every((s) => s.trueP !== undefined);
  return {
    trainSamples: sm2Train.length,
    trainRecalled: sm2Train.reduce((a, p) => a + p.y, 0),
    fit: fitted,
    sm2Train,
    test: {
      sm2: testSteps.map((s) => ({ p: s.sm2P!, y: s.y })),
      fsrs: histories.flatMap((h) => fsrsPredict(h, FSRS45_DEFAULT_WEIGHTS, isTest)),
      personal: histories.flatMap((h) => fsrsPredict(h, weights, isTest)),
      oracle: hasOracle ? testSteps.map((s) => ({ p: s.trueP!, y: s.y })) : null,
    },
  };
}

/** Az összes felhasználó teszthalmazán összesített mérőszámok (lásd `predictUserTestSet`). */
export function evaluatePersonalized(
  users: ReadonlyMap<string, ReadonlyMap<string, readonly ReviewEvent[]>>,
  options: PersonalizationOptions = {},
  config?: SchedulerConfig,
): PersonalizedEvaluation {
  const test = { sm2: [] as Prediction[], fsrs: [] as Prediction[], personal: [] as Prediction[] };
  const fits: UserFit[] = [];
  let trainSamples = 0;
  let trainRecalled = 0;

  for (const [userId, cards] of users) {
    const set = predictUserTestSet(cards, options, config);
    if (!set) continue;
    trainSamples += set.trainSamples;
    trainRecalled += set.trainRecalled;
    fits.push({
      userId,
      trainSamples: set.trainSamples,
      testSamples: set.test.sm2.length,
      weights: set.fit?.weights ?? null,
      trainLossBefore: set.fit?.initialLoss ?? NaN,
      trainLossAfter: set.fit?.finalLoss ?? NaN,
    });
    test.sm2.push(...set.test.sm2);
    test.fsrs.push(...set.test.fsrs);
    test.personal.push(...set.test.personal);
  }

  const testRecallRate = test.sm2.length === 0 ? NaN : test.sm2.reduce((a, x) => a + x.y, 0) / test.sm2.length;
  // Az alapvonal a TANÍTÓ halmaz átlagát mondja – a teszthalmaz kimenetét nem ismerheti.
  const trainRate = trainSamples === 0 ? 0.9 : trainRecalled / trainSamples;
  return {
    users: fits.length,
    personalizedUsers: fits.filter((f) => f.weights).length,
    trainSamples,
    testSamples: test.sm2.length,
    testRecallRate,
    scores: [
      score('SM-2 (módosított, exp. felejtés)', test.sm2),
      score('FSRS-4.5 (alapparaméterek)', test.fsrs),
      score('FSRS-4.5 (személyre illesztve)', test.personal),
      score(
        'Átlag-alapvonal (tanító arány)',
        test.sm2.map(({ y }) => ({ p: trainRate, y })),
      ),
    ],
    fits,
  };
}
