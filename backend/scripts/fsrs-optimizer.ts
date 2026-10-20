/**
 * Az FSRS-4.5 súlyainak személyre illesztése (gépi tanulás) egy felhasználó
 * értékelési naplójára.
 *
 * Felügyelt tanulás bináris kimenetre: a modell minden (legalább egynapos
 * szünet utáni) értékelés előtt felidézési valószínűséget jósol, a célfüggvény
 * az átlagos log-veszteség. Optimalizáló: Adam, numerikus (véges
 * differencia) gradienssel – 17 paraméternél és néhány ezer értékelésnél ez
 * másodpercek alatt lefut, és nem kell hozzá automatikus deriválás.
 *
 * Kis adatmennyiségnél a szabad illesztés túltanulna, ezért:
 *  - L2-regularizáció az alapértelmezett (sok millió értékelésen illesztett)
 *    súlyok felé – ez bayesi értelemben előzetes eloszlás (prior);
 *  - a paraméterek az FSRS referencia-implementáció tartományaiba vannak szorítva;
 *  - az optimalizálás normalizált térben fut, mert a súlyok nagyságrendje eltér
 *    (0,03 … 13,8).
 * A kiértékelés ezért mindig időben későbbi, a tanításból kihagyott adaton
 * történik (lásd `scheduler-evaluation.ts`).
 */
import { FSRS45_DEFAULT_WEIGHTS, FsrsMemoryState, fsrsInitialState, fsrsNextState, fsrsRetrievability, FsrsRating } from './fsrs';
import { Prediction } from './prediction-metrics';

/** A súlyok megengedett tartománya (az open-spaced-repetition FSRS-4.5 optimalizálójából). */
// prettier-ignore
export const FSRS45_WEIGHT_BOUNDS: readonly (readonly [number, number])[] = Object.freeze([
  [0.1, 100], [0.1, 100], [0.1, 100], [0.1, 100], // kezdeti stabilitás értékelésenként
  [1, 10], [0.1, 5], [0.1, 5], [0, 0.5], // nehézség
  [0, 3], [0.1, 0.8], [0.01, 2.5], // stabilitásnövekedés sikeres felidézéskor
  [0.5, 5], [0.01, 0.2], [0.01, 0.9], [0.01, 2], // stabilitás felejtés után
  [0, 1], [1, 4], // „Hard” büntetés, „Easy” bónusz
] as const);

/**
 * Egy kártya előzménye a modell számára előkészítve. Az, hogy melyik
 * értékelés frissíti az állapotot és melyik kerül a mintába, csak az
 * időpontoktól függ – a súlyoktól nem –, így egyszer kell kiszámolni.
 */
export interface FsrsStep {
  rating: FsrsRating;
  /** Eltelt napok az utolsó állapotfrissítő értékelés óta (az első lépésnél 0). */
  elapsedDays: number;
  /** Frissíti-e az állapotot (első értékelés, vagy legalább 1 nap szünet). */
  updates: boolean;
  /** Bekerül-e a mintába (előrejelzés készül rá). */
  scored: boolean;
  /** Tényleges kimenet. */
  y: 0 | 1;
  reviewedAt: Date;
}

/** Előrejelzések egy előkészített előzményre adott súlyokkal; [filter]: mely minták számítsanak. */
export function fsrsPredict(steps: readonly FsrsStep[], w: readonly number[], filter?: (s: FsrsStep) => boolean): Prediction[] {
  const out: Prediction[] = [];
  let state: FsrsMemoryState | null = null;
  for (const s of steps) {
    if (state && s.scored && (!filter || filter(s))) {
      out.push({ p: fsrsRetrievability(s.elapsedDays, state.stability), y: s.y });
    }
    if (!state) state = fsrsInitialState(s.rating, w);
    else if (s.updates) state = fsrsNextState(state, s.elapsedDays, s.rating, w);
  }
  return out;
}

/**
 * Átlagos log-veszteség közbenső tömbök nélkül – az optimalizáló ezt
 * lépésenként ~35-ször hívja, ezért számít a sebessége.
 */
export function fsrsLogLoss(histories: readonly (readonly FsrsStep[])[], w: readonly number[], filter?: (s: FsrsStep) => boolean): number {
  let sum = 0;
  let n = 0;
  for (const steps of histories) {
    let state: FsrsMemoryState | null = null;
    for (const s of steps) {
      if (state && s.scored && (!filter || filter(s))) {
        const p = Math.min(Math.max(fsrsRetrievability(s.elapsedDays, state.stability), 1e-6), 1 - 1e-6);
        sum -= s.y === 1 ? Math.log(p) : Math.log(1 - p);
        n++;
      }
      if (!state) state = fsrsInitialState(s.rating, w);
      else if (s.updates) state = fsrsNextState(state, s.elapsedDays, s.rating, w);
    }
  }
  return n === 0 ? NaN : sum / n;
}

export interface FitOptions {
  iterations?: number;
  learningRate?: number;
  /** A regularizáció erőssége (0 = nincs). */
  l2?: number;
  /** Csak az ennél korábbi minták számítanak a tanításba. */
  trainBefore?: Date;
}

export interface FitResult {
  weights: number[];
  /** Tanító log-veszteség az alapsúlyokkal és az illesztés után. */
  initialLoss: number;
  finalLoss: number;
  trainSamples: number;
  iterations: number;
}

/** Az FSRS súlyainak illesztése a megadott előzményekre (egy felhasználó kártyái). */
export function fitFsrsWeights(histories: readonly (readonly FsrsStep[])[], options: FitOptions = {}): FitResult {
  const { iterations = 150, learningRate = 0.05, l2 = 1, trainBefore } = options;
  const defaults = FSRS45_DEFAULT_WEIGHTS;
  // Normalizált tér: w_i = d_i + scale_i · u_i, u = 0 az alapsúly.
  const scale = defaults.map((d, i) => {
    const [lo, hi] = FSRS45_WEIGHT_BOUNDS[i]!;
    return Math.max(Math.min((hi - lo) / 10, Math.abs(d) / 2), 0.01);
  });
  const toWeights = (u: readonly number[]): number[] =>
    u.map((x, i) => {
      const [lo, hi] = FSRS45_WEIGHT_BOUNDS[i]!;
      return Math.min(Math.max(defaults[i]! + scale[i]! * x, lo), hi);
    });

  const filter = trainBefore ? (s: FsrsStep) => s.reviewedAt < trainBefore : undefined;
  const trainSamples = histories.reduce((n, h) => n + h.filter((s) => s.scored && (!filter || filter(s))).length, 0);
  const dataLoss = (w: readonly number[]): number => fsrsLogLoss(histories, w, filter);
  // A regularizáció a mintaszámmal arányosan gyengül: sok adatnál az adat dönt.
  const lambda = trainSamples === 0 ? 0 : l2 / trainSamples;
  const objective = (u: readonly number[]): number => dataLoss(toWeights(u)) + lambda * u.reduce((a, x) => a + x * x, 0);

  const initialLoss = dataLoss(defaults);
  if (trainSamples === 0) {
    return { weights: [...defaults], initialLoss, finalLoss: initialLoss, trainSamples, iterations: 0 };
  }

  // Adam (Kingma & Ba, 2015).
  const u = defaults.map(() => 0);
  const m = u.map(() => 0);
  const v = u.map(() => 0);
  const [b1, b2, eps, h] = [0.9, 0.999, 1e-8, 1e-4];
  let best = { u: [...u], loss: objective(u) };
  for (let t = 1; t <= iterations; t++) {
    // Előre differencia: lépésenként 18 kiértékelés (a centrálisnál fele annyi);
    // az Adam lépésköz-normalizálása mellett a pontossága elegendő.
    const base = objective(u);
    const grad = u.map((_, i) => {
      const plus = [...u];
      plus[i]! += h;
      return (objective(plus) - base) / h;
    });
    for (let i = 0; i < u.length; i++) {
      m[i] = b1 * m[i]! + (1 - b1) * grad[i]!;
      v[i] = b2 * v[i]! + (1 - b2) * grad[i]! ** 2;
      const mHat = m[i]! / (1 - b1 ** t);
      const vHat = v[i]! / (1 - b2 ** t);
      u[i]! -= (learningRate * mHat) / (Math.sqrt(vHat) + eps);
    }
    const loss = objective(u);
    if (loss < best.loss) best = { u: [...u], loss };
  }
  const weights = toWeights(best.u);
  return { weights, initialLoss, finalLoss: dataLoss(weights), trainSamples, iterations };
}
