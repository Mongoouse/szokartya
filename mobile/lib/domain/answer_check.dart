/// A gépelt válasz ellenőrzése (felidézés kártyán).
///
/// Elvárt válasz pl. „der Tisch” vagy „sich freuen”. Elfogadott eltérések:
///  - kis- és nagybetű, felesleges szóközök, írásjelek;
///  - umlaut helyett ae / oe / ue, ß helyett ss;
///  - egyetlen elütés (5 betűnél hosszabb szónál) → „majdnem”.
/// A névelő hiánya „majdnem”, rossz névelő „hibás”: a nem a tanulás része.
enum AnswerVerdict {
  correct,
  almost,
  wrong;

  /// A javasolt önértékelés (a felhasználó felülírhatja).
  int get suggestedGrade => switch (this) { correct => 4, almost => 3, wrong => 1 };
}

class AnswerCheck {
  const AnswerCheck({required this.verdict, required this.hint});

  final AnswerVerdict verdict;

  /// Rövid magyarázat a „majdnem” / „hibás” eredményhez.
  final String? hint;
}

const _articles = {'der', 'die', 'das'};

AnswerCheck checkAnswer(String typed, String expected) {
  final t = normalizeAnswer(typed);
  final e = normalizeAnswer(expected);
  if (t.isEmpty) return const AnswerCheck(verdict: AnswerVerdict.wrong, hint: null);
  if (t == e) return const AnswerCheck(verdict: AnswerVerdict.correct, hint: null);

  final (eArticle, eRest) = _splitArticle(e);
  final (tArticle, tRest) = _splitArticle(t);
  if (eArticle != null) {
    if (tArticle == null && _close(tRest, eRest, exactOnly: true)) {
      return const AnswerCheck(verdict: AnswerVerdict.almost, hint: 'Hiányzik a névelő.');
    }
    if (tArticle != null && tArticle != eArticle && _close(tRest, eRest, exactOnly: true)) {
      return const AnswerCheck(verdict: AnswerVerdict.wrong, hint: 'Rossz névelő.');
    }
  }
  if (_close(t, e, exactOnly: false)) {
    return const AnswerCheck(verdict: AnswerVerdict.almost, hint: 'Elütés?');
  }
  return const AnswerCheck(verdict: AnswerVerdict.wrong, hint: null);
}

/// Kisbetű, írásjelek nélkül, egységes szóközökkel; ä→ae, ö→oe, ü→ue, ß→ss.
String normalizeAnswer(String s) => s
    .toLowerCase()
    .replaceAll('ä', 'ae')
    .replaceAll('ö', 'oe')
    .replaceAll('ü', 'ue')
    .replaceAll('ß', 'ss')
    .replaceAll(RegExp(r'[.,!?;:"„”()]'), ' ')
    .replaceAll(RegExp(r'\s+'), ' ')
    .trim();

(String?, String) _splitArticle(String s) {
  final i = s.indexOf(' ');
  if (i > 0 && _articles.contains(s.substring(0, i))) return (s.substring(0, i), s.substring(i + 1));
  return (null, s);
}

bool _close(String a, String b, {required bool exactOnly}) {
  if (a == b) return true;
  if (exactOnly) return false;
  return b.length > 5 && _levenshtein(a, b, max: 1) <= 1;
}

/// Szerkesztési távolság korlátos számítással (a [max]-nál nagyobbat max+1-ként adja).
int _levenshtein(String a, String b, {required int max}) {
  if ((a.length - b.length).abs() > max) return max + 1;
  var prev = List<int>.generate(b.length + 1, (i) => i);
  for (var i = 1; i <= a.length; i++) {
    final cur = List<int>.filled(b.length + 1, 0)..[0] = i;
    for (var j = 1; j <= b.length; j++) {
      final cost = a.codeUnitAt(i - 1) == b.codeUnitAt(j - 1) ? 0 : 1;
      cur[j] = [prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost].reduce((x, y) => x < y ? x : y);
    }
    prev = cur;
  }
  return prev[b.length];
}
