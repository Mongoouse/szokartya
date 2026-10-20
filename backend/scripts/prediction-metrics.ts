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
