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

  testWidgets('felidézés kártya: a beviteli mezőre koppintás nem fedi fel a választ; gépelt válasz, automatikus értékelés', (tester) async {
    final (study, _) = await pump(tester, [cardOf(tisch, CardType.production)]);
    expect(find.text('asztal'), findsOneWidget);
    expect(find.text('Hátra: 20 / 20'), findsOneWidget);

    await tester.tap(find.byKey(const Key('typedAnswer')));
    await tester.pumpAndSettle();
    expect(find.text('der Tisch'), findsNothing, reason: 'koppintásra nem fordul meg a kártya');

    await tester.enterText(find.byKey(const Key('typedAnswer')), 'Tisch');
    await tester.tap(find.text('Ellenőrzés'));
    await tester.pumpAndSettle();

    expect(find.textContaining('Majdnem'), findsOneWidget);
    expect(find.textContaining('Hiányzik a névelő.'), findsOneWidget);
    expect(find.text('der Tisch'), findsOneWidget);
    // Az automatikus értékelés naplózódik, de nem jelenik meg.
    expect(study.grades, [3]);
    expect(find.textContaining('Értékelés'), findsNothing);
    expect(find.text('Hátra: 19 / 20'), findsOneWidget);
    // Nincsenek önértékelő gombok.
    expect(find.text('Könnyű'), findsNothing);
  });

  testWidgets('„Nem tudom”: Helytelen, értékelés 1; a kártya a sor végére kerül', (tester) async {
    final (study, _) = await pump(tester, [cardOf(tisch, CardType.recognition)]);
    expect(find.byTooltip('Kiejtés'), findsNothing);
    await tester.tap(find.byKey(const Key('dontKnow')));
    await tester.pumpAndSettle();
    expect(find.textContaining('Helytelen'), findsOneWidget);
    expect(find.text('asztal'), findsOneWidget);
    expect(study.grades, [1]);
    await tester.tap(find.byKey(const Key('nextCard')));
    await tester.pumpAndSettle();
    expect(find.text('Mit jelent?'), findsOneWidget, reason: 'a hibás kártya újra előjön');
  });

  testWidgets('példamondat fordítással a kiértékelés alatt, csak a válasz után', (tester) async {
    final json = wordJson(id: 'w2', lemma: 'Tisch', translation: 'asztal')
      ..['examples'] = [
        {'sentence': 'Das Buch liegt auf dem Tisch.', 'translation': 'A könyv az asztalon fekszik.'},
      ];
    await pump(tester, [cardOf(Word.fromJson(json), CardType.recognition)]);
    expect(find.byKey(const Key('exampleSentence')), findsNothing, reason: 'a példamondat elárulná a választ');
    await tester.enterText(find.byKey(const Key('typedAnswer')), 'asztal');
    await tester.tap(find.text('Ellenőrzés'));
    await tester.pumpAndSettle();
    expect(find.text('Das Buch liegt auf dem Tisch.'), findsOneWidget);
    expect(find.text('A könyv az asztalon fekszik.'), findsOneWidget);
  });

  testWidgets('kiejtés a válasz után; nincs ékezetsor (a telefon billentyűzete adja)', (tester) async {
    final (study, speaker) = await pump(tester, [cardOf(tisch, CardType.production)]);
    expect(find.byKey(const Key('accent-ä')), findsNothing);
    await tester.enterText(find.byKey(const Key('typedAnswer')), 'der Tisch');
    await tester.tap(find.text('Ellenőrzés'));
    await tester.pumpAndSettle();
    expect(find.textContaining('Helyes'), findsOneWidget);
    expect(study.grades.single, greaterThanOrEqualTo(4));
    await tester.tap(find.byTooltip('Kiejtés'));
    expect(speaker.spoken, ['der Tisch']);
  });

  testWidgets('névelő kártya: der / die / das gombok, nincs gépelés', (tester) async {
    final (study, _) = await pump(tester, [cardOf(tisch, CardType.gender)]);
    expect(find.byKey(const Key('typedAnswer')), findsNothing);
    await tester.tap(find.byKey(const Key('article-die')));
    await tester.pumpAndSettle();
    expect(find.textContaining('Rossz névelő'), findsOneWidget);
    expect(study.grades, [1]);
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
    expect(find.text('Ellenőrzés'), findsOneWidget);
  });
}
