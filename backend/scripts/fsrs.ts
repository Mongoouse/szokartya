/**
 * FSRS-4.5 (Free Spaced Repetition Scheduler) memóriamodell – csak a
 * felidézési valószínűség előrejelzéséhez, az SM-2-vel való összevetésre.
 *
 * Forrás: J. Ye et al., „A Stochastic Shortest Path Algorithm for Optimizing
 * Spaced Repetition Scheduling” (KDD '22) és az open-spaced-repetition/fsrs4anki
 * projekt 4.5-ös képletei, az ott közölt alapértelmezett (sok millió
 * értékelésen illesztett) paraméterekkel. Személyre illesztés nincs.
 */

/** FSRS-4.5 alapértelmezett súlyai (w0 … w16). */
export const FSRS45_DEFAULT_WEIGHTS: readonly number[] = Object.freeze([
  0.4872, 1.4003, 3.7145, 13.8206, 5.1618, 1.2298, 0.8975, 0.031, 1.6474, 0.1367, 1.0461, 2.1072, 0.0793, 0.3246, 1.587, 0.2272, 2.8755,
]);

const DECAY = -0.5;
/** Úgy választva, hogy R(S, S) = 0.9 legyen. */
const FACTOR = 19 / 81;

/** FSRS értékelés: 1 = Again, 2 = Hard, 3 = Good, 4 = Easy. */
export type FsrsRating = 1 | 2 | 3 | 4;

export interface FsrsMemoryState {
  /** Stabilitás (nap): ennyi idő alatt csökken a felidézési valószínűség 90%-ra. */
  stability: number;
  /** Nehézség: 1 (könnyű) … 10 (nehéz). */
  difficulty: number;
}

/** Az SM-2 0–5 skála leképezése az FSRS négyfokú skálájára. */
export function ratingFromSm2Grade(grade: number): FsrsRating {
  if (grade <= 2) return 1;
  if (grade === 3) return 2;
  if (grade === 4) return 3;
  return 4;
}

/** Felidézési valószínűség t nap elteltével (hatványfüggvény alakú felejtési görbe). */
export function fsrsRetrievability(elapsedDays: number, stability: number): number {
  return Math.pow(1 + (FACTOR * Math.max(0, elapsedDays)) / stability, DECAY);
}

export function fsrsInitialState(rating: FsrsRating, w: readonly number[] = FSRS45_DEFAULT_WEIGHTS): FsrsMemoryState {
  return { stability: Math.max(w[rating - 1]!, 0.1), difficulty: initialDifficulty(rating, w) };
}

/**
 * Állapotfrissítés egy (legalább egynapos szünet utáni) értékelés után.
 * Az azonos napi ismétléseket a 4.5-ös modell nem használja a stabilitás
 * frissítésére – ezeket a hívó hagyja ki.
 */
export function fsrsNextState(
  state: FsrsMemoryState,
  elapsedDays: number,
  rating: FsrsRating,
  w: readonly number[] = FSRS45_DEFAULT_WEIGHTS,
): FsrsMemoryState {
  const r = fsrsRetrievability(elapsedDays, state.stability);
  const difficulty = nextDifficulty(state.difficulty, rating, w);
  const stability = rating === 1 ? forgetStability(state, r, w) : recallStability(state, r, rating, w);
  return { stability: Math.max(stability, 0.1), difficulty };
}

function initialDifficulty(rating: FsrsRating, w: readonly number[]): number {
  return clamp(w[4]! - (rating - 3) * w[5]!, 1, 10);
}

function nextDifficulty(d: number, rating: FsrsRating, w: readonly number[]): number {
  const updated = d - w[6]! * (rating - 3);
  // Visszahúzás a „Good” kezdőnehézség felé (mean reversion).
  return clamp(w[7]! * initialDifficulty(3, w) + (1 - w[7]!) * updated, 1, 10);
}

function recallStability(s: FsrsMemoryState, r: number, rating: FsrsRating, w: readonly number[]): number {
  const hardPenalty = rating === 2 ? w[15]! : 1;
  const easyBonus = rating === 4 ? w[16]! : 1;
  return (
    s.stability *
    (Math.exp(w[8]!) * (11 - s.difficulty) * Math.pow(s.stability, -w[9]!) * (Math.exp(w[10]! * (1 - r)) - 1) * hardPenalty * easyBonus + 1)
  );
}

function forgetStability(s: FsrsMemoryState, r: number, w: readonly number[]): number {
  return w[11]! * Math.pow(s.difficulty, -w[12]!) * (Math.pow(s.stability + 1, w[13]!) - 1) * Math.exp(w[14]! * (1 - r));
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), max);
}
