import 'package:flutter_test/flutter_test.dart';
import 'package:szokartya/data/local/local_store.dart';
import 'package:szokartya/data/repositories/placement_repository.dart';
import 'package:szokartya/data/repositories/study_repository.dart';
import 'package:szokartya/domain/placement_test.dart';

import '../helpers/test_support.dart';

void main() {
  late LocalStore store;
  late PlacementRepository placement;
  final clock = FakeClock(DateTime.utc(2026, 3, 10, 9));

  setUp(() async {
    store = LocalStore(await openTestDatabase());
    await seedProfile(store);
    placement = PlacementRepository(store: store, clock: clock);
  });

  const result = PlacementResult(
    recommendedLevel: 'A2',
    scores: [
      (level: 'A1', correct: 4, asked: 5, passed: true),
      (level: 'A2', correct: 1, asked: 4, passed: false),
    ],
  );

  test('új felhasználónak induláskor felajánljuk', () async {
    expect(await placement.load(), isA<PlacementNotTaken>());
    expect(await placement.shouldOfferOnStart(), isTrue);
  });

  test('kitöltés után az eredmény megmarad, és többé nem ajánljuk fel', () async {
    await placement.save(result);
    final outcome = await placement.load();
    expect(outcome, isA<PlacementDone>());
    expect((outcome as PlacementDone).result.recommendedLevel, 'A2');
    expect(await placement.shouldOfferOnStart(), isFalse);
  });

  test('kihagyás után sem ajánljuk fel újra', () async {
    await placement.skip();
    expect(await placement.load(), isA<PlacementSkipped>());
    expect(await placement.shouldOfferOnStart(), isFalse);
  });

  test('meglévő (már tanuló) felhasználót nem állítunk meg', () async {
    await store.applyServerWords([wordJson(id: 'w1')]);
    await StudyRepository(store: store, clock: clock).enrollWords(await store.unenrolledWords(cefrLevel: 'A1'));
    expect(await placement.shouldOfferOnStart(), isFalse);
  });

  test('kijelentkezéskor (helyi adatok törlése) az eredmény is törlődik', () async {
    await placement.save(result);
    await store.wipe();
    expect(await placement.load(), isA<PlacementNotTaken>());
  });
}
