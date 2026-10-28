/**
 * Páros (összetartozó mintás) statisztikai próbák két előrejelző modell
 * összevetéséhez. A vizsgálati egység a felhasználó (tanuló): ugyanazon
 * felhasználó mintái nem függetlenek egymástól, a felhasználók viszont igen,
 * ezért a próbák felhasználónkénti mérőszám-párokon futnak.
 *
 *  - Wilcoxon-féle előjeles rangpróba (Wilcoxon, 1945): nem feltételez
 *    normalitást, csak a különbségek eloszlásának szimmetriáját.
 *  - Bootstrap konfidenciaintervallum (Efron & Tibshirani, 1993): a
 *    felhasználók visszatevéses újramintavételezésével, percentilis módszerrel.
 *  - Holm–Bonferroni korrekció (Holm, 1979) a többszörös összehasonlításra.
 */
import { mulberry32 } from './random';

export interface WilcoxonResult {
  /** A párok száma. */
  n: number;
  /** A nem nulla különbségek száma (a nullák kimaradnak – Wilcoxon eredeti eljárása). */
  nNonZero: number;
  /** A pozitív különbségek rangösszege. */
  wPlus: number;
  /** A negatív különbségek rangösszege. */
  wMinus: number;
  /** Standardizált próbastatisztika (normális közelítésnél; egzakt próbánál is tájékoztató). */
  z: number;
  /** Kétoldali p-érték. */
  pValue: number;
  /** Egzakt eloszlásból (kis n, holtverseny nélkül) vagy normális közelítéssel számolt. */
  method: 'exact' | 'normal';
  /** Illesztett párok rang-biszeriális korrelációja: (W+ − W−) / (W+ + W−), −1 … 1. */
  rankBiserial: number;
}

/**
 * Wilcoxon-féle előjeles rangpróba a d_i = a_i − b_i különbségekre
 * (H0: a különbségek eloszlása 0-ra szimmetrikus). 25-nél kevesebb nem nulla
 * különbségnél és holtverseny nélkül egzakt eloszlást használ, egyébként
 * holtverseny- és folytonossági korrekcióval normális közelítést.
 */
export function wilcoxonSignedRank(differences: readonly number[]): WilcoxonResult {
  const n = differences.length;
  const nz = differences.filter((d) => d !== 0 && Number.isFinite(d));
  const m = nz.length;
  if (m === 0) {
    return { n, nNonZero: 0, wPlus: 0, wMinus: 0, z: 0, pValue: 1, method: 'exact', rankBiserial: 0 };
  }

  // Rangsorolás |d| szerint, holtversenynél átlagranggal.
  const order = nz.map((d, i) => ({ abs: Math.abs(d), positive: d > 0, i })).sort((a, b) => a.abs - b.abs);
  const ranks = new Array<number>(m);
  let tieCorrection = 0;
  let hasTies = false;
  for (let i = 0; i < m;) {
    let j = i;
    while (j + 1 < m && order[j + 1]!.abs === order[i]!.abs) j++;
    const t = j - i + 1;
    if (t > 1) {
      hasTies = true;
      tieCorrection += t ** 3 - t;
    }
    for (let k = i; k <= j; k++) ranks[k] = (i + j) / 2 + 1;
    i = j + 1;
  }
  let wPlus = 0;
  for (let k = 0; k < m; k++) if (order[k]!.positive) wPlus += ranks[k]!;
  const total = (m * (m + 1)) / 2;
  const wMinus = total - wPlus;
  const mean = total / 2;
  const variance = (m * (m + 1) * (2 * m + 1)) / 24 - tieCorrection / 48;
  const sd = Math.sqrt(variance);
  const rankBiserial = (wPlus - wMinus) / total;

  if (m < 25 && !hasTies) {
    const p = exactSignedRankTwoSided(wPlus, m);
    return { n, nNonZero: m, wPlus, wMinus, z: sd === 0 ? 0 : (wPlus - mean) / sd, pValue: p, method: 'exact', rankBiserial };
  }
  const diff = wPlus - mean;
  const corrected = Math.sign(diff) * Math.max(0, Math.abs(diff) - 0.5);
  const z = sd === 0 ? 0 : corrected / sd;
  return { n, nNonZero: m, wPlus, wMinus, z, pValue: Math.min(1, 2 * (1 - normalCdf(Math.abs(z)))), method: 'normal', rankBiserial };
}

/** Egzakt kétoldali p-érték: a W+ eloszlása H0 alatt (mind a 2^m előjelkombináció egyformán valószínű). */
function exactSignedRankTwoSided(wPlus: number, m: number): number {
  const total = (m * (m + 1)) / 2;
  // counts[s] = hány részhalmaza az {1..m} rangoknak ad s összeget.
  const counts = new Array<number>(total + 1).fill(0);
  counts[0] = 1;
  for (let r = 1; r <= m; r++) {
    for (let s = total; s >= r; s--) counts[s]! += counts[s - r]!;
  }
  const all = 2 ** m;
  const w = Math.round(wPlus);
  let lower = 0;
  for (let s = 0; s <= w; s++) lower += counts[s]!;
  let upper = 0;
  for (let s = w; s <= total; s++) upper += counts[s]!;
  return Math.min(1, (2 * Math.min(lower, upper)) / all);
}

/** A standard normális eloszlásfüggvény (Abramowitz–Stegun 7.1.26 hibafüggvény-közelítés, |hiba| < 1,5·10⁻⁷). */
export function normalCdf(x: number): number {
  const t = 1 / (1 + (0.3275911 * Math.abs(x)) / Math.SQRT2);
  const poly = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
  const erf = 1 - poly * Math.exp(-(x * x) / 2);
  return x >= 0 ? (1 + erf) / 2 : (1 - erf) / 2;
}

export interface BootstrapInterval {
  /** A statisztika értéke az eredeti mintán. */
  estimate: number;
  /** Percentilis konfidenciaintervallum. */
  low: number;
  high: number;
  level: number;
  resamples: number;
}

/**
 * Bootstrap konfidenciaintervallum: az `n` egységet (felhasználót)
 * visszatevéssel újramintavételezi, és mindegyik újramintára kiszámolja a
 * statisztikát. A `statistic` az egységek indexeinek listáját kapja – így
 * egységszintű (klaszter) bootstrapre is jó, ahol egy egység sok mintát hordoz.
 */
export function bootstrapInterval(
  n: number,
  statistic: (indices: readonly number[]) => number,
  options: { resamples?: number; level?: number; seed?: number } = {},
): BootstrapInterval {
  const { resamples = 2000, level = 0.95, seed = 1 } = options;
  const all = Array.from({ length: n }, (_, i) => i);
  const estimate = statistic(all);
  if (n === 0) return { estimate, low: NaN, high: NaN, level, resamples: 0 };
  const random = mulberry32(seed);
  const values: number[] = [];
  const idx = new Array<number>(n);
  for (let b = 0; b < resamples; b++) {
    for (let i = 0; i < n; i++) idx[i] = Math.floor(random() * n);
    const v = statistic(idx);
    if (Number.isFinite(v)) values.push(v);
  }
  values.sort((a, b) => a - b);
  const alpha = (1 - level) / 2;
  return { estimate, low: quantile(values, alpha), high: quantile(values, 1 - alpha), level, resamples: values.length };
}

/** Empirikus kvantilis lineáris interpolációval (rendezett bemenetre). */
export function quantile(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return NaN;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo);
}

/**
 * Holm–Bonferroni korrekció: a korrigált p-értékek ugyanabban a sorrendben.
 * A családonkénti elsőfajú hibát α-n tartja, és egyenletesen erősebb a
 * sima Bonferroninál.
 */
export function holmAdjust(pValues: readonly number[]): number[] {
  const m = pValues.length;
  const order = pValues.map((p, i) => ({ p, i })).sort((a, b) => a.p - b.p);
  const adjusted = new Array<number>(m);
  let running = 0;
  order.forEach(({ p, i }, k) => {
    running = Math.max(running, Math.min(1, (m - k) * p));
    adjusted[i] = running;
  });
  return adjusted;
}

export function mean(values: readonly number[]): number {
  return values.length === 0 ? NaN : values.reduce((a, x) => a + x, 0) / values.length;
}

export function median(values: readonly number[]): number {
  return quantile(
    [...values].sort((a, b) => a - b),
    0.5,
  );
}
