/**
 * Valószínűségi előrejelzések minősítése bináris kimenetre (felidézte / nem).
 * A térközös ismétlés szakirodalmában szokásos mértékek (lásd az
 * open-spaced-repetition „srs-benchmark” módszertanát).
 */

export interface Prediction {
  /** Előre jelzett felidézési valószínűség (0–1). */
  p: number;
  /** Tényleges kimenet: 1 = felidézte, 0 = elfelejtette. */
  y: 0 | 1;
}

const EPS = 1e-6;

/** Átlagos log-veszteség (kisebb = jobb; a mindig 0.5-öt mondó modellé ≈ 0.693). */
export function logLoss(preds: readonly Prediction[]): number {
  if (preds.length === 0) return NaN;
  const sum = preds.reduce((acc, { p, y }) => {
    const q = Math.min(Math.max(p, EPS), 1 - EPS);
    return acc - (y * Math.log(q) + (1 - y) * Math.log(1 - q));
  }, 0);
  return sum / preds.length;
}

/**
 * Kalibrációs hiba: az előrejelzéseket `bins` egyenlő szélességű sávba
 * osztva a sávonkénti átlagos előrejelzés és a tényleges arány eltérésének
 * elemszámmal súlyozott négyzetes középértéke (kisebb = jobb).
 */
export function rmseBins(preds: readonly Prediction[], bins = 20): number {
  if (preds.length === 0) return NaN;
  const sums = Array.from({ length: bins }, () => ({ n: 0, p: 0, y: 0 }));
  for (const { p, y } of preds) {
    const b = sums[Math.min(bins - 1, Math.floor(p * bins))]!;
    b.n++;
    b.p += p;
    b.y += y;
  }
  const sq = sums.reduce((acc, b) => (b.n === 0 ? acc : acc + b.n * ((b.p - b.y) / b.n) ** 2), 0);
  return Math.sqrt(sq / preds.length);
}

/** ROC AUC (rangsorolási képesség; 0.5 = véletlen, 1 = tökéletes). Holtversenyt fél ponttal számol. */
export function auc(preds: readonly Prediction[]): number {
  const pos = preds.filter((x) => x.y === 1).length;
  const neg = preds.length - pos;
  if (pos === 0 || neg === 0) return NaN;
  const sorted = [...preds].sort((a, b) => a.p - b.p);
  let rankSum = 0;
  for (let i = 0; i < sorted.length;) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1]!.p === sorted[i]!.p) j++;
    const avgRank = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) if (sorted[k]!.y === 1) rankSum += avgRank;
    i = j + 1;
  }
  return (rankSum - (pos * (pos + 1)) / 2) / (pos * neg);
}

/** Brier-pontszám: az előrejelzés és a kimenet négyzetes eltérésének átlaga (kisebb = jobb). */
export function brierScore(preds: readonly Prediction[]): number {
  if (preds.length === 0) return NaN;
  return preds.reduce((acc, { p, y }) => acc + (p - y) ** 2, 0) / preds.length;
}

/** A kalibrációs görbe egy sávja. */
export interface ReliabilityBin {
  /** A sáv határai (az előre jelzett valószínűség tartománya). */
  from: number;
  to: number;
  n: number;
  /** A sávba eső előrejelzések átlaga. */
  meanPrediction: number;
  /** A tényleges felidézési arány a sávban. */
  observedRate: number;
  /** A tényleges arány 95%-os Wilson-féle konfidenciaintervalluma. */
  ciLow: number;
  ciHigh: number;
}

/**
 * Kalibrációs (megbízhatósági) görbe: egyenlő szélességű sávonként az átlagos
 * előrejelzés és a tényleges arány. A tökéletesen kalibrált modell pontjai az
 * átlón vannak. Az üres sávok kimaradnak.
 */
export function reliabilityCurve(preds: readonly Prediction[], bins = 10): ReliabilityBin[] {
  const acc = Array.from({ length: bins }, () => ({ n: 0, p: 0, y: 0 }));
  for (const { p, y } of preds) {
    const b = acc[Math.min(bins - 1, Math.max(0, Math.floor(p * bins)))]!;
    b.n++;
    b.p += p;
    b.y += y;
  }
  return acc.flatMap((b, i) => {
    if (b.n === 0) return [];
    const [ciLow, ciHigh] = wilsonInterval(b.y, b.n);
    return [{ from: i / bins, to: (i + 1) / bins, n: b.n, meanPrediction: b.p / b.n, observedRate: b.y / b.n, ciLow, ciHigh }];
  });
}

/**
 * Várható kalibrációs hiba (ECE, Naeini et al., 2015): a sávonkénti
 * |átlagos előrejelzés − tényleges arány| elemszámmal súlyozott átlaga
 * (kisebb = jobb). A `rmseBins` négyzetes, ez abszolút eltérést átlagol.
 */
export function expectedCalibrationError(preds: readonly Prediction[], bins = 10): number {
  if (preds.length === 0) return NaN;
  return reliabilityCurve(preds, bins).reduce((acc, b) => acc + b.n * Math.abs(b.meanPrediction - b.observedRate), 0) / preds.length;
}

/** Binomiális arány 95%-os Wilson-intervalluma (kis mintán és 0 / 1 közelében is jól viselkedik). */
export function wilsonInterval(successes: number, n: number, z = 1.959964): [number, number] {
  if (n === 0) return [NaN, NaN];
  const phat = successes / n;
  const denom = 1 + (z * z) / n;
  const centre = (phat + (z * z) / (2 * n)) / denom;
  const half = (z * Math.sqrt((phat * (1 - phat)) / n + (z * z) / (4 * n * n))) / denom;
  return [Math.max(0, centre - half), Math.min(1, centre + half)];
}
