import '../../domain/sm2_scheduler.dart';
import 'word.dart';

enum CardType {
  recognition('RECOGNITION', 'Felismerés (német → magyar)'),
  production('PRODUCTION', 'Felidézés (magyar → német)'),
  gender('GENDER', 'Névelő (der / die / das)'),
  plural('PLURAL', 'Többes szám'),
  verbForms('VERB_FORMS', 'Igei alapalakok'),
  valency('VALENCY', 'Vonzat (elöljáró + eset)');

  const CardType(this.wire, this.label);

  final String wire;

  /// Megjelenítési név (beállítások, statisztika).
  final String label;

  static CardType parse(String value) =>
      values.firstWhere((t) => t.wire == value, orElse: () => throw FormatException('Ismeretlen kártyatípus: $value'));

  /// Képezhető-e ilyen kártya a szóból – a szerver `isCardTypeApplicable`
  /// szabályainak megfelelője (különben a szerver elutasítaná a felvételt).
  bool appliesTo(Word w) => switch (this) {
        CardType.recognition || CardType.production => true,
        CardType.gender => w.hasGender,
        CardType.plural => w.hasPlural,
        CardType.verbForms => w.hasVerbForms,
        CardType.valency => w.hasValency,
      };
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
