import { bootstrapInterval, holmAdjust, mean, normalCdf, quantile, wilcoxonSignedRank } from './statistics';
import { mulberry32, normal } from './random';

describe('Wilcoxon-féle előjeles rangpróba', () => {
  // R: wilcox.test(x, y, paired = TRUE) → V = 40, p-value = 0.03906 (egzakt).
  const x = [1.83, 0.5, 1.62, 2.48, 1.68, 1.88, 1.55, 3.06, 1.3];
  const y = [0.878, 0.647, 0.598, 2.05, 1.06, 1.29, 1.06, 3.14, 1.29];

  it('egyezik az R wilcox.test egzakt eredményével', () => {
    const r = wilcoxonSignedRank(x.map((v, i) => v - y[i]!));
    expect(r.method).toBe('exact');
    expect(r.wPlus).toBe(40);
    expect(r.wMinus).toBe(5);
    expect(r.pValue).toBeCloseTo(0.03906, 5);
    expect(r.rankBiserial).toBeCloseTo((40 - 5) / 45, 10);
  });

  it('a különbségek előjelének megfordítása ugyanazt a p-értéket adja', () => {
    const d = x.map((v, i) => v - y[i]!);
    const a = wilcoxonSignedRank(d);
    const b = wilcoxonSignedRank(d.map((v) => -v));
    expect(b.pValue).toBeCloseTo(a.pValue, 12);
    expect(b.wPlus).toBe(a.wMinus);
  });

  it('holtversenynél normális közelítést használ, a nullákat elhagyja', () => {
    // Kézzel: |d| rangjai 1,1,1 → 2; 2,2,2 → 5; 3 → 7; 4 → 8; 5 → 9; W⁺ = 38, W⁻ = 7.
    // σ² = 9·10·19/24 − 2·(3³ − 3)/48 = 70,25; z = (38 − 22,5 − 0,5) / √70,25 = 1,7897; p = 0,0735
    // (megegyezik az R wilcox.test(..., exact = FALSE, correct = TRUE) képletével).
    const r = wilcoxonSignedRank([1, 1, 2, 2, 3, -1, 0, 4, 5, -2]);
    expect(r.method).toBe('normal');
    expect(r.nNonZero).toBe(9);
    expect(r.wPlus).toBe(38);
    expect(r.z).toBeCloseTo(1.78965, 4);
    expect(r.pValue).toBeCloseTo(0.0735, 4);
  });

  it('nagy mintán: H0 alatt nem, valódi eltolásnál szignifikáns', () => {
    const random = mulberry32(7);
    const nullDiffs = Array.from({ length: 200 }, () => normal(random));
    const shifted = nullDiffs.map((d) => d + 0.4);
    expect(wilcoxonSignedRank(nullDiffs).pValue).toBeGreaterThan(0.05);
    const r = wilcoxonSignedRank(shifted);
    expect(r.method).toBe('normal');
    expect(r.pValue).toBeLessThan(1e-4);
  });

  it('csupa nulla különbségnél p = 1', () => {
    expect(wilcoxonSignedRank([0, 0, 0]).pValue).toBe(1);
  });
});

describe('segédfüggvények', () => {
  it('normális eloszlásfüggvény', () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 7);
    expect(normalCdf(1.959964)).toBeCloseTo(0.975, 6);
    expect(normalCdf(-1)).toBeCloseTo(0.158655, 6);
  });

  it('Holm–Bonferroni korrekció', () => {
    // R: p.adjust(c(0.01, 0.04, 0.03, 0.005), "holm") → 0.03 0.06 0.06 0.02
    const adj = holmAdjust([0.01, 0.04, 0.03, 0.005]);
    [0.03, 0.06, 0.06, 0.02].forEach((v, i) => expect(adj[i]).toBeCloseTo(v, 12));
  });

  it('kvantilis lineáris interpolációval (R 7-es típus)', () => {
    expect(quantile([1, 2, 3, 4], 0.5)).toBe(2.5);
    expect(quantile([1, 2, 3, 4], 0.25)).toBe(1.75);
  });
});

describe('bootstrap konfidenciaintervallum', () => {
  it('reprodukálható, és az átlag 95%-os intervalluma a valódi értéket a futások ~95%-ában lefedi', () => {
    const random = mulberry32(11);
    let covered = 0;
    const runs = 200;
    for (let r = 0; r < runs; r++) {
      const sample = Array.from({ length: 40 }, () => normal(random, 1, 2));
      const ci = bootstrapInterval(sample.length, (idx) => mean(idx.map((i) => sample[i]!)), { resamples: 400, seed: r });
      if (ci.low <= 1 && 1 <= ci.high) covered++;
    }
    // Percentilis bootstrap kis mintán kissé alul fed; 200 futásnál a binomiális szórás ~1,5%.
    expect(covered / runs).toBeGreaterThan(0.88);
    expect(covered / runs).toBeLessThan(0.99);
  });

  it('ugyanazzal a maggal azonos intervallumot ad', () => {
    const data = [0.1, 0.4, -0.2, 0.3, 0.5, 0.0, 0.2];
    const stat = (idx: readonly number[]) => mean(idx.map((i) => data[i]!));
    expect(bootstrapInterval(data.length, stat, { seed: 3 })).toEqual(bootstrapInterval(data.length, stat, { seed: 3 }));
    const ci = bootstrapInterval(data.length, stat, { seed: 3 });
    expect(ci.estimate).toBeCloseTo(mean(data), 12);
    expect(ci.low).toBeLessThan(ci.estimate);
    expect(ci.high).toBeGreaterThan(ci.estimate);
  });
});
