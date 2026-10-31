/**
 * Magolható (seedelhető) álvéletlen-generátorok: a kísérlet minden futása
 * ugyanazzal a maggal bitre azonos eredményt ad.
 */

export type Random = () => number;

/** mulberry32: kicsi, gyors, 32 bites állapotú generátor, egyenletes [0, 1) eloszlás. */
export function mulberry32(seed: number): Random {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Független almag egy szöveges címkéből (pl. tanulónként), hogy a részeredmények ne függjenek a futtatási sorrendtől. */
export function deriveSeed(seed: number, label: string): number {
  let h = (seed ^ 0x9e3779b9) >>> 0;
  for (let i = 0; i < label.length; i++) {
    h = Math.imul(h ^ label.charCodeAt(i), 0x01000193) >>> 0;
  }
  return h;
}

/** Standard normális minta (Box–Muller). */
export function normal(random: Random, mean = 0, sd = 1): number {
  const u = Math.max(random(), Number.MIN_VALUE);
  const v = random();
  return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Egyenletes minta [min, max) között. */
export function uniform(random: Random, min: number, max: number): number {
  return min + (max - min) * random();
}
