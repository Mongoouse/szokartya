import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
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

  /// Alapból álló telefon; [size] logikai képpontban (fekvő: pl. 800 × 380).
  Future<(FakeStudyRepository, RecordingSpeaker)> pump(
    WidgetTester tester,
    List<StudyCard> cards, {
    Size size = const Size(400, 800),
  }) async {
    tester.view
      ..physicalSize = size
      ..devicePixelRatio = 1;
    addTearDown(tester.view.reset);
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

  testWidgets('főnévnél névelőtáblázat: der → einen kiemelve, a mondatban is', (tester) async {
    final json = wordJson(id: 'w3', lemma: 'Wein', translation: 'bor')
      ..['examples'] = [
        {
          'sentence': 'Zum Essen trinken wir einen Wein.',
          'translation': 'Evéshez bort iszunk.',
          'article': {'case': 'ACCUSATIVE', 'type': 'INDEFINITE', 'number': 'SINGULAR', 'form': 'einen'},
        },
      ];
    await pump(tester, [cardOf(Word.fromJson(json), CardType.recognition)]);
    expect(find.byKey(const Key('articleTable')), findsNothing, reason: 'a válasz előtt nem látszik');
    await tester.enterText(find.byKey(const Key('typedAnswer')), 'bor');
    await tester.tap(find.text('Ellenőrzés'));
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('articleTable')), findsOneWidget);
    expect(find.text('Wein: der (hímnem) → tárgyeset, határozatlan névelő: ein + en = einen'), findsOneWidget);
    final highlight = find.byKey(const Key('articleHighlight'));
    expect(find.descendant(of: highlight, matching: find.text('einen')), findsOneWidget);
    // A mondatban a névelő külön (kiemelt) szakasz.
    final sentence = tester.widget<Text>(find.descendant(of: find.byKey(const Key('exampleSentence')), matching: find.byType(Text)));
    final spans = (sentence.textSpan! as TextSpan).children!.cast<TextSpan>();
    expect(spans.map((s) => s.text).toList(), ['Zum Essen trinken wir ', 'einen', ' Wein.']);
    expect(spans[1].style?.fontWeight, FontWeight.bold);
    // A metszet: vastag zöld, a megváltozott végződés (en) feketével aláhúzva.
    final cell = tester.widget<Text>(find.descendant(of: highlight, matching: find.byType(Text)));
    final parts = (cell.textSpan! as TextSpan).children!.cast<TextSpan>();
    expect(parts.map((s) => s.text).toList(), ['ein', 'en']);
    expect(parts[1].style?.decoration, TextDecoration.underline);
    expect(parts[1].style?.decorationColor, Colors.black);
    expect((cell.textSpan! as TextSpan).style?.fontWeight, FontWeight.bold);
    expect(find.byKey(const Key('articleIrregular')), findsNothing);
  });

  testWidgets('összevont alaknál „Rendhagyó” és az elöljáró vonzata', (tester) async {
    final json = wordJson(id: 'w5', lemma: 'Abend', translation: 'este')
      ..['examples'] = [
        {
          'sentence': 'Am Abend sehen wir fern.',
          'translation': 'Este tévét nézünk.',
          'article': {'case': 'DATIVE', 'type': 'DEFINITE', 'number': 'SINGULAR', 'form': 'Am'},
        },
      ];
    await pump(tester, [cardOf(Word.fromJson(json), CardType.recognition)]);
    await tester.enterText(find.byKey(const Key('typedAnswer')), 'este');
    await tester.tap(find.text('Ellenőrzés'));
    await tester.pumpAndSettle();
    expect(find.text('Rendhagyó: Am = an + dem, vonzat: an + Dat.'), findsOneWidget);
    expect(find.descendant(of: find.byKey(const Key('articleHighlight')), matching: find.text('dem')), findsOneWidget);
    for (final header in ['hímnem', 'nőnem', 'semleges nem', 'többes szám', 'alany e.', 'tárgy e.', 'részes eset', 'birt. e.']) {
      expect(find.text(header), findsOneWidget, reason: header);
    }
  });

  testWidgets('névelő nélküli példamondatnál nincs táblázat', (tester) async {
    final json = wordJson(id: 'w4', lemma: 'Tisch', translation: 'asztal')
      ..['examples'] = [
        {'sentence': 'Tische sind teuer.', 'translation': 'Az asztalok drágák.'},
      ];
    await pump(tester, [cardOf(Word.fromJson(json), CardType.recognition)]);
    await tester.enterText(find.byKey(const Key('typedAnswer')), 'asztal');
    await tester.tap(find.text('Ellenőrzés'));
    await tester.pumpAndSettle();
    expect(find.text('Tische sind teuer.'), findsOneWidget);
    expect(find.byKey(const Key('articleTable')), findsNothing);
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

  group('fekvő elrendezés', () {
    const landscape = Size(800, 380);

    Word wein() => Word.fromJson(wordJson(id: 'w3', lemma: 'Wein', translation: 'bor')
      ..['examples'] = [
        {
          'sentence': 'Zum Essen trinken wir einen Wein.',
          'translation': 'Evéshez bort iszunk.',
          'article': {'case': 'ACCUSATIVE', 'type': 'INDEFINITE', 'number': 'SINGULAR', 'form': 'einen'},
        },
      ]);

    testWidgets('kérdés: a válaszadás a kártya mellett, jobbra', (tester) async {
      await pump(tester, [cardOf(tisch, CardType.production)], size: landscape);
      final card = tester.getRect(find.byType(Card));
      final input = tester.getRect(find.byKey(const Key('typedAnswer')));
      final check = tester.getRect(find.byKey(const Key('checkAnswer')));
      expect(input.left, greaterThan(card.right), reason: 'a beviteli mező a kártyától jobbra');
      expect(check.left, greaterThan(card.right));
      expect(input.top, lessThan(card.bottom), reason: 'egymás mellett, nem alatta');
    });

    testWidgets('válasz: balra kártya, alatta jelzés, alatta példamondat; jobbra tördelés nélküli tömör táblázat', (tester) async {
      await pump(tester, [cardOf(wein(), CardType.recognition)], size: landscape);
      await tester.enterText(find.byKey(const Key('typedAnswer')), 'bor');
      await tester.tap(find.text('Ellenőrzés'));
      await tester.pumpAndSettle();

      final card = tester.getRect(find.byType(Card));
      final verdict = tester.getRect(find.textContaining('Helyes'));
      final sentence = tester.getRect(find.byKey(const Key('exampleSentence')));
      final table = tester.getRect(find.byKey(const Key('articleTable')));
      final next = tester.getRect(find.byKey(const Key('nextCard')));

      // Bal oszlop: kártya → jelzés → példamondat (a példamondat már nem a kártyán van).
      expect(find.descendant(of: find.byType(Card), matching: find.byKey(const Key('exampleSentence'))), findsNothing);
      expect(verdict.top, greaterThanOrEqualTo(card.bottom));
      expect(sentence.top, greaterThanOrEqualTo(verdict.bottom));
      expect(find.text('Evéshez bort iszunk.'), findsOneWidget);

      // Jobb oszlop: táblázat, alatta a Tovább gomb.
      expect(table.left, greaterThan(card.right));
      expect(table.left, greaterThan(sentence.right));
      expect(next.left, greaterThan(card.right));
      expect(next.top, greaterThanOrEqualTo(table.bottom));

      // A táblázat összenyomva: legfeljebb a szélesség 45%-a, a bal oldal kapja a többit.
      expect(tester.getSize(find.byKey(const Key('landscapeAnswerPanel'))).width, lessThanOrEqualTo(800 * 0.45));
      expect(card.width, greaterThan(table.width));

      // Egyik cellában sincs sortörés: minden szöveg megkapta a teljes kívánt szélességét.
      for (final element in find.descendant(of: find.byType(Table), matching: find.byType(RichText)).evaluate()) {
        final paragraph = element.renderObject! as RenderParagraph;
        expect(
          paragraph.getMaxIntrinsicWidth(double.infinity),
          lessThanOrEqualTo(paragraph.size.width + 0.01),
          reason: '„${paragraph.text.toPlainText()}” nem tördelődhet',
        );
      }
      expect(find.byKey(const Key('articleHighlight')), findsOneWidget);
    });

    testWidgets('névelő nélküli szónál is jobbra kerül a Tovább gomb', (tester) async {
      await pump(tester, [cardOf(tisch, CardType.recognition)], size: landscape);
      await tester.tap(find.byKey(const Key('dontKnow')));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('articleTable')), findsNothing);
      expect(tester.getRect(find.byKey(const Key('nextCard'))).left, greaterThan(tester.getRect(find.byType(Card)).right));
      await tester.tap(find.byKey(const Key('nextCard')));
      await tester.pumpAndSettle();
      expect(find.text('Mit jelent?'), findsOneWidget);
    });
  });

  testWidgets('álló elrendezésben a kártya alatt marad a válaszadás', (tester) async {
    await pump(tester, [cardOf(tisch, CardType.production)]);
    expect(find.byKey(const Key('landscapeQuestionPanel')), findsNothing);
    expect(tester.getRect(find.byKey(const Key('typedAnswer'))).top, greaterThan(tester.getRect(find.byType(Card)).bottom));
  });
}
