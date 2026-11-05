/// Névelőtáblázat: a der/ein/kein (és a birtokos névmások) ragozása, és az, hogy
/// egy példamondat névelője a táblázat melyik cellájából származik.
///
/// A szerver a főnévi példamondathoz megadja a névelő esetét, fajtáját, számát
/// és mondatbeli alakját (pl. „Zum Essen trinken wir einen Wein.” → tárgyeset,
/// határozatlan, egyes szám, „einen”). A táblázat oszlopa a főnév nemétől
/// (der → hímnem) vagy a többes számtól függ, így látszik a kapcsolat:
/// der → ein**en**.
library;

enum ArticleCase {
  nominative('NOMINATIVE', 'Nom.', 'alany e.', 'alanyeset'),
  accusative('ACCUSATIVE', 'Akk.', 'tárgy e.', 'tárgyeset'),
  dative('DATIVE', 'Dat.', 'részes eset', 'részes eset'),
  genitive('GENITIVE', 'Gen.', 'birt. e.', 'birtokos eset');

  const ArticleCase(this.code, this.abbreviation, this.label, this.nameHu);

  final String code;

  /// Német rövidítés a vonzat jelöléséhez (an + Dat.).
  final String abbreviation;

  /// A táblázat sorának fejléce.
  final String label;
  final String nameHu;
}

enum ArticleType {
  definite('DEFINITE', 'határozott névelő'),
  indefinite('INDEFINITE', 'határozatlan névelő'),
  negative('NEGATIVE', 'tagadó névelő'),
  possessive('POSSESSIVE', 'birtokos névmás');

  const ArticleType(this.code, this.nameHu);

  final String code;
  final String nameHu;
}

/// A táblázat oszlopai: a három nem és a többes szám.
enum ArticleColumn {
  masculine('hímnem', 'der'),
  feminine('nőnem', 'die'),
  neuter('semleges nem', 'das'),
  plural('többes szám', 'die');

  const ArticleColumn(this.nameHu, this.definite);

  final String nameHu;

  /// A határozott névelő alanyesetben – ez a főnév „vonzata” (der Wein).
  final String definite;

  static ArticleColumn? fromGender(String? gender) => switch (gender) {
        'MASCULINE' => masculine,
        'FEMININE' => feminine,
        'NEUTER' => neuter,
        _ => null,
      };
}

/// Egy cella: tő + végződés (ein + en), hogy a végződés kiemelhető legyen.
class ArticleCellForm {
  const ArticleCellForm(this.stem, this.ending);

  final String stem;
  final String ending;

  String get text => stem + ending;
}

const _definite = <ArticleColumn, List<String>>{
  ArticleColumn.masculine: ['der', 'den', 'dem', 'des'],
  ArticleColumn.feminine: ['die', 'die', 'der', 'der'],
  ArticleColumn.neuter: ['das', 'das', 'dem', 'des'],
  ArticleColumn.plural: ['die', 'die', 'den', 'der'],
};

const _einEndings = <ArticleColumn, List<String>>{
  ArticleColumn.masculine: ['', 'en', 'em', 'es'],
  ArticleColumn.feminine: ['e', 'e', 'er', 'er'],
  ArticleColumn.neuter: ['', '', 'em', 'es'],
  ArticleColumn.plural: ['e', 'e', 'en', 'er'],
};

const _possessiveStems = ['unser', 'euer', 'mein', 'dein', 'sein', 'ihr'];

/// Elöljáró + határozott névelő összevonások (zum = zu + dem).
const contractions = <String, (String, String)>{
  'zum': ('zu', 'dem'),
  'zur': ('zu', 'der'),
  'im': ('in', 'dem'),
  'am': ('an', 'dem'),
  'vom': ('von', 'dem'),
  'beim': ('bei', 'dem'),
  'ins': ('in', 'das'),
  'ans': ('an', 'das'),
  'aufs': ('auf', 'das'),
  'durchs': ('durch', 'das'),
  'fürs': ('für', 'das'),
  'ums': ('um', 'das'),
  'hinterm': ('hinter', 'dem'),
  'überm': ('über', 'dem'),
  'unterm': ('unter', 'dem'),
  'vorm': ('vor', 'dem'),
};

/// A táblázat egy cellája; null, ha nincs ilyen alak (ein többes számban).
ArticleCellForm? articleCell(
  ArticleCase grammaticalCase,
  ArticleType type,
  ArticleColumn column, {
  String possessiveStem = 'mein',
}) {
  final i = grammaticalCase.index;
  if (type == ArticleType.definite) return ArticleCellForm(_definite[column]![i], '');
  if (type == ArticleType.indefinite && column == ArticleColumn.plural) return null;
  final stem = switch (type) {
    ArticleType.indefinite => 'ein',
    ArticleType.negative => 'kein',
    _ => possessiveStem,
  };
  final ending = _einEndings[column]![i];
  // euer + e → eure: a hangsúlytalan e kiesik.
  if (stem == 'euer' && ending.isNotEmpty) return ArticleCellForm('eur', ending);
  return ArticleCellForm(stem, ending);
}

/// Egy példamondat főnév előtti névelője, ahogy a szerver küldi.
class ExampleArticle {
  const ExampleArticle({required this.grammaticalCase, required this.type, required this.plural, required this.form});

  /// null, ha a mező hiányzik vagy ismeretlen értéket tartalmaz (régebbi/újabb szerver).
  static ExampleArticle? fromJson(Object? json) {
    if (json is! Map) return null;
    final c = ArticleCase.values.where((v) => v.code == json['case']);
    final t = ArticleType.values.where((v) => v.code == json['type']);
    final number = json['number'];
    final form = json['form'];
    if (c.isEmpty || t.isEmpty || form is! String || (number != 'SINGULAR' && number != 'PLURAL')) return null;
    return ExampleArticle(grammaticalCase: c.first, type: t.first, plural: number == 'PLURAL', form: form);
  }

  final ArticleCase grammaticalCase;
  final ArticleType type;
  final bool plural;

  /// A pontos mondatbeli alak (Einen, zum …).
  final String form;

  /// Összevont alaknál az elöljáró és a benne rejlő névelő (zum → zu + dem).
  (String, String)? get contraction => contractions[form.toLowerCase()];

  /// Birtokos névmás töve (meinen → mein, eure → euer).
  String get possessiveStem {
    final lower = form.toLowerCase();
    if (lower.startsWith('eur')) return 'euer';
    return _possessiveStems.firstWhere(lower.startsWith, orElse: () => 'mein');
  }

  /// A táblázat oszlopa a főnév neméből; többes számban mindig a többes oszlop.
  ArticleColumn? column(ArticleColumn? gender) => plural ? ArticleColumn.plural : gender;

  ArticleCellForm? cell(ArticleCase c, ArticleColumn column) =>
      articleCell(c, type, column, possessiveStem: possessiveStem);
}
