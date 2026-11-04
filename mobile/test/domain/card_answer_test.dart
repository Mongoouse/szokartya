import 'package:flutter_test/flutter_test.dart';
import 'package:szokartya/data/models/study_card.dart';
import 'package:szokartya/data/models/word.dart';
import 'package:szokartya/domain/answer_check.dart';
import 'package:szokartya/domain/card_answer.dart';
import 'package:szokartya/domain/sm2_scheduler.dart';

import '../helpers/test_support.dart';

StudyCard _card(Word word, CardType type, {int total = 0, int correct = 0}) => StudyCard(
      id: 'c',
      wordId: word.id,
      cardType: type,
      scheduling: CardSchedulingState.initial().copyWith(totalReviews: total, correctReviews: correct),
      isSuspended: false,
      serverVersion: 0,
      word: word,
    );

void main() {
  final tisch = Word.fromJson(wordJson(id: 'w1', lemma: 'Tisch', translation: 'asztal', pluralForm: 'Tische'));
  final fahren = Word.fromJson(wordJson(
    id: 'w2',
    lemma: 'fahren',
    partOfSpeech: 'VERB',
    article: null,
    translation: 'utazik (járművel)',
    verb: {'present3sg': 'fährt', 'preterite3sg': 'fuhr', 'pastParticiple': 'gefahren', 'auxiliary': 'SEIN'},
    valencies: [
      {'pattern': 'fahren mit + Dat.', 'meaning': 'valamivel utazik', 'preposition': 'mit', 'caseAbbreviation': 'Dat.', 'examples': <Object>[]},
    ],
  ));
  final warten = Word.fromJson(wordJson(id: 'w3', lemma: 'warten', partOfSpeech: 'VERB', article: null, translation: 'vár vkire'));

  AnswerVerdict verdict(Word w, CardType t, String typed) => checkCardAnswer(_card(w, t), typed).verdict;

  test('felismerés: magyar jelentés, zárójeles megjegyzés és vki/vmi elhagyható, ékezethiba = majdnem', () {
    expect(verdict(tisch, CardType.recognition, 'asztal'), AnswerVerdict.correct);
    expect(verdict(tisch, CardType.recognition, ' Asztal. '), AnswerVerdict.correct);
    expect(verdict(fahren, CardType.recognition, 'utazik'), AnswerVerdict.correct);
    expect(verdict(warten, CardType.recognition, 'vár'), AnswerVerdict.correct);
    expect(verdict(warten, CardType.recognition, 'var'), AnswerVerdict.almost);
    expect(verdict(tisch, CardType.recognition, 'szék'), AnswerVerdict.wrong);
    expect(verdict(tisch, CardType.recognition, ''), AnswerVerdict.wrong);
  });

  test('felidézés: névelővel helyes, nélküle majdnem; umlaut helyett ae is jó', () {
    expect(verdict(tisch, CardType.production, 'der Tisch'), AnswerVerdict.correct);
    expect(verdict(tisch, CardType.production, 'Tisch'), AnswerVerdict.almost);
    expect(verdict(tisch, CardType.production, 'das Tisch'), AnswerVerdict.wrong);
  });

  test('névelő, többes szám', () {
    expect(verdict(tisch, CardType.gender, 'der'), AnswerVerdict.correct);
    expect(verdict(tisch, CardType.gender, 'die'), AnswerVerdict.wrong);
    expect(verdict(tisch, CardType.plural, 'die Tische'), AnswerVerdict.correct);
    expect(verdict(tisch, CardType.plural, 'Tische'), AnswerVerdict.correct);
    expect(verdict(tisch, CardType.plural, 'Tischen'), AnswerVerdict.almost);
    expect(verdict(tisch, CardType.plural, 'Tisch'), AnswerVerdict.wrong);
  });

  test('igei alapalakok: bármilyen elválasztóval; segédige nélkül majdnem', () {
    expect(verdict(fahren, CardType.verbForms, 'fährt, fuhr, ist gefahren'), AnswerVerdict.correct);
    expect(verdict(fahren, CardType.verbForms, 'faehrt - fuhr - ist gefahren'), AnswerVerdict.correct);
    expect(verdict(fahren, CardType.verbForms, 'fährt fuhr gefahren'), AnswerVerdict.almost);
    expect(verdict(fahren, CardType.verbForms, 'fährt fuhr hat gefahren'), AnswerVerdict.wrong);
  });

  test('vonzat: elöljáró + eset, rövidítve vagy kiírva, az ige elhagyható', () {
    expect(verdict(fahren, CardType.valency, 'mit + Dat.'), AnswerVerdict.correct);
    expect(verdict(fahren, CardType.valency, 'mit Dativ'), AnswerVerdict.correct);
    expect(verdict(fahren, CardType.valency, 'fahren mit dat'), AnswerVerdict.correct);
    final wrongCase = checkCardAnswer(_card(fahren, CardType.valency), 'mit Akk');
    expect(wrongCase.verdict, AnswerVerdict.wrong);
    expect(wrongCase.hint, 'Jó elöljáró, rossz eset.');
  });

  test('automatikus értékelés: helyesség + megoldási idő + találati arány', () {
    final card = _card(tisch, CardType.production);
    expect(autoGrade(verdict: AnswerVerdict.wrong, responseTimeMs: 1000, card: card), 1);
    expect(autoGrade(verdict: AnswerVerdict.almost, responseTimeMs: 1000, card: card), 3);
    // „der Tisch” = 9 karakter → gyors ≤ 4 + 4,5 = 8,5 s; átlagos ≤ 10 + 9 = 19 s.
    expect(autoGrade(verdict: AnswerVerdict.correct, responseTimeMs: 8500, card: card), 5);
    expect(autoGrade(verdict: AnswerVerdict.correct, responseTimeMs: 8501, card: card), 4);
    expect(autoGrade(verdict: AnswerVerdict.correct, responseTimeMs: 19000, card: card), 4);
    expect(autoGrade(verdict: AnswerVerdict.correct, responseTimeMs: 19001, card: card), 3);
    // Gyakran elrontott kártya: a gyors helyes válasz is csak „jó”.
    final hard = _card(tisch, CardType.production, total: 5, correct: 2);
    expect(autoGrade(verdict: AnswerVerdict.correct, responseTimeMs: 3000, card: hard), 4);
  });
}
