import '../../core/api/api_client.dart';

/// Egy szó a kártyán megjelenítendő adataival.
///
/// A szerver `WordDto` / `WordSyncDto` JSON-ját nyersen (payload) tároljuk a
/// helyi adatbázisban, és megjelenítéskor ebből a típusos nézetből olvassuk –
/// így a szerveroldali séma bővülése nem igényel helyi migrációt.
class Word {
  const Word(this._json);

  factory Word.fromJson(Json json) => Word(json);

  final Json _json;

  Json toJson() => _json;

  String get id => _json['id'] as String;
  String get lemma => _json['lemma'] as String;

  /// Megjelenítési alak névelővel / „sich”-kel (der Tisch, sich freuen).
  String get display => _json['display'] as String? ?? lemma;
  String get partOfSpeech => _json['partOfSpeech'] as String;
  String? get cefrLevel => _json['cefrLevel'] as String?;
  String? get ipa => _json['ipa'] as String?;
  int get version => (_json['version'] as num?)?.toInt() ?? 0;

  /// A felhasználó saját (nem a központi szótárból származó) szava.
  bool get isCustom => _json['isCustom'] == true;
  bool get isDeleted => _json['deletedAt'] != null;

  /// Központi szónál az emberi ellenőrzöttség (UNREVIEWED / VERIFIED / REJECTED); saját szónál null.
  String? get reviewStatus => _json['reviewStatus'] as String?;
  bool get isVerified => reviewStatus == 'VERIFIED';

  /// der / die / das (csak nemmel rendelkező főnévnél).
  String? get article => _noun?['article'] as String?;
  String? get pluralForm => _noun?['pluralForm'] as String?;
  bool get isNoun => partOfSpeech == 'NOUN';
  bool get hasGender => article != null;

  /// Megszámlálható főnév ismert többes számmal (die Milch-nél nincs).
  bool get hasPlural => isNoun && _noun?['numberType'] == 'REGULAR' && pluralForm != null;

  /// Többes szám névelővel: „die Tische”.
  String? get pluralDisplay => hasPlural ? 'die $pluralForm' : null;

  Json? get _verb => _json['verb'] as Json?;
  bool get hasVerbForms => _verb != null;

  /// Igei alapalakok külön-külön (a gépelt válasz ellenőrzéséhez).
  ({String present3sg, String preterite3sg, String perfect})? get verbParts {
    final verb = _verb;
    if (verb == null) return null;
    return (
      present3sg: verb['present3sg'] as String,
      preterite3sg: verb['preterite3sg'] as String,
      perfect: '${_auxiliary(verb)} ${verb['pastParticiple']}',
    );
  }

  bool get hasValency => _list('valencies').isNotEmpty;

  /// Kategóriák (slug + magyar név) a tematikus böngészéshez.
  List<({String slug, String nameHu})> get categories => _list('categories')
      .map((c) => (slug: c['slug'] as String, nameHu: c['nameHu'] as String? ?? c['slug'] as String))
      .toList();

  /// Kereséshez: kisbetűs alak + megjelenítési alak + fordítások.
  String get searchText => [lemma, display, ...translations].join(' ').toLowerCase();

  /// Igei alapalakok egy sorban: „fährt – fuhr – ist/hat gefahren”.
  String? get verbForms {
    final verb = _json['verb'] as Json?;
    if (verb == null) return null;
    return '${verb['present3sg']} – ${verb['preterite3sg']} – ${_auxiliary(verb)} ${verb['pastParticiple']}';
  }

  static String _auxiliary(Json verb) => switch (verb['auxiliary']) {
        'SEIN' => 'ist',
        'BOTH' => 'hat/ist',
        _ => 'hat',
      };

  /// Fokozás: „schneller – am schnellsten”.
  String? get comparison {
    final adj = _json['adjective'] as Json?;
    final comparative = adj?['comparative'] as String?;
    if (comparative == null) return null;
    return '$comparative – ${adj!['superlative']}';
  }

  List<String> get translations => _list('translations').map((t) => t['text'] as String).toList();

  String get primaryTranslation {
    final all = _list('translations');
    final primary = all.where((t) => t['isPrimary'] == true);
    return (primary.isNotEmpty ? primary.first : (all.isNotEmpty ? all.first : const {'text': '—'}))['text'] as String;
  }

  /// Vonzatok megjelenítési mintái (warten auf + Akk.) jelentéssel.
  List<({String pattern, String? meaning, String? example, String? preposition, String caseAbbreviation})> get valencies =>
      _list('valencies').map((v) {
        final examples = (v['examples'] as List?)?.cast<Json>() ?? const [];
        return (
          pattern: v['pattern'] as String,
          meaning: v['meaning'] as String?,
          example: examples.isEmpty ? null : examples.first['sentence'] as String?,
          preposition: v['preposition'] as String?,
          caseAbbreviation: v['caseAbbreviation'] as String? ?? '',
        );
      }).toList();

  List<({String sentence, String? translation})> get examples => _list('examples')
      .map((e) => (sentence: e['sentence'] as String, translation: e['translation'] as String?))
      .toList();

  Json? get _noun => _json['noun'] as Json?;

  List<Json> _list(String key) => (_json[key] as List?)?.cast<Json>() ?? const [];
}
