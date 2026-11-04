import '../data/models/study_card.dart';
import '../data/models/word.dart';
import 'answer_check.dart';

/// A kártyatípusnak megfelelő válasz ellenőrzése. Minden kártyán a felhasználó
/// adja meg a választ (gépelve, a névelő kártyán gombbal) – a hátlapot csak a
/// válasz után látja. Üres válasz = „nem tudom” → hibás.
AnswerCheck checkCardAnswer(StudyCard card, String typed) {
  final w = card.word;
  if (typed.trim().isEmpty) return const AnswerCheck(verdict: AnswerVerdict.wrong, hint: null);
  return switch (card.cardType) {
    CardType.production => checkAnswer(typed, w.display),
    CardType.recognition => checkMeaning(typed, w.translations),
    CardType.gender => _checkArticle(typed, w.article),
    CardType.plural => _checkPlural(typed, w),
    CardType.verbForms => _checkVerbForms(typed, w),
    CardType.valency => _checkValency(typed, w),
  };
}

/// A válaszadás után a kártyán megjelenő helyes válasz – a hátlap fő sora.
String expectedAnswer(StudyCard card) {
  final w = card.word;
  return switch (card.cardType) {
    CardType.recognition => w.translations.join(', '),
    CardType.production => w.display,
    CardType.gender => w.article ?? w.display,
    CardType.plural => w.pluralDisplay ?? '—',
    CardType.verbForms => w.verbForms ?? '—',
    CardType.valency => w.valencies.map((v) => v.pattern).join('\n'),
  };
}

// ---------------------------------------------------------------------------
// Magyar jelentés (felismerés kártya)
// ---------------------------------------------------------------------------

/// A begépelt magyar jelentés összevetése a fordításokkal.
///
/// Egy fordításon belül a vesszővel / pontosvesszővel / perjellel elválasztott
/// változatok mindegyike elfogadott, a zárójeles megjegyzések és a „vki/vmi”
/// jellegű helykitöltők elhagyhatók. Ékezethiba vagy egy elütés → „majdnem”.
AnswerCheck checkMeaning(String typed, List<String> translations) {
  final t = _normalizeHu(typed);
  if (t.isEmpty) return const AnswerCheck(verdict: AnswerVerdict.wrong, hint: null);
  final options = <String>{
    for (final tr in translations)
      for (final v in _meaningVariants(tr)) v,
  };
  if (options.contains(t)) return const AnswerCheck(verdict: AnswerVerdict.correct, hint: null);
  final tFolded = _foldHu(t);
  if (options.any((o) => _foldHu(o) == tFolded)) {
    return const AnswerCheck(verdict: AnswerVerdict.almost, hint: 'Ékezethiba?');
  }
  if (options.any((o) => o.length > 5 && levenshtein(_foldHu(o), tFolded, max: 1) <= 1)) {
    return const AnswerCheck(verdict: AnswerVerdict.almost, hint: 'Elütés?');
  }
  return const AnswerCheck(verdict: AnswerVerdict.wrong, hint: null);
}

Iterable<String> _meaningVariants(String translation) sync* {
  final withoutNotes = translation.replaceAll(RegExp(r'\([^)]*\)|\[[^\]]*\]'), ' ');
  for (final part in withoutNotes.split(RegExp(r'[,;/]'))) {
    final n = _normalizeHu(part);
    if (n.isEmpty) continue;
    yield n;
    final stripped = _normalizeHu(n.split(' ').where((w) => !_placeholder.hasMatch(w)).join(' '));
    if (stripped.isNotEmpty && stripped != n) yield stripped;
  }
}

/// vki, vmi, vkit, vmit, vkinek, vmihez, vhol, vhova …
final _placeholder = RegExp(r'^(vki|vmi|vhol|vhova|vhová|vhonnan|valaki|valami)\S*$');

String _normalizeHu(String s) => s.toLowerCase().replaceAll(RegExp(r'[.,!?;:"„”()\[\]]'), ' ').replaceAll(RegExp(r'\s+'), ' ').trim();

const _huFold = {'á': 'a', 'é': 'e', 'í': 'i', 'ó': 'o', 'ö': 'o', 'ő': 'o', 'ú': 'u', 'ü': 'u', 'ű': 'u'};

String _foldHu(String s) => s.split('').map((c) => _huFold[c] ?? c).join();

// ---------------------------------------------------------------------------
// Névelő, többes szám, igei alakok, vonzat
// ---------------------------------------------------------------------------

AnswerCheck _checkArticle(String typed, String? article) {
  final t = normalizeAnswer(typed);
  if (article == null) return const AnswerCheck(verdict: AnswerVerdict.wrong, hint: null);
  return t == normalizeAnswer(article)
      ? const AnswerCheck(verdict: AnswerVerdict.correct, hint: null)
      : const AnswerCheck(verdict: AnswerVerdict.wrong, hint: 'Rossz névelő.');
}

/// „die Tische” vagy csak „Tische” – a többes számú névelő mindig „die”.
AnswerCheck _checkPlural(String typed, Word w) {
  final form = w.pluralForm;
  if (form == null) return const AnswerCheck(verdict: AnswerVerdict.wrong, hint: null);
  var t = normalizeAnswer(typed);
  if (t.startsWith('die ')) t = t.substring(4);
  final e = normalizeAnswer(form);
  if (t == e) return const AnswerCheck(verdict: AnswerVerdict.correct, hint: null);
  if (t == normalizeAnswer(w.lemma)) return const AnswerCheck(verdict: AnswerVerdict.wrong, hint: 'Ez az egyes szám.');
  if (e.length > 5 && levenshtein(t, e, max: 1) <= 1) return const AnswerCheck(verdict: AnswerVerdict.almost, hint: 'Elütés?');
  return const AnswerCheck(verdict: AnswerVerdict.wrong, hint: null);
}

/// „fährt, fuhr, ist gefahren” – bármilyen elválasztóval (vessző, kötőjel, szóköz).
/// A segédige hiánya „majdnem”.
AnswerCheck _checkVerbForms(String typed, Word w) {
  final parts = w.verbParts;
  if (parts == null) return const AnswerCheck(verdict: AnswerVerdict.wrong, hint: null);
  final t = _tokens(typed);
  final perfect = parts.perfect.split(' ');
  final auxiliaries = perfect.first.split('/');
  final participle = perfect.skip(1).join(' ');
  final head = [..._tokens(parts.present3sg), ..._tokens(parts.preterite3sg)];
  for (final aux in auxiliaries) {
    if (_same(t, [...head, ..._tokens(aux), ..._tokens(participle)])) {
      return const AnswerCheck(verdict: AnswerVerdict.correct, hint: null);
    }
  }
  if (_same(t, [...head, ..._tokens(participle)])) {
    return const AnswerCheck(verdict: AnswerVerdict.almost, hint: 'Hiányzik a segédige (hat / ist).');
  }
  final expected = [...head, ..._tokens(auxiliaries.first), ..._tokens(participle)].join(' ');
  if (levenshtein(t.join(' '), expected, max: 1) <= 1) return const AnswerCheck(verdict: AnswerVerdict.almost, hint: 'Elütés?');
  return const AnswerCheck(verdict: AnswerVerdict.wrong, hint: null);
}

/// „auf + Akk.”, „auf Akk”, „auf Akkusativ” – az ige maga elhagyható.
AnswerCheck _checkValency(String typed, Word w) {
  final lemmaTokens = _tokens(w.lemma).toSet()..addAll(_tokens(w.display));
  final t = _tokens(typed).where((x) => !lemmaTokens.contains(x)).map(_caseToken).toList();
  var prepositionRight = false;
  for (final v in w.valencies) {
    final expected = [
      if (v.preposition != null) ..._tokens(v.preposition!),
      if (v.caseAbbreviation.isNotEmpty) _caseToken(normalizeAnswer(v.caseAbbreviation)),
    ];
    final fromPattern = _tokens(v.pattern).where((x) => !lemmaTokens.contains(x)).map(_caseToken).toList();
    if (_same(t, expected) || _same(t, fromPattern)) return const AnswerCheck(verdict: AnswerVerdict.correct, hint: null);
    if (v.preposition != null && t.isNotEmpty && t.first == normalizeAnswer(v.preposition!)) prepositionRight = true;
  }
  return AnswerCheck(verdict: AnswerVerdict.wrong, hint: prepositionRight ? 'Jó elöljáró, rossz eset.' : null);
}

String _caseToken(String t) => switch (t) {
  'akk' || 'akkusativ' || 'a' => 'akk',
  'dat' || 'dativ' || 'd' => 'dat',
  'gen' || 'genitiv' || 'g' => 'gen',
  'nom' || 'nominativ' || 'n' => 'nom',
  _ => t,
};

List<String> _tokens(String s) => normalizeAnswer(s.replaceAll(RegExp(r'[–—\-+/]'), ' ')).split(' ').where((x) => x.isNotEmpty).toList();

bool _same(List<String> a, List<String> b) {
  if (a.length != b.length) return false;
  for (var i = 0; i < a.length; i++) {
    if (a[i] != b[i]) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Automatikus értékelés
// ---------------------------------------------------------------------------

/// Az értékelés (SM-2 osztályzat) a válasz helyességéből, a megoldásra fordított
/// időből és a kártya eddigi találati arányából – a felhasználónak nem kell
/// magát értékelnie.
///
///  - hibás → 1 („nem tudta”)
///  - majdnem (elütés, ékezet, hiányzó névelő) → 3 („nehéz”)
///  - helyes: a válasz hosszához mért idő szerint gyors → 5, átlagos → 4,
///    lassú → 3. A határok: gyors ≤ 4 s + 0,15 s/karakter, lassú > 10 s + 0,3 s/karakter.
///  - ha a kártya eddigi találati aránya (legalább 3 válasz után) 60% alatti,
///    a „könnyű” értékelés „jó”-ra csökken: a sokszor elrontott szó egy
///    szerencsés gyors válasz után se kerüljön túl messzire.
int autoGrade({required AnswerVerdict verdict, required int responseTimeMs, required StudyCard card}) {
  switch (verdict) {
    case AnswerVerdict.wrong:
      return 1;
    case AnswerVerdict.almost:
      return 3;
    case AnswerVerdict.correct:
      final length = expectedAnswer(card).length;
      final fastMs = 4000 + 150 * length;
      final slowMs = 10000 + 300 * length;
      var grade = responseTimeMs <= fastMs ? 5 : (responseTimeMs <= slowMs ? 4 : 3);
      final s = card.scheduling;
      if (grade == 5 && s.totalReviews >= 3 && s.correctReviews / s.totalReviews < 0.6) grade = 4;
      return grade;
  }
}

/// Az automatikus értékelés felirata.
String gradeLabel(int grade) => switch (grade) {
  1 => 'Nem tudtad',
  3 => 'Nehéz',
  4 => 'Jó',
  5 => 'Könnyű',
  _ => '$grade',
};
