/**
 * Szimulált tanulók a kísérlet módszertanának bemutatására és ellenőrzésére,
 * amíg nincs elég valós használati napló.
 *
 * A tanuló úgy használja az alkalmazást, ahogy a valódi felhasználó: a
 * kártyákat a rendszer SM-2 ütemezője szerint ismétli (tanulási lépcsők,
 * késve elvégzett ismétlések, kihagyott napok), és a naplóba ugyanaz kerül,
 * mint élesben (minőség 0–5, reakcióidő, időpont). A felidézés sikerét egy
 * „valódi” memóriamodell sorsolja, amelyet a kiértékelt modellek nem ismernek.
 *
 * Mivel a generáló modell választása eleve kedvezhet valamelyik ütemezőnek,
 * három, egymástól független elméletből származó modell közül lehet választani
 * (érzékenységvizsgálat):
 *
 *  - `actr`: ACT-R deklaratív memória a térközhatással (Pavlik & Anderson,
 *    2005): hatványfüggvény szerinti felejtés, és minél erősebb az emlék az
 *    ismétléskor, annál gyorsabban bomlik az új nyom. Egyik vizsgált modell
 *    családjába sem tartozik – ez a fő (semleges) forgatókönyv.
 *  - `hlr`: felezési idős regresszió (Settles & Meeder, 2016): exponenciális
 *    felejtés, a felezési idő a sikeres / sikertelen ismétlések számától függ.
 *    Az SM-2 exponenciális görbéjének kedvez.
 *  - `fsrs`: FSRS-4.5 tanulónként eltérő (perturbált) súlyokkal. Az FSRS-nek
 *    kedvez; a személyre illesztés felső korlátját mutatja.
 *
 * Mindhárom modellben van tanulónkénti (képesség) és szónkénti (nehézség)
 * heterogenitás.
 */
import { CardSchedulingState, Grade, initialCardState, scheduleReview } from '../../src/repetition/scheduler/sm2-scheduler';
import { FSRS45_DEFAULT_WEIGHTS, FsrsMemoryState, fsrsInitialState, fsrsNextState, fsrsRetrievability, ratingFromSm2Grade } from '../fsrs';
import { ReviewEvent } from '../scheduler-evaluation';
import { deriveSeed, mulberry32, normal, Random, uniform } from './random';

export type MemoryModelName = 'actr' | 'hlr' | 'fsrs';
export const MEMORY_MODELS: readonly MemoryModelName[] = ['actr', 'hlr', 'fsrs'];

export const MEMORY_MODEL_LABELS: Record<MemoryModelName, string> = {
  actr: 'ACT-R (hatványfüggvény, térközhatás)',
  hlr: 'HLR (exponenciális felejtés)',
  fsrs: 'FSRS-4.5 (perturbált súlyok)',
};

export interface SimulationOptions {
  memoryModel: MemoryModelName;
  learners: number;
  /** A szimulált használat hossza napokban. */
  days: number;
  seed: number;
}

/** A szimuláció kezdőnapja (tetszőleges, csak az időbélyegekhez kell). */
const T0 = Date.UTC(2026, 0, 5);
const DAY_MS = 86_400_000;
const MAX_EVENTS_PER_CARD = 200;

/** A naplóbejegyzés kiegészítve a valódi felidézési valószínűséggel (csak szimulációban ismert). */
export interface SimulatedReviewEvent extends ReviewEvent {
  trueRecallProbability: number;
}

export interface SimulatedLearner {
  userId: string;
  cards: Map<string, SimulatedReviewEvent[]>;
  traits: LearnerTraits;
}

export interface LearnerTraits {
  /** Általános képesség (0 = átlagos, pozitív = jobb memória). */
  ability: number;
  /** Ennyi valószínűséggel nyitja meg az alkalmazást egy adott napon. */
  activeProbability: number;
  newCardsPerDay: number;
  /** A megtanulandó szavak száma. */
  deckSize: number;
  /** Mekkora eséllyel ismeri már a szót az első találkozáskor. */
  priorKnowledge: number;
}

/** Egy kártya „valódi” emléknyoma. Idő: napok a szimuláció kezdete óta. */
interface CardMemory {
  recallProbability(t: number): number;
  /** Az ismétlés hatása az emléknyomra (a válasz után a helyes megoldás mindig látható). */
  record(t: number, recalled: boolean, grade: Grade): void;
}

type MemoryFactory = (learner: LearnerTraits, random: Random) => (itemDifficulty: number) => CardMemory;

// ---------------------------------------------------------------------------
// ACT-R (Pavlik & Anderson, 2005)
// ---------------------------------------------------------------------------

/**
 * Aktiváció: m(t) = ln Σ_j (t − t_j)^(−d_j), ahol a j-edik ismétlés bomlási
 * rátája d_j = c · e^(m(t_j)) + a. Felidézés: P = 1 / (1 + e^((τ − m) / s)).
 * A tömbösített (rövid szünetű) ismétlés magas aktivációnál történik, ezért
 * gyorsan bomlik – ez a térközhatás. Az idő napokban mért, legalább 1 perc.
 */
const actr: MemoryFactory = (learner, random) => {
  const a = Math.max(0.12, 0.3 - 0.05 * learner.ability + normal(random, 0, 0.02));
  const c = 0.22;
  const s = 0.35;
  const tauLearner = -0.8 - 0.3 * learner.ability;
  return (itemDifficulty) => {
    const tau = tauLearner + 0.35 * itemDifficulty;
    const traces: { t: number; d: number }[] = [];
    const activation = (t: number): number => {
      let sum = 0;
      for (const tr of traces) sum += Math.pow(Math.max(t - tr.t, 1 / 1440), -tr.d);
      return sum === 0 ? -Infinity : Math.log(sum);
    };
    return {
      recallProbability: (t) => {
        const m = activation(t);
        return m === -Infinity ? 0 : 1 / (1 + Math.exp((tau - m) / s));
      },
      record: (t) => {
        const m = activation(t);
        traces.push({ t, d: m === -Infinity ? a : c * Math.exp(m) + a });
      },
    };
  };
};

// ---------------------------------------------------------------------------
// Felezési idős regresszió (Settles & Meeder, 2016)
// ---------------------------------------------------------------------------

/**
 * P = 2^(−Δ / h), h = 2^(θ0 + θ⊕·n⊕ + θ⊖·n⊖) nap. Az n⊕ / n⊖ a legalább
 * fél nap szünet utáni sikeres / sikertelen ismétlések száma (a perces
 * tanulási lépcsők csak frissítik az utolsó ismétlés idejét).
 */
const hlr: MemoryFactory = (learner, random) => {
  const theta0 = 2.6 + 0.5 * learner.ability + normal(random, 0, 0.15);
  const thetaPlus = 1.4 + 0.15 * learner.ability + normal(random, 0, 0.08);
  const thetaMinus = -0.3;
  return (itemDifficulty) => {
    let nPlus = 0;
    let nMinus = 0;
    let last: number | null = null;
    const halfLife = () => Math.pow(2, clamp(theta0 - 0.4 * itemDifficulty + thetaPlus * nPlus + thetaMinus * nMinus, -2, 14));
    return {
      recallProbability: (t) => (last === null ? 0 : Math.pow(2, -(t - last) / halfLife())),
      record: (t, recalled) => {
        if (last !== null && t - last >= 0.5) {
          if (recalled) nPlus++;
          else nMinus++;
        }
        last = t;
      },
    };
  };
};

// ---------------------------------------------------------------------------
// FSRS-4.5 perturbált súlyokkal
// ---------------------------------------------------------------------------

const fsrs: MemoryFactory = (learner, random) => {
  // A stabilitásért felelős súlyok tanulónként log-normálisan szórnak; a képesség el is tolja őket.
  const w = FSRS45_DEFAULT_WEIGHTS.map((x, i) => {
    if (i <= 3) return x * Math.exp(0.5 * learner.ability + normal(random, 0, 0.35));
    if (i === 8 || i === 11) return x * Math.exp(0.15 * learner.ability + normal(random, 0, 0.15));
    return x;
  });
  return (itemDifficulty) => {
    let state: FsrsMemoryState | null = null;
    let last = 0;
    return {
      recallProbability: (t) => (state === null ? 0 : fsrsRetrievability(t - last, state.stability)),
      record: (t, _recalled, grade) => {
        const rating = ratingFromSm2Grade(grade);
        if (state === null) {
          const init = fsrsInitialState(rating, w);
          state = {
            stability: init.stability * Math.exp(-0.4 * itemDifficulty),
            difficulty: clamp(init.difficulty + itemDifficulty, 1, 10),
          };
          last = t;
        } else if (t - last >= 1) {
          state = fsrsNextState(state, t - last, rating, w);
          last = t;
        }
      },
    };
  };
};

const FACTORIES: Record<MemoryModelName, MemoryFactory> = { actr, hlr, fsrs };

// ---------------------------------------------------------------------------
// Tanulói viselkedés és az alkalmazás (SM-2) ütemezése
// ---------------------------------------------------------------------------

/** Válaszminőség és reakcióidő a felidézés sikeréből és erősségéből. */
function respond(random: Random, recalled: boolean, p: number): { grade: Grade; responseTimeMs: number } {
  const u = random();
  let grade: Grade;
  let medianMs: number;
  if (recalled) {
    const easy = 0.3 * p * p;
    const hard = 0.08 + 0.45 * (1 - p);
    grade = u < easy ? 5 : u < easy + hard ? 3 : 4;
    medianMs = 2500 + 7000 * (1 - p);
  } else {
    grade = u < 0.5 ? 2 : u < 0.85 ? 1 : 0;
    medianMs = 9000;
  }
  const responseTimeMs = Math.round(Math.min(120_000, medianMs * Math.exp(normal(random, 0, 0.45))));
  return { grade, responseTimeMs };
}

export function simulateLearner(index: number, options: SimulationOptions): SimulatedLearner {
  const random = mulberry32(deriveSeed(options.seed, `${options.memoryModel}/${index}`));
  const traits: LearnerTraits = {
    ability: normal(random, 0, 0.5),
    activeProbability: uniform(random, 0.55, 0.95),
    newCardsPerDay: Math.round(uniform(random, 6, 16)),
    deckSize: Math.round(uniform(random, 150, 300)),
    priorKnowledge: uniform(random, 0.05, 0.3),
  };
  const newCard = FACTORIES[options.memoryModel](traits, random);

  // Naptár: melyik napon és mikor (nap törtrészében) nyitja meg az alkalmazást.
  const sessionStart: (number | null)[] = Array.from({ length: options.days }, () =>
    random() < traits.activeProbability ? uniform(random, 7 / 24, 22 / 24) : null,
  );

  const cards = new Map<string, SimulatedReviewEvent[]>();
  let introduced = 0;
  for (let day = 0; day < options.days && introduced < traits.deckSize; day++) {
    const start = sessionStart[day];
    if (start === null || start === undefined) continue;
    const count = Math.min(traits.newCardsPerDay, traits.deckSize - introduced);
    for (let k = 0; k < count; k++, introduced++) {
      const memory = newCard(normal(random, 0, 1));
      // Az új kártyák a munkamenet elején, fél percenként jönnek.
      cards.set(`card-${introduced}`, simulateCard(random, memory, traits, day + start + k / 2880, sessionStart, options.days));
    }
  }
  return { userId: `${options.memoryModel}-learner-${String(index + 1).padStart(3, '0')}`, cards, traits };
}

function simulateCard(
  random: Random,
  memory: CardMemory,
  traits: LearnerTraits,
  firstSeen: number,
  sessionStart: readonly (number | null)[],
  days: number,
): SimulatedReviewEvent[] {
  const events: SimulatedReviewEvent[] = [];
  let sm2: CardSchedulingState = initialCardState();
  let t: number | null = firstSeen;
  let first = true;
  // Biztonsági korlát: egy kártyának a teljes időszak alatt sem lehet ennél több értékelése.
  while (t !== null && t < days && events.length < MAX_EVENTS_PER_CARD) {
    const p = first ? traits.priorKnowledge : memory.recallProbability(t);
    const recalled = random() < p;
    const { grade, responseTimeMs } = respond(random, recalled, p);
    const reviewedAt = new Date(T0 + t * DAY_MS);
    events.push({ grade, responseTimeMs, reviewedAt, trueRecallProbability: p });
    memory.record(t, recalled, grade);
    sm2 = scheduleReview(sm2, { grade, responseTimeMs, reviewedAt }).card;
    first = false;
    t = nextReviewTime(t, (sm2.nextReviewAt!.getTime() - T0) / DAY_MS, sessionStart);
  }
  return events;
}

/**
 * Mikor ismétli ténylegesen a tanuló az `due` időpontban esedékes kártyát:
 * ha még ugyanabban a munkamenetben esedékes (tanulási lépcső), akkor
 * pontosan ekkor; különben az első olyan munkamenetben, amely az
 * esedékesség után kezdődik (kihagyott napok → késői ismétlés).
 */
function nextReviewTime(now: number, due: number, sessionStart: readonly (number | null)[]): number | null {
  if (due - now < 1 / 24) return due;
  for (let day = Math.floor(due); day < sessionStart.length; day++) {
    const start = sessionStart[day];
    if (start === null || start === undefined) continue;
    const at = day + start;
    if (at >= due) return at;
  }
  return null;
}

export function simulateLearners(options: SimulationOptions): SimulatedLearner[] {
  return Array.from({ length: options.learners }, (_, i) => simulateLearner(i, options));
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), max);
}
