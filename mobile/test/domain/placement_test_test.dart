import 'dart:math';

import 'package:flutter_test/flutter_test.dart';
import 'package:szokartya/domain/placement_bank.dart';
import 'package:szokartya/domain/placement_test.dart';

/// Mindig jól (vagy rosszul) válaszol, amíg [knownLevels] szintjein jár.
PlacementResult runTest(PlacementTest test, {required Set<String> knownLevels}) {
  while (!test.isFinished) {
    final q = test.current!;
    test.answer(knownLevels.contains(q.item.level) ? q.item.meaning : null);
  }
  return test.result;
}

void main() {
  group('itemkészlet (generált)', () {
    test('minden szinten elég szó és szófajonként elég tévesztő', () {
      expect(placementBank.keys, ['A1', 'A2', 'B1', 'B2', 'C1']);
      for (final MapEntry(key: level, value: items) in placementBank.entries) {
        expect(items.length, greaterThanOrEqualTo(6), reason: level);
        expect(items.every((i) => i.level == level), isTrue, reason: level);
        expect(items.map((i) => i.meaning).toSet().length, items.length, reason: '$level: egyedi jelentések');
        for (final pos in items.map((i) => i.partOfSpeech).toSet()) {
          expect(items.where((i) => i.partOfSpeech == pos).length, greaterThanOrEqualTo(4), reason: '$level $pos');
        }
      }
    });

    test('egy szó csak egy szinten szerepel', () {
      final all = [for (final items in placementBank.values) ...items.map((i) => i.german)];
      expect(all.toSet().length, all.length);
    });
  });

  group('PlacementTest', () {
    test('kérdés: 4 különböző lehetőség, köztük a helyes; azonos szófajú tévesztők', () {
      final t = PlacementTest(random: Random(1));
      for (var i = 0; i < 20 && !t.isFinished; i++) {
        final q = t.current!;
        expect(q.options, hasLength(4));
        expect(q.options.toSet(), hasLength(4));
        expect(q.options, contains(q.item.meaning));
        final level = placementBank[q.item.level]!;
        for (final o in q.options) {
          expect(level.firstWhere((i) => i.meaning == o).partOfSpeech, q.item.partOfSpeech);
        }
        t.answer(q.item.meaning);
      }
    });

    test('kezdő: az A1-en elbukik 3 hibával → A1 ajánlott', () {
      final t = PlacementTest(random: Random(2));
      final r = runTest(t, knownLevels: {});
      expect(r.recommendedLevel, 'A1');
      expect(r.passedLevels, isEmpty);
      expect(r.scores.single, (level: 'A1', correct: 0, asked: 3, passed: false));
    });

    test('A1–A2 megy, B1 nem → B1 ajánlott; teljesített szint 4 helyesnél véget ér', () {
      final r = runTest(PlacementTest(random: Random(3)), knownLevels: {'A1', 'A2'});
      expect(r.recommendedLevel, 'B1');
      expect(r.passedLevels, ['A1', 'A2']);
      expect(r.scores.map((s) => s.asked), [4, 4, 3]);
    });

    test('minden szint megy → a legfelső (C1) ajánlott', () {
      final r = runTest(PlacementTest(random: Random(4)), knownLevels: {...placementBank.keys});
      expect(r.recommendedLevel, 'C1');
      expect(r.allPassed, isTrue);
      expect(r.scores, hasLength(5));
    });

    test('vegyes válaszok: 6 kérdésből 4 helyes még teljesítés, a 3. hiba bukás', () {
      final t = PlacementTest(random: Random(5));
      // A1: hiba, jó, hiba, jó, jó, jó → 4/6 teljesítve
      for (final ok in [false, true, false, true, true, true]) {
        expect(t.currentLevel, 'A1');
        final q = t.current!;
        t.answer(ok ? q.item.meaning : q.options.firstWhere((o) => o != q.item.meaning));
      }
      expect(t.currentLevel, 'A2');
      // A2: jó, hiba, hiba, hiba → bukás
      for (final ok in [true, false, false, false]) {
        final q = t.current!;
        t.answer(ok ? q.item.meaning : null);
      }
      expect(t.isFinished, isTrue);
      expect(t.answered, 10);
      expect(t.result.scores, [
        (level: 'A1', correct: 4, asked: 6, passed: true),
        (level: 'A2', correct: 1, asked: 4, passed: false),
      ]);
      expect(t.result.recommendedLevel, 'A2');
      expect(() => t.answer(null), throwsStateError);
    });

    test('az eredmény JSON-ban oda-vissza alakítható', () {
      final r = runTest(PlacementTest(random: Random(6)), knownLevels: {'A1'});
      final back = PlacementResult.decode(r.encode());
      expect(back.recommendedLevel, r.recommendedLevel);
      expect(back.scores, r.scores);
    });

    test('a felmérés közben az eredmény nem kérhető le', () {
      expect(() => PlacementTest(random: Random(7)).result, throwsStateError);
    });
  });
}
