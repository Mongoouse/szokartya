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
import { FsrsMemoryState, fsrsInitialState, fsrsNextState, fsrsRetrievability, ratingFromSm2Grade } from './fsrs';
import { auc, logLoss, Prediction, rmseBins } from './prediction-metrics';

const DAY_MS = 86_400_000;

export interface ReviewEvent {
  grade: number;
  responseTimeMs: number;
  reviewedAt: Date;
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

/** Egy kártya előzményéből a két modell előrejelzései. */
export function predictHistory(events: readonly ReviewEvent[], config?: SchedulerConfig): { sm2: Prediction[]; fsrs: Prediction[] } {
  const sorted = [...events].sort((a, b) => a.reviewedAt.getTime() - b.reviewedAt.getTime());
  const sm2: Prediction[] = [];
  const fsrs: Prediction[] = [];
  let sm2State: CardSchedulingState = initialCardState(config);
  let fsrsState: FsrsMemoryState | null = null;
  let fsrsLast: Date | null = null;

  for (const e of sorted) {
    const y: 0 | 1 = e.grade >= 3 ? 1 : 0;
    const rating = ratingFromSm2Grade(e.grade);
    const sinceLast = sm2State.lastReviewedAt ? (e.reviewedAt.getTime() - sm2State.lastReviewedAt.getTime()) / DAY_MS : null;

    if (sinceLast !== null && sinceLast >= 1 && sm2State.stabilityDays && fsrsState && fsrsLast) {
      sm2.push({ p: Math.exp(-sinceLast / sm2State.stabilityDays), y });
      const tFsrs = (e.reviewedAt.getTime() - fsrsLast.getTime()) / DAY_MS;
      fsrs.push({ p: fsrsRetrievability(tFsrs, fsrsState.stability), y });
    }

    if (!fsrsState || !fsrsLast) {
      fsrsState = fsrsInitialState(rating);
      fsrsLast = e.reviewedAt;
    } else {
      const tFsrs = (e.reviewedAt.getTime() - fsrsLast.getTime()) / DAY_MS;
      if (tFsrs >= 1) {
        fsrsState = fsrsNextState(fsrsState, tFsrs, rating);
        fsrsLast = e.reviewedAt;
      }
    }

    sm2State = scheduleReview(
      sm2State,
      { grade: e.grade as Grade, responseTimeMs: Math.max(0, e.responseTimeMs), reviewedAt: e.reviewedAt },
      config,
    ).card;
  }
  return { sm2, fsrs };
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
