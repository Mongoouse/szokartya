import 'dart:convert';
import 'dart:math';

import 'placement_bank.dart';

/// Egy szintfelmérő kérdés alapja: német szó és a helyes magyar jelentése.
class PlacementItem {
  const PlacementItem({required this.level, required this.german, required this.partOfSpeech, required this.meaning});

  /// CEFR szint (A1 … C1).
  final String level;

  /// Megjelenítési alak névelővel / „sich”-kel (der Mantel, sich treffen).
  final String german;
  final String partOfSpeech;
  final String meaning;
}

/// A feltett kérdés: a szó és a válaszlehetőségek (a helyes válasz köztük, véletlen helyen).
class PlacementQuestion {
  const PlacementQuestion({required this.item, required this.options});

  final PlacementItem item;
  final List<String> options;
}

/// Egy szint eredménye: hány kérdésből hányat talált el, és teljesítette-e.
typedef LevelScore = ({String level, int correct, int asked, bool passed});

/// A felmérés eredménye.
class PlacementResult {
  const PlacementResult({required this.recommendedLevel, required this.scores});

  /// Ahol a tanulást érdemes kezdeni: az első nem teljesített szint (ha
  /// mindegyik sikerült, a legfelső).
  final String recommendedLevel;

  /// Szintenként a válaszok, a felmérés sorrendjében (a meg nem kezdett
  /// szintek nem szerepelnek).
  final List<LevelScore> scores;

  /// A teljesített szintek (ezek szavait a felhasználó nagy valószínűséggel ismeri).
  List<String> get passedLevels => [
    for (final s in scores)
      if (s.passed) s.level,
  ];

  bool get allPassed => scores.every((s) => s.passed);

  Map<String, Object?> toJson() => {
    'recommendedLevel': recommendedLevel,
    'scores': [
      for (final s in scores) {'level': s.level, 'correct': s.correct, 'asked': s.asked, 'passed': s.passed},
    ],
  };

  factory PlacementResult.fromJson(Map<String, Object?> json) => PlacementResult(
    recommendedLevel: json['recommendedLevel']! as String,
    scores: [
      for (final s in (json['scores'] as List? ?? const []).cast<Map<String, Object?>>())
        (
          level: s['level']! as String,
          correct: (s['correct']! as num).toInt(),
          asked: (s['asked']! as num).toInt(),
          passed: s['passed']! as bool,
        ),
    ],
  );

  String encode() => jsonEncode(toJson());

  factory PlacementResult.decode(String raw) => PlacementResult.fromJson(jsonDecode(raw) as Map<String, Object?>);
}

/// Szókincs alapú szintfelmérő, szintenként szekvenciális döntéssel.
///
/// A szinteket alulról felfelé járja végig (A1 → C1). Egy szinten legfeljebb
/// [itemsPerLevel] kérdés jön (német szó → 4 magyar jelentés közül egy, vagy
/// „Nem tudom”). A szint teljesítve, amint [passMark] helyes válasz megvan;
/// elbukott, amint már nem érhető el (több mint `itemsPerLevel − passMark`
/// hiba). Teljesített szint után a következő jön, az első elbukott szintnél a
/// felmérés véget ér – ez lesz az ajánlott kezdőszint.
///
/// Alapbeállítással (6 kérdésből 4) a puszta tippelés (p = 0,25) esélye egy
/// szint teljesítésére kb. 3,8%, a felmérés pedig legfeljebb 30 kérdés
/// (jellemzően 10–20, 2–3 perc).
class PlacementTest {
  PlacementTest({
    Map<String, List<PlacementItem>> bank = placementBank,
    Random? random,
    this.itemsPerLevel = 6,
    this.passMark = 4,
    this.optionCount = 4,
  }) : assert(passMark <= itemsPerLevel),
       _random = random ?? Random(),
       _levels = bank.keys.toList(),
       _bank = bank {
    _startLevel();
  }

  final int itemsPerLevel;
  final int passMark;
  final int optionCount;

  final Random _random;
  final List<String> _levels;
  final Map<String, List<PlacementItem>> _bank;
  final List<LevelScore> _scores = [];

  int _levelIndex = 0;
  List<PlacementItem> _pending = const [];
  int _correct = 0;
  int _asked = 0;
  int _answered = 0;
  PlacementQuestion? _current;
  bool _finished = false;

  /// A szintek a felmérés sorrendjében.
  List<String> get levels => List.unmodifiable(_levels);

  /// Az épp mért szint.
  String get currentLevel => _levels[_levelIndex.clamp(0, _levels.length - 1)];

  /// A következő kérdés; null, ha a felmérés véget ért.
  PlacementQuestion? get current => _current;

  bool get isFinished => _finished;

  /// Az eddig feltett kérdések száma (a folyamatjelzőhöz).
  int get answered => _answered;

  /// Válasz az aktuális kérdésre; [choice] = null: „Nem tudom”.
  /// @returns helyes volt-e.
  bool answer(String? choice) {
    final question = _current;
    if (question == null) throw StateError('A felmérés véget ért');
    final correct = choice == question.item.meaning;
    _asked++;
    _answered++;
    if (correct) _correct++;
    final failed = _asked - _correct > itemsPerLevel - passMark;
    if (_correct >= passMark || failed) {
      _scores.add((level: currentLevel, correct: _correct, asked: _asked, passed: !failed));
      if (failed || _levelIndex == _levels.length - 1) {
        _finished = true;
        _current = null;
      } else {
        _levelIndex++;
        _startLevel();
      }
    } else {
      _next();
    }
    return correct;
  }

  /// Az eredmény (csak a felmérés végén).
  PlacementResult get result {
    if (!_finished) throw StateError('A felmérés még tart');
    final failed = _scores.where((s) => !s.passed);
    return PlacementResult(
      recommendedLevel: failed.isEmpty ? _scores.last.level : failed.first.level,
      scores: List.unmodifiable(_scores),
    );
  }

  void _startLevel() {
    _pending = [..._bank[currentLevel]!]..shuffle(_random);
    if (_pending.length < itemsPerLevel) {
      throw ArgumentError('$currentLevel: legalább $itemsPerLevel szó kell (van: ${_pending.length})');
    }
    _correct = 0;
    _asked = 0;
    _next();
  }

  void _next() {
    final item = _pending.removeLast();
    _current = PlacementQuestion(item: item, options: _options(item));
  }

  /// A helyes jelentés és tévesztők ugyanarról a szintről, lehetőleg azonos
  /// szófajból (így a szófaj nem árulja el a választ).
  List<String> _options(PlacementItem item) {
    final pool = _bank[item.level]!.where((o) => o.meaning != item.meaning);
    final samePos = pool.where((o) => o.partOfSpeech == item.partOfSpeech).map((o) => o.meaning).toSet().toList()
      ..shuffle(_random);
    final otherPos = pool.where((o) => o.partOfSpeech != item.partOfSpeech).map((o) => o.meaning).toSet().toList()
      ..shuffle(_random);
    final distractors = [...samePos, ...otherPos].take(optionCount - 1);
    return [item.meaning, ...distractors]..shuffle(_random);
  }
}
