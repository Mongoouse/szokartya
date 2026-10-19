import 'package:flutter_test/flutter_test.dart';
import 'package:szokartya/domain/answer_check.dart';

void main() {
  test('normalizálás: kisbetű, írásjel, szóközök, umlaut és ß', () {
    expect(normalizeAnswer('  Der   Fuß! '), 'der fuss');
    expect(normalizeAnswer('Mädchen'), 'maedchen');
    expect(normalizeAnswer('„sich freuen”'), 'sich freuen');
  });

  test('pontos egyezés kis-nagybetűtől és umlaut-átírástól függetlenül', () {
    expect(checkAnswer('der tisch', 'der Tisch').verdict, AnswerVerdict.correct);
    expect(checkAnswer('das Maedchen', 'das Mädchen').verdict, AnswerVerdict.correct);
    expect(checkAnswer('sich freuen', 'sich freuen').verdict, AnswerVerdict.correct);
  });

  test('hiányzó névelő: majdnem; rossz névelő: hibás', () {
    final missing = checkAnswer('Tisch', 'der Tisch');
    expect(missing.verdict, AnswerVerdict.almost);
    expect(missing.hint, 'Hiányzik a névelő.');
    final wrong = checkAnswer('die Tisch', 'der Tisch');
    expect(wrong.verdict, AnswerVerdict.wrong);
    expect(wrong.hint, 'Rossz névelő.');
  });

  test('egy elütés hosszabb szónál: majdnem; rövid szónál vagy több hibánál: hibás', () {
    expect(checkAnswer('der Bahnhoff', 'der Bahnhof').verdict, AnswerVerdict.almost);
    expect(checkAnswer('die Kazte', 'die Katze').verdict, AnswerVerdict.wrong); // csere = 2 szerkesztés
    expect(checkAnswer('der Tich', 'der Tisch').verdict, AnswerVerdict.almost);
    expect(checkAnswer('gut', 'gur').verdict, AnswerVerdict.wrong);
    expect(checkAnswer('', 'der Tisch').verdict, AnswerVerdict.wrong);
  });

  test('javasolt értékelés', () {
    expect(AnswerVerdict.correct.suggestedGrade, 4);
    expect(AnswerVerdict.almost.suggestedGrade, 3);
    expect(AnswerVerdict.wrong.suggestedGrade, 1);
  });
}
