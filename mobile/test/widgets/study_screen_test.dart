import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:szokartya/core/tts/speaker.dart';
import 'package:szokartya/data/models/study_card.dart';
import 'package:szokartya/data/models/word.dart';
import 'package:szokartya/data/repositories/report_repository.dart';
import 'package:szokartya/data/repositories/study_repository.dart';
import 'package:szokartya/features/study/study_screen.dart';
import 'package:szokartya/features/sync/sync_controller.dart';
import 'package:szokartya/providers.dart';

import '../helpers/test_support.dart';
import 'flashcard_view_test.dart' show cardOf;

/// Adatbázis nélküli tanulási réteg: egy rögzített sor, értékelések naplózása.
class FakeStudyRepository implements StudyRepository {
  FakeStudyRepository(this.cards);

  final List<StudyCard> cards;
  final grades = <int>[];

  @override
  Future<StudyQueue> loadQueue({int limit = 200}) async =>
      StudyQueue(learning: const [], reviews: const [], newCards: cards, dayEndsAt: DateTime.utc(2026, 3, 10, 23));

  @override
  Future<Map<int, Duration>> previewIntervals(StudyCard card, {required int responseTimeMs}) async =>
      {1: const Duration(minutes: 1), 3: const Duration(minutes: 6), 4: const Duration(minutes: 10), 5: const Duration(days: 4)};

  @override
  Future<StudyCard> review(StudyCard card, {required int grade, required int responseTimeMs}) async {
    grades.add(grade);
    return card;
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class RecordingReports implements ReportRepository {
  final sent = <({String wordId, ReportCategory category, String message, CardType? cardType})>[];

  @override
  Future<String> report({required String wordId, required ReportCategory category, required String message, CardType? cardType}) async {
    sent.add((wordId: wordId, category: category, message: message, cardType: cardType));
    return 'r1';
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class SilentSync extends SyncController {
  @override
  SyncStatus build() => const SyncStatus();

  @override
  void scheduleSync() {}
}

class RecordingSpeaker implements Speaker {
  final spoken = <String>[];

  @override
  Future<void> speak(String text) async => spoken.add(text);
}

void main() {
  final tisch = Word.fromJson(wordJson(id: 'w1', lemma: 'Tisch', translation: 'asztal'));

  late RecordingReports reports;

  Future<(FakeStudyRepository, RecordingSpeaker)> pump(WidgetTester tester, List<StudyCard> cards) async {
    final study = FakeStudyRepository(cards);
    final speaker = RecordingSpeaker();
    reports = RecordingReports();
    await tester.pumpWidget(ProviderScope(
      overrides: [
        reportRepositoryProvider.overrideWithValue(reports),
        studyRepositoryProvider.overrideWithValue(study),
        syncControllerProvider.overrideWith(SilentSync.new),
        speakerProvider.overrideWithValue(speaker),
      ],
      child: const MaterialApp(home: StudyScreen()),
    ));
    await tester.pumpAndSettle();
    return (study, speaker);
  }

  testWidgets('felidézés kártya: gépelt válasz ellenőrzése, javasolt értékelés kiemelve', (tester) async {
    final (study, _) = await pump(tester, [cardOf(tisch, CardType.production)]);
    expect(find.text('asztal'), findsOneWidget);

    await tester.enterText(find.byKey(const Key('typedAnswer')), 'Tisch');
    await tester.tap(find.text('Ellenőrzés'));
    await tester.pumpAndSettle();

    expect(find.textContaining('Majdnem'), findsOneWidget);
    expect(find.textContaining('Hiányzik a névelő.'), findsOneWidget);
    expect(find.text('der Tisch'), findsOneWidget);
    // A „Nehéz” (3) gomb a javasolt – kiemelt (tonal) stílussal.
    expect(find.widgetWithText(FilledButton, 'Nehéz'), findsOneWidget);
    expect(find.widgetWithText(OutlinedButton, 'Jó'), findsOneWidget);

    await tester.tap(find.text('Nehéz'));
    await tester.pumpAndSettle();
    expect(study.grades, [3]);
    expect(find.text('Mára végeztél!'), findsOneWidget);
  });

  testWidgets('üres válasszal a kártya egyszerűen megfordul, ellenőrzés nélkül', (tester) async {
    await pump(tester, [cardOf(tisch, CardType.production)]);
    await tester.tap(find.text('Ellenőrzés'));
    await tester.pumpAndSettle();
    expect(find.text('der Tisch'), findsOneWidget);
    expect(find.textContaining('Majdnem'), findsNothing);
    expect(find.byType(FilledButton), findsNothing);
  });

  testWidgets('értékelő gombok: akadálymentes címke az intervallummal; kiejtés', (tester) async {
    final (_, speaker) = await pump(tester, [cardOf(tisch, CardType.recognition)]);
    await tester.tap(find.byTooltip('Kiejtés'));
    expect(speaker.spoken, ['der Tisch']);

    await tester.tap(find.text('Mutasd a választ'));
    await tester.pumpAndSettle();
    expect(find.bySemanticsLabel('Értékelés: Könnyű, következő ismétlés 4 nap múlva'), findsOneWidget);
  });

  testWidgets('hibabejelentés: a zászló gomb párbeszédablakot nyit, üres szöveget nem küld, a kártya adataival rögzít', (tester) async {
    await pump(tester, [cardOf(tisch, CardType.recognition)]);
    await tester.tap(find.byKey(const Key('reportWord')));
    await tester.pumpAndSettle();
    expect(find.textContaining('Hiba bejelentése'), findsOneWidget);

    await tester.tap(find.text('Küldés'));
    await tester.pumpAndSettle();
    expect(find.text('Írd le röviden, mi a hiba.'), findsOneWidget);
    expect(reports.sent, isEmpty);

    await tester.enterText(find.byKey(const Key('reportMessage')), 'Nem asztal, hanem szék.');
    await tester.tap(find.text('Küldés'));
    await tester.pumpAndSettle();
    expect(reports.sent.single, (
      wordId: 'w1',
      category: ReportCategory.translation,
      message: 'Nem asztal, hanem szék.',
      cardType: CardType.recognition,
    ));
    expect(find.textContaining('Köszönjük'), findsOneWidget);
    // A tanulás ugyanott folytatódik.
    expect(find.text('Mutasd a választ'), findsOneWidget);
  });
}
