import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:szokartya/data/repositories/placement_repository.dart';
import 'package:szokartya/domain/placement_bank.dart';
import 'package:szokartya/domain/placement_test.dart';
import 'package:szokartya/features/placement/placement_screen.dart';
import 'package:szokartya/providers.dart';

/// Memóriában tárolt eredmény; induláskor felajánlja a felmérőt.
class FakePlacementRepository implements PlacementRepository {
  PlacementOutcome outcome = const PlacementNotTaken();

  @override
  Future<PlacementOutcome> load() async => outcome;

  @override
  Future<bool> shouldOfferOnStart() async => outcome is PlacementNotTaken;

  @override
  Future<void> save(PlacementResult result) async => outcome = PlacementDone(result);

  @override
  Future<void> skip() async => outcome = const PlacementSkipped();

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

/// Az indítási kapu mintája (app.dart `_PlacementGate`): felmérő vagy kezdőképernyő.
class Gate extends ConsumerWidget {
  const Gate({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) => switch (ref.watch(placementOfferProvider)) {
        AsyncData(value: true) => const PlacementScreen(),
        AsyncLoading() => const SizedBox(),
        _ => const Scaffold(body: Text('Kezdőképernyő')),
      };
}

void main() {
  late FakePlacementRepository repo;

  Future<void> pump(WidgetTester tester, {Size size = const Size(400, 800)}) async {
    tester.view
      ..physicalSize = size
      ..devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    repo = FakePlacementRepository();
    await tester.pumpWidget(ProviderScope(
      overrides: [
        placementRepositoryProvider.overrideWithValue(repo),
        placementRandomProvider.overrideWithValue(Random(42)),
      ],
      child: const MaterialApp(home: Gate()),
    ));
    await tester.pumpAndSettle();
  }

  String meaningOf(WidgetTester tester) {
    final german = tester.widget<Text>(find.byKey(const Key('placementWord'))).data!;
    return placementBank.values.expand((l) => l).firstWhere((i) => i.german == german).meaning;
  }

  testWidgets('első indítás: bevezető → kérdések → eredmény → kezdőképernyő', (tester) async {
    await pump(tester);
    expect(find.text('Hol tartasz németből?'), findsOneWidget);

    await tester.tap(find.byKey(const Key('placementStart')));
    await tester.pumpAndSettle();
    expect(find.text('Szintfelmérő · A1'), findsOneWidget);

    // A1-en 4 jó válasz, A2-n háromszor „Nem tudom”.
    for (var i = 0; i < 4; i++) {
      await tester.tap(find.widgetWithText(OutlinedButton, meaningOf(tester)));
      await tester.pumpAndSettle();
    }
    expect(find.text('Szintfelmérő · A2'), findsOneWidget);
    for (var i = 0; i < 3; i++) {
      await tester.tap(find.byKey(const Key('placementDontKnow')));
      await tester.pumpAndSettle();
    }

    expect(tester.widget<Text>(find.byKey(const Key('placementLevel'))).data, 'A2');
    expect(find.text('4 / 4 helyes'), findsOneWidget);
    expect(find.text('0 / 3 helyes'), findsOneWidget);

    await tester.tap(find.byKey(const Key('placementDone')));
    await tester.pumpAndSettle();
    expect(find.text('Kezdőképernyő'), findsOneWidget);
    expect((repo.outcome as PlacementDone).result.recommendedLevel, 'A2');
  });

  testWidgets('kihagyható; fekvő kijelzőn is elfér', (tester) async {
    await pump(tester, size: const Size(800, 380));
    await tester.scrollUntilVisible(find.byKey(const Key('placementStart')), 100);
    await tester.tap(find.byKey(const Key('placementStart')));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    await tester.tap(find.byKey(const Key('placementSkip')));
    await tester.pumpAndSettle();
    expect(find.text('Kezdőképernyő'), findsOneWidget);
    expect(repo.outcome, isA<PlacementSkipped>());
  });
}
