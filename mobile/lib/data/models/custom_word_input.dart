import '../../core/api/api_client.dart';

/// A „Saját szó” űrlap adatai: ebből készül a szerverre küldött
/// `CreateCustomWordDto` és az offline megjelenítéshez szükséges helyi szó-JSON.
class CustomWordInput {
  const CustomWordInput({
    required this.lemma,
    required this.partOfSpeech,
    required this.translations,
    this.cefrLevel,
    this.gender,
    this.pluralForm,
    this.present3sg,
    this.preterite3sg,
    this.pastParticiple,
    this.auxiliary = 'HABEN',
    this.exampleSentence,
    this.exampleTranslation,
  });

  final String lemma;

  /// NOUN / VERB / ADJECTIVE / ADVERB / …
  final String partOfSpeech;
  final List<String> translations;
  final String? cefrLevel;

  /// MASCULINE / FEMININE / NEUTER (főnévnél).
  final String? gender;
  final String? pluralForm;
  final String? present3sg;
  final String? preterite3sg;
  final String? pastParticiple;

  /// HABEN / SEIN / BOTH.
  final String auxiliary;
  final String? exampleSentence;
  final String? exampleTranslation;

  bool get _hasVerbForms => present3sg != null && preterite3sg != null && pastParticiple != null;

  /// Kliensoldali ellenőrzés (a szerver ugyanezt nézi). @returns hibaüzenet vagy null.
  String? validate() {
    if (lemma.trim().isEmpty) return 'Add meg a szót.';
    if (translations.where((t) => t.trim().isNotEmpty).isEmpty) return 'Legalább egy fordítás kell.';
    if (partOfSpeech == 'VERB' && !_hasVerbForms) return 'Igénél add meg az alapalakokat is.';
    if (partOfSpeech != 'NOUN' && (gender != null || pluralForm != null)) return 'Névelő és többes szám csak főnévnél adható meg.';
    return null;
  }

  /// A szerver `POST /words` / push `customWords` törzse.
  Json toPushJson(String id) => {
        'id': id,
        'lemma': lemma.trim(),
        'partOfSpeech': partOfSpeech,
        if (cefrLevel != null) 'cefrLevel': cefrLevel,
        'translations': [for (final t in translations) if (t.trim().isNotEmpty) t.trim()],
        if (gender != null) 'gender': gender,
        if (pluralForm != null && pluralForm!.trim().isNotEmpty) 'pluralForm': pluralForm!.trim(),
        if (partOfSpeech == 'VERB' && _hasVerbForms)
          'verb': {
            'present3sg': present3sg!.trim(),
            'preterite3sg': preterite3sg!.trim(),
            'pastParticiple': pastParticiple!.trim(),
            'auxiliary': auxiliary,
          },
        if (exampleSentence != null && exampleSentence!.trim().isNotEmpty)
          'example': {
            'sentence': exampleSentence!.trim(),
            if (exampleTranslation != null && exampleTranslation!.trim().isNotEmpty) 'translation': exampleTranslation!.trim(),
          },
      };

  /// A szerver `WordSyncDto` alakjának helyi közelítése, amíg a szerver válasza meg nem érkezik.
  Json toLocalWordJson(String id) {
    final push = toPushJson(id);
    final article = switch (gender) { 'MASCULINE' => 'der', 'FEMININE' => 'die', 'NEUTER' => 'das', _ => null };
    final plural = push['pluralForm'] as String?;
    return {
      'id': id,
      'lemma': push['lemma'],
      'display': article == null ? push['lemma'] : '$article ${push['lemma']}',
      'partOfSpeech': partOfSpeech,
      'homographNo': 1,
      'cefrLevel': cefrLevel,
      'ipa': null,
      'isCustom': true,
      'version': 0,
      'noun': partOfSpeech == 'NOUN'
          ? {
              'gender': gender,
              'article': article,
              'numberType': plural == null ? 'SINGULAR_ONLY' : 'REGULAR',
              'pluralForm': plural,
              'genitiveSingular': null,
              'isNDeclension': false,
            }
          : null,
      'verb': push['verb'] == null ? null : {...push['verb'] as Json, 'isSeparable': false, 'separablePrefix': null, 'reflexiveType': 'NONE'},
      'adjective': null,
      'translations': [
        for (final (i, t) in (push['translations'] as List<String>).indexed) {'text': t, 'senseNote': null, 'isPrimary': i == 0},
      ],
      'valencies': const <Json>[],
      'examples': push['example'] == null ? const <Json>[] : [push['example']],
      'categories': const <Json>[],
      'deletedAt': null,
    };
  }
}
