import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:szokartya/domain/sm2_scheduler.dart';

final t0 = DateTime.utc(2026, 1, 1, 8);
const day = Duration(days: 1);

CardSchedulingState reviewCard(int intervalDays, {double ease = 2.5, int lapses = 0}) => CardSchedulingState.initial().copyWith(
      state: CardState.review,
      intervalDays: intervalDays,
      repetitions: 3,
      easeFactor: ease,
      lapses: lapses,
      totalReviews: 5,
      correctReviews: 5,
      lastReviewedAt: t0,
      nextReviewAt: t0.add(day * intervalDays),
      stabilityDays: 10,
    );

ScheduleResult review(CardSchedulingState c, int grade, DateTime at, [int rt = 2000]) =>
    scheduleReview(c, grade: grade, responseTimeMs: rt, reviewedAt: at);

void main() {
  group('alapfüggvények', () {
    test('EF frissítés az SM-2 képlet szerint, [1.3, 5.0] közé szorítva', () {
      expect(updateEaseFactor(2.5, 5), closeTo(2.6, 1e-10));
      expect(updateEaseFactor(2.5, 4), closeTo(2.5, 1e-10));
      expect(updateEaseFactor(2.5, 3), closeTo(2.36, 1e-10));
      expect(updateEaseFactor(2.5, 0), closeTo(1.7, 1e-10));
      expect(updateEaseFactor(1.3, 0), 1.3);
      expect(updateEaseFactor(5.0, 5), 5.0);
    });

    test('reakcióidő-korrekció: csak helyes (≥ 4) és 15 s-nál lassabb válasznál', () {
      expect(effectiveGrade(5, 15001), 4);
      expect(effectiveGrade(4, 15000), 4);
      expect(effectiveGrade(3, 60000), 3);
      expect(effectiveGrade(1, 60000), 1);
    });

    test('érvénytelen bemenet → RangeError', () {
      expect(() => review(CardSchedulingState.initial(), 6, t0), throwsRangeError);
      expect(() => review(CardSchedulingState.initial(), -1, t0), throwsRangeError);
      expect(() => review(CardSchedulingState.initial(), 4, t0, -1), throwsRangeError);
    });

    test('a wire-formátum oda-vissza alakítható', () {
      for (final s in CardState.values) {
        expect(CardStateWire.parse(s.wire), s);
      }
      expect(() => CardStateWire.parse('X'), throwsFormatException);
    });
  });

  group('állapotátmenetek', () {
    test('új kártya → tanulási lépcsők → REVIEW 1 nap', () {
      var c = review(CardSchedulingState.initial(), 4, t0).card;
      expect(c.state, CardState.learning);
      expect(c.nextReviewAt, t0.add(const Duration(minutes: 10)));
      c = review(c, 4, c.nextReviewAt!).card;
      expect(c.state, CardState.review);
      expect(c.intervalDays, 1);
    });

    test('„könnyű” új kártya → azonnal 4 nap', () {
      expect(review(CardSchedulingState.initial(), 5, t0).card.intervalDays, 4);
    });

    test('időben: I′ = round(I · EF′); késésnél a többletidő fele beszámít', () {
      expect(review(reviewCard(10), 4, t0.add(day * 10)).card.intervalDays, 25);
      expect(review(reviewCard(10), 4, t0.add(day * 30)).card.intervalDays, 50);
    });

    test('korai ismétlés nem csökkenti az intervallumot', () {
      expect(review(reviewCard(20), 5, t0.add(day)).card.intervalDays, 20);
    });

    test('felejtés: lapses + 1, intervallum fele, RELEARNING 10 percre', () {
      final c = review(reviewCard(40, lapses: 2), 1, t0.add(day * 40)).card;
      expect(c.state, CardState.relearning);
      expect(c.lapses, 3);
      expect(c.intervalDays, 20);
      expect(c.easeFactor, 1.96);
      expect(c.nextReviewAt, t0.add(day * 40 + const Duration(minutes: 10)));
    });

    test('a maximális intervallumnál (36 500 nap) megáll', () {
      expect(review(reviewCard(30000, ease: 3), 5, t0.add(day * 30000)).card.intervalDays, 36500);
    });

    test('esedékességkor a becsült felidézési valószínűség 90%', () {
      final c = review(reviewCard(10), 4, t0.add(day * 10)).card;
      expect(retrievabilityAt(c, c.nextReviewAt!), closeTo(0.9, 1e-3));
    });
  });

  group('golden referencia (közös a TypeScript implementációval)', () {
    final golden = jsonDecode(File('../shared/fixtures/sm2-golden.json').readAsStringSync()) as Map<String, dynamic>;
    final cases = (golden['cases'] as List).cast<Map<String, dynamic>>();

    for (final c in cases) {
      test(c['name'] as String, () {
        var card = CardSchedulingState.initial();
        final steps = (c['steps'] as List).cast<Map<String, dynamic>>();
        for (var i = 0; i < steps.length; i++) {
          final input = steps[i]['input'] as Map<String, dynamic>;
          final expected = steps[i]['expected'] as Map<String, dynamic>;
          final result = scheduleReview(
            card,
            grade: input['grade'] as int,
            responseTimeMs: input['responseTimeMs'] as int,
            reviewedAt: DateTime.parse(input['reviewedAt'] as String),
          );
          card = result.card;
          final r = result.retrievabilityAtReview;
          final actual = {
            'card': {
              'state': card.state.wire,
              'easeFactor': card.easeFactor,
              'intervalDays': card.intervalDays,
              'repetitions': card.repetitions,
              'learningStep': card.learningStep,
              'lapses': card.lapses,
              'totalReviews': card.totalReviews,
              'correctReviews': card.correctReviews,
              'avgResponseMs': card.avgResponseMs,
              'stabilityDays': card.stabilityDays,
              'lastReviewedAt': card.lastReviewedAt?.toIso8601String(),
              'nextReviewAt': card.nextReviewAt?.toIso8601String(),
            },
            'effectiveGrade': result.effectiveGrade,
            'elapsedDays': result.elapsedDays,
            'retrievabilityAtReview': r == null ? null : (r * 1e6).round() / 1e6,
          };
          expect(_normalize(actual), _normalize(expected), reason: '${c['name']} – ${i + 1}. lépés');
        }
      });
    }
  });
}

/// JSON-ban az egész értékű double (2.0) és az int (2) azonos; a dátumok ISO-k.
Object? _normalize(Object? v) => switch (v) {
      final Map<String, dynamic> m => {for (final e in m.entries) e.key: _normalize(e.value)},
      final num n => n.toDouble(),
      _ => v,
    };
