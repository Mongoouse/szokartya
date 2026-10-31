// Módosított SM-2 ismétlésütemező – a szerveroldali
// `backend/src/repetition/scheduler/sm2-scheduler.ts` 1:1 megfelelője.
//
// Szerepe a kliensen: offline értékeléskor azonnali, helyi ütemezés, hogy a
// tanulás hálózat nélkül is folytatható legyen. Az így kapott állapot
// IDEIGLENES: szinkronizáláskor a szerver az értékelési eseményekből
// újraszámolja, és a pull felülírja a helyi értéket. A két implementáció
// egyezése miatt ez a felülírás normál esetben nem okoz látható változást.
//
// Bármely módosítást MINDKÉT implementáción el kell végezni: mindkét
// tesztkészlet a közös `shared/fixtures/sm2-golden.json` referenciához
// hasonlít (újragenerálás: `npm run test:golden:update` a backendben).

import 'dart:math' as math;

enum CardState { newCard, learning, review, relearning }

extension CardStateWire on CardState {
  /// A REST API / adatbázis enum-értéke.
  String get wire => switch (this) {
        CardState.newCard => 'NEW',
        CardState.learning => 'LEARNING',
        CardState.review => 'REVIEW',
        CardState.relearning => 'RELEARNING',
      };

  static CardState parse(String value) => switch (value) {
        'NEW' => CardState.newCard,
        'LEARNING' => CardState.learning,
        'REVIEW' => CardState.review,
        'RELEARNING' => CardState.relearning,
        _ => throw FormatException('Ismeretlen kártyaállapot: $value'),
      };
}

class SchedulerConfig {
  const SchedulerConfig({
    this.learningStepsMinutes = const [1, 10],
    this.relearningStepsMinutes = const [10],
    this.graduatingIntervalDays = 1,
    this.easyIntervalDays = 4,
    this.secondIntervalDays = 6,
    this.initialEaseFactor = 2.5,
    this.minEaseFactor = 1.3,
    this.maxEaseFactor = 5.0,
    this.lapseIntervalMultiplier = 0.5,
    this.maxIntervalDays = 36500,
    this.slowResponseMs = 15000,
    this.targetRetention = 0.9,
    this.responseTimeEmaAlpha = 0.3,
  });

  final List<int> learningStepsMinutes;
  final List<int> relearningStepsMinutes;
  final int graduatingIntervalDays;
  final int easyIntervalDays;
  final int secondIntervalDays;
  final double initialEaseFactor;
  final double minEaseFactor;
  final double maxEaseFactor;
  final double lapseIntervalMultiplier;
  final int maxIntervalDays;
  final int slowResponseMs;
  final double targetRetention;
  final double responseTimeEmaAlpha;

  /// A felhasználó által választott célmegtartással (a profil beállítása).
  SchedulerConfig withTargetRetention(double value) => SchedulerConfig(
        learningStepsMinutes: learningStepsMinutes,
        relearningStepsMinutes: relearningStepsMinutes,
        graduatingIntervalDays: graduatingIntervalDays,
        easyIntervalDays: easyIntervalDays,
        secondIntervalDays: secondIntervalDays,
        initialEaseFactor: initialEaseFactor,
        minEaseFactor: minEaseFactor,
        maxEaseFactor: maxEaseFactor,
        lapseIntervalMultiplier: lapseIntervalMultiplier,
        maxIntervalDays: maxIntervalDays,
        slowResponseMs: slowResponseMs,
        targetRetention: value,
        responseTimeEmaAlpha: responseTimeEmaAlpha,
      );
}

/// Az SM-2 alapintervallumai erre a felidézési valószínűségre vannak kalibrálva.
const referenceRetention = 0.9;

/// Intervallumszorzó a választott célmegtartáshoz: ln(R_cél) / ln(R_ref)
/// (a szerver `retentionIntervalFactor` függvényének megfelelője).
double retentionIntervalFactor(double targetRetention) {
  if (!(targetRetention > 0 && targetRetention < 1)) {
    throw RangeError('Érvénytelen célmegtartás: $targetRetention (0 és 1 közötti szám várt)');
  }
  return math.log(targetRetention) / math.log(referenceRetention);
}

/// Egy kártya ütemezési állapota (megváltoztathatatlan).
class CardSchedulingState {
  const CardSchedulingState({
    required this.state,
    required this.easeFactor,
    required this.intervalDays,
    required this.repetitions,
    required this.learningStep,
    required this.lapses,
    required this.totalReviews,
    required this.correctReviews,
    required this.avgResponseMs,
    required this.stabilityDays,
    required this.lastReviewedAt,
    required this.nextReviewAt,
  });

  factory CardSchedulingState.initial([SchedulerConfig config = const SchedulerConfig()]) => CardSchedulingState(
        state: CardState.newCard,
        easeFactor: config.initialEaseFactor,
        intervalDays: 0,
        repetitions: 0,
        learningStep: 0,
        lapses: 0,
        totalReviews: 0,
        correctReviews: 0,
        avgResponseMs: null,
        stabilityDays: null,
        lastReviewedAt: null,
        nextReviewAt: null,
      );

  final CardState state;
  final double easeFactor;
  final int intervalDays;
  final int repetitions;
  final int learningStep;
  final int lapses;
  final int totalReviews;
  final int correctReviews;
  final int? avgResponseMs;
  final double? stabilityDays;
  final DateTime? lastReviewedAt;
  final DateTime? nextReviewAt;

  CardSchedulingState copyWith({
    CardState? state,
    double? easeFactor,
    int? intervalDays,
    int? repetitions,
    int? learningStep,
    int? lapses,
    int? totalReviews,
    int? correctReviews,
    int? avgResponseMs,
    double? stabilityDays,
    DateTime? lastReviewedAt,
    DateTime? nextReviewAt,
  }) =>
      CardSchedulingState(
        state: state ?? this.state,
        easeFactor: easeFactor ?? this.easeFactor,
        intervalDays: intervalDays ?? this.intervalDays,
        repetitions: repetitions ?? this.repetitions,
        learningStep: learningStep ?? this.learningStep,
        lapses: lapses ?? this.lapses,
        totalReviews: totalReviews ?? this.totalReviews,
        correctReviews: correctReviews ?? this.correctReviews,
        avgResponseMs: avgResponseMs ?? this.avgResponseMs,
        stabilityDays: stabilityDays ?? this.stabilityDays,
        lastReviewedAt: lastReviewedAt ?? this.lastReviewedAt,
        nextReviewAt: nextReviewAt ?? this.nextReviewAt,
      );
}

class ScheduleResult {
  const ScheduleResult({
    required this.card,
    required this.effectiveGrade,
    required this.elapsedDays,
    required this.retrievabilityAtReview,
  });

  final CardSchedulingState card;
  final int effectiveGrade;
  final double? elapsedDays;
  final double? retrievabilityAtReview;
}

const _minuteMs = 60000;
const _dayMs = 86400000;

bool isGrade(int value) => value >= 0 && value <= 5;

/// EF' = EF + (0.1 − (5 − q)(0.08 + (5 − q)·0.02)), [min, max] közé szorítva.
double updateEaseFactor(double easeFactor, int grade, [SchedulerConfig config = const SchedulerConfig()]) {
  final d = 5 - grade;
  final next = easeFactor + (0.1 - d * (0.08 + d * 0.02));
  return _round2(_clampD(next, config.minEaseFactor, config.maxEaseFactor));
}

/// Helyes, de lassú válasznál a minőség eggyel csökken (min. 3).
int effectiveGrade(int grade, int responseTimeMs, [SchedulerConfig config = const SchedulerConfig()]) {
  if (grade >= 4 && responseTimeMs > config.slowResponseMs) return grade - 1;
  return grade;
}

/// R = exp(−t / S).
double? retrievabilityAt(CardSchedulingState card, DateTime at) {
  final s = card.stabilityDays;
  final last = card.lastReviewedAt;
  if (s == null || s <= 0 || last == null) return null;
  final elapsedDays = math.max(0, at.difference(last).inMilliseconds) / _dayMs;
  return math.exp(-elapsedDays / s);
}

/// Egy értékelés feldolgozása. A bemenetet nem módosítja.
ScheduleResult scheduleReview(
  CardSchedulingState card, {
  required int grade,
  required int responseTimeMs,
  required DateTime reviewedAt,
  SchedulerConfig config = const SchedulerConfig(),
}) {
  if (!isGrade(grade)) {
    throw RangeError.range(grade, 0, 5, 'grade');
  }
  if (responseTimeMs < 0) {
    throw RangeError.value(responseTimeMs, 'responseTimeMs', 'nem lehet negatív');
  }

  final now = reviewedAt.toUtc();
  final g = effectiveGrade(grade, responseTimeMs, config);
  final passed = g >= 3;
  final last = card.lastReviewedAt;
  final double? elapsedDays = last == null ? null : math.max(0, now.difference(last).inMilliseconds) / _dayMs;

  var next = card.copyWith(
    totalReviews: card.totalReviews + 1,
    correctReviews: card.correctReviews + (grade >= 3 ? 1 : 0),
    avgResponseMs: _ema(card.avgResponseMs, responseTimeMs, config.responseTimeEmaAlpha),
    lastReviewedAt: now,
  );

  next = switch (card.state) {
    CardState.newCard || CardState.learning => _applyLearning(next, card, g, now, config),
    CardState.review => _applyReview(next, card, g, passed, elapsedDays, now, config),
    CardState.relearning => _applyRelearning(next, card, g, passed, now, config),
  };

  final untilNextDays = math.max(next.nextReviewAt!.difference(now).inMilliseconds / _dayMs, 1 / 1440);
  next = next.copyWith(stabilityDays: _round4(untilNextDays / -math.log(config.targetRetention)));

  return ScheduleResult(
    card: next,
    effectiveGrade: g,
    elapsedDays: elapsedDays == null ? null : _round4(elapsedDays),
    retrievabilityAtReview: retrievabilityAt(card, now),
  );
}

CardSchedulingState _applyLearning(
  CardSchedulingState next,
  CardSchedulingState card,
  int grade,
  DateTime now,
  SchedulerConfig config,
) {
  final steps = config.learningStepsMinutes;
  if (grade == 5 || steps.isEmpty) {
    return _graduate(next, grade == 5 ? config.easyIntervalDays : config.graduatingIntervalDays, now);
  }
  if (grade < 3) return _toStep(next, CardState.learning, 0, steps, now);
  final nextStep = card.state == CardState.newCard ? 1 : card.learningStep + 1;
  return nextStep >= steps.length
      ? _graduate(next, config.graduatingIntervalDays, now)
      : _toStep(next, CardState.learning, nextStep, steps, now);
}

CardSchedulingState _applyReview(
  CardSchedulingState next,
  CardSchedulingState card,
  int grade,
  bool passed,
  double? elapsedDays,
  DateTime now,
  SchedulerConfig config,
) {
  final ease = updateEaseFactor(card.easeFactor, grade, config);

  if (!passed) {
    final interval = _clampI((card.intervalDays * config.lapseIntervalMultiplier).round(), 1, config.maxIntervalDays);
    final lapsed = next.copyWith(easeFactor: ease, lapses: card.lapses + 1, repetitions: 0, intervalDays: interval);
    if (config.relearningStepsMinutes.isNotEmpty) {
      return _toStep(lapsed, CardState.relearning, 0, config.relearningStepsMinutes, now);
    }
    return lapsed.copyWith(
      state: CardState.review,
      learningStep: 0,
      nextReviewAt: now.add(Duration(days: interval)),
    );
  }

  final repetitions = card.repetitions + 1;
  final scheduled = card.intervalDays;
  final actual = elapsedDays ?? scheduled.toDouble();
  final factor = retentionIntervalFactor(config.targetRetention);
  final int candidate;
  if (actual >= scheduled) {
    final base = scheduled + (actual - scheduled) / 2;
    final floor = repetitions <= 2 ? config.secondIntervalDays : scheduled + 1;
    candidate = [floor, scheduled + 1, (base * ease * factor).round()].reduce(math.max);
  } else {
    candidate = math.max(scheduled, (actual * ease * factor).round());
  }
  final interval = _clampI(candidate, 1, config.maxIntervalDays);
  return next.copyWith(
    easeFactor: ease,
    repetitions: repetitions,
    intervalDays: interval,
    state: CardState.review,
    learningStep: 0,
    nextReviewAt: now.add(Duration(days: interval)),
  );
}

CardSchedulingState _applyRelearning(
  CardSchedulingState next,
  CardSchedulingState card,
  int grade,
  bool passed,
  DateTime now,
  SchedulerConfig config,
) {
  final steps = config.relearningStepsMinutes;
  if (!passed && steps.isNotEmpty) return _toStep(next, CardState.relearning, 0, steps, now);
  final nextStep = card.learningStep + 1;
  if (grade == 5 || nextStep >= steps.length) {
    return _graduate(next, math.max(card.intervalDays, 1), now);
  }
  return _toStep(next, CardState.relearning, nextStep, steps, now);
}

CardSchedulingState _graduate(CardSchedulingState next, int intervalDays, DateTime now) => next.copyWith(
      state: CardState.review,
      learningStep: 0,
      repetitions: 1,
      intervalDays: intervalDays,
      nextReviewAt: now.add(Duration(days: intervalDays)),
    );

CardSchedulingState _toStep(CardSchedulingState next, CardState state, int step, List<int> steps, DateTime now) =>
    next.copyWith(
      state: state,
      learningStep: step,
      nextReviewAt: now.add(Duration(milliseconds: steps[step] * _minuteMs)),
    );

int _ema(int? previous, int sample, double alpha) =>
    (previous == null ? sample.toDouble() : alpha * sample + (1 - alpha) * previous).round();

double _clampD(double v, double min, double max) => math.min(math.max(v, min), max);

int _clampI(int v, int min, int max) => math.min(math.max(v, min), max);

double _round2(double v) => (v * 100).round() / 100;

double _round4(double v) => (v * 10000).round() / 10000;
