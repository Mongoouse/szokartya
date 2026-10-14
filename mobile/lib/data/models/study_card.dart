import '../../domain/sm2_scheduler.dart';
import 'word.dart';

enum CardType {
  recognition('RECOGNITION'),
  production('PRODUCTION'),
  gender('GENDER');

  const CardType(this.wire);

  final String wire;

  static CardType parse(String value) =>
      values.firstWhere((t) => t.wire == value, orElse: () => throw FormatException('Ismeretlen kártyatípus: $value'));
}

/// Egy tanulókártya a helyi adatbázisból: ütemezési állapot + a szó.
class StudyCard {
  const StudyCard({
    required this.id,
    required this.wordId,
    required this.cardType,
    required this.scheduling,
    required this.isSuspended,
    required this.serverVersion,
    required this.word,
  });

  final String id;
  final String wordId;
  final CardType cardType;
  final CardSchedulingState scheduling;
  final bool isSuspended;

  /// Az utoljára a szervertől kapott verzió (0 = még nem volt szinkronizálva).
  final int serverVersion;
  final Word word;

  StudyCard copyWith({CardSchedulingState? scheduling}) => StudyCard(
        id: id,
        wordId: wordId,
        cardType: cardType,
        scheduling: scheduling ?? this.scheduling,
        isSuspended: isSuspended,
        serverVersion: serverVersion,
        word: word,
      );
}
