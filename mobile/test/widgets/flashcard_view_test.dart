import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:szokartya/data/models/study_card.dart';
import 'package:szokartya/data/models/word.dart';
import 'package:szokartya/domain/sm2_scheduler.dart';
import 'package:szokartya/features/study/flashcard_view.dart';

import '../helpers/test_support.dart';

StudyCard cardOf(Word word, CardType type) => StudyCard(
      id: 'c-${type.wire}',
      wordId: word.id,
      cardType: type,
      scheduling: CardSchedulingState.initial(),
      isSuspended: false,
      serverVersion: 0,
      word: word,
    );

void main() {
  final tisch = Word.fromJson(wordJson(id: 'w1', lemma: 'Tisch', translation: 'asztal'));
  final fahren = Word.fromJson(wordJson(
    id: 'w2',
    lemma: 'fahren',
    partOfSpeech: 'VERB',
    article: null,
    translation: 'utazik',
    verb: {'present3sg': 'fährt', 'preterite3sg': 'fuhr', 'pastParticiple': 'gefahren', 'auxiliary': 'SEIN'},
    valencies: [
      {'pattern': 'fahren mit + Dat.', 'meaning': 'valamivel utazik', 'preposition': 'mit', 'caseAbbreviation': 'Dat.', 'examples': <Object>[]},
    ],
  ));

  Future<void> show(WidgetTester tester, StudyCard card, {bool answer = false, VoidCallback? onSpeak}) => tester.pumpWidget(
        MaterialApp(home: Scaffold(body: FlashcardView(card: card, showAnswer: answer, onSpeak: onSpeak))),
      );

  final cases = <(Word, CardType, String, String, String)>[
    (tisch, CardType.recognition, 'Mit jelent?', 'der Tisch', 'asztal'),
    (tisch, CardType.production, 'Hogy mondod németül?', 'asztal', 'der Tisch'),
    (tisch, CardType.gender, 'Melyik névelő?', '___ Tisch', 'der Tisch'),
    (tisch, CardType.plural, 'Mi a többes száma?', 'der Tisch', 'die Tische'),
    (fahren, CardType.verbForms, 'Mik az alapalakjai?', 'fahren', 'fährt – fuhr – ist gefahren'),
    (fahren, CardType.valency, 'Milyen vonzata van?', 'fahren ___', 'fahren mit + Dat.'),
  ];
  for (final (word, type, label, prompt, answer) in cases) {
    testWidgets('${type.wire}: előlap és hátlap', (tester) async {
      await show(tester, cardOf(word, type));
      expect(find.text(label), findsOneWidget);
      expect(find.text(prompt), findsOneWidget);
      expect(find.text(answer), findsNothing);

      await show(tester, cardOf(word, type), answer: true);
      expect(find.text(answer), findsOneWidget);
    });
  }

  testWidgets('kiejtés gomb: felidézés kártyán csak a hátlapon (különben elárulná a választ)', (tester) async {
    var spoken = 0;
    await show(tester, cardOf(tisch, CardType.production), onSpeak: () => spoken++);
    expect(find.byTooltip('Kiejtés'), findsNothing);
    await show(tester, cardOf(tisch, CardType.production), answer: true, onSpeak: () => spoken++);
    await tester.tap(find.byTooltip('Kiejtés'));
    expect(spoken, 1);

    await show(tester, cardOf(tisch, CardType.recognition), onSpeak: () => spoken++);
    expect(find.byTooltip('Kiejtés'), findsOneWidget);
  });
}
