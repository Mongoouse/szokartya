import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/models/study_card.dart';
import '../../domain/answer_check.dart';
import '../../domain/card_answer.dart';
import '../../domain/sm2_scheduler.dart';
import '../../domain/word_scope.dart';
import '../../providers.dart';
import '../sync/sync_controller.dart';

/// Egy lecke ennyi válaszból áll (a találati aránytól függetlenül).
const lessonSize = 20;

enum StudyPhase {
  /// A sor betöltése.
  loading,

  /// A kártya előlapja látszik – a felhasználó válaszol.
  question,

  /// A válasz kiértékelve, a hátlap látszik.
  answer,

  /// A lecke véget ért (20 válasz, vagy nincs több kártya).
  finished,

  error,
}

/// Milyen leckét indít a felhasználó.
class StudySessionArgs {
  const StudySessionArgs({this.scope, this.endless = false});

  /// Szókészlet (témakör vagy szint); null = a napi sor (esedékes és új
  /// kártyák a napi kereten belül).
  final WordScope? scope;

  /// Végtelen mód: a lecke nem ér véget a 20. kártya után.
  final bool endless;

  @override
  bool operator ==(Object other) => other is StudySessionArgs && other.scope == scope && other.endless == endless;

  @override
  int get hashCode => Object.hash(scope, endless);
}

/// A tanulási munkamenet megváltoztathatatlan állapota.
class StudySessionState {
  const StudySessionState({
    required this.phase,
    this.queue = const [],
    this.answered = 0,
    this.correct = 0,
    this.goal = lessonSize,
    this.saving = false,
    this.error,
    this.check,
    this.typed,
    this.grade,
    this.outOfCards = false,
  });

  final StudyPhase phase;

  /// A következő kártyák; az első az aktuális.
  final List<StudyCard> queue;

  /// Eddig megválaszolt kártyák ebben a leckében (az ismételten elővett kártya újra számít).
  final int answered;
  final int correct;

  /// A lecke hossza; null = végtelen mód.
  final int? goal;

  /// Mentés folyamatban – dupla beküldés ellen.
  final bool saving;
  final String? error;

  /// Az aktuális válasz kiértékelése (válasz fázisban).
  final AnswerCheck? check;
  final String? typed;

  /// Az automatikus értékelés (1 / 3 / 4 / 5): naplózódik és ütemez, a
  /// felületen nem jelenik meg.
  final int? grade;

  /// A lecke azért ért véget, mert elfogytak a kártyák (nem a 20 válasz miatt).
  final bool outOfCards;

  StudyCard? get current => queue.isEmpty ? null : queue.first;

  /// Hátralévő válaszok a leckéből; null = végtelen mód.
  int? get remaining => goal == null ? null : (goal! - answered).clamp(0, goal!);

  StudySessionState copyWith({
    StudyPhase? phase,
    List<StudyCard>? queue,
    int? answered,
    int? correct,
    bool? saving,
    String? error,
    AnswerCheck? check,
    String? typed,
    int? grade,
    bool? outOfCards,
    bool clearAnswer = false,
    bool clearError = false,
  }) =>
      StudySessionState(
        phase: phase ?? this.phase,
        queue: queue ?? this.queue,
        answered: answered ?? this.answered,
        correct: correct ?? this.correct,
        goal: goal,
        saving: saving ?? this.saving,
        error: clearError ? null : (error ?? this.error),
        check: clearAnswer ? null : (check ?? this.check),
        typed: clearAnswer ? null : (typed ?? this.typed),
        grade: clearAnswer ? null : (grade ?? this.grade),
        outOfCards: outOfCards ?? this.outOfCards,
      );
}

/// A szókártya-lecke állapotgépe:
///
/// ```
/// loading ─► question ─answer()─► answer ─next()─► question … ─► finished
/// ```
///
/// - Minden kártyán a felhasználó válaszol (gépelve vagy a névelő gombbal);
///   a hátlap csak a válasz után látszik.
/// - Az értékelést az alkalmazás adja ([autoGrade]): a válasz helyessége, a
///   megoldásra fordított idő és a kártya eddigi találati aránya alapján. Az
///   értékelés a válaszkor mentődik.
/// - A lecke [lessonSize] válaszig tart, bármilyen találati aránynál; a hibás
///   vagy ma még esedékes kártya a sor végére kerül, és újra számít.
///   Végtelen módban a lecke nem ér véget, a sor folyamatosan feltöltődik.
class StudySessionController extends Notifier<StudySessionState> {
  StudySessionController(this.args);

  final StudySessionArgs args;
  final Stopwatch _stopwatch = Stopwatch();
  DateTime? _dayEndsAt;

  @override
  StudySessionState build() {
    Future.microtask(_load);
    return StudySessionState(phase: StudyPhase.loading, goal: args.endless ? null : lessonSize);
  }

  Future<void> _load() async {
    try {
      final repo = ref.read(studyRepositoryProvider);
      final scope = args.scope;
      final List<StudyCard> cards;
      if (scope != null) {
        cards = await repo.loadScopedQueue(scope, size: lessonSize);
      } else {
        final queue = await repo.loadQueue();
        _dayEndsAt = queue.dayEndsAt;
        cards = queue.ordered;
      }
      if (!ref.mounted) return;
      await _showNext(state.copyWith(queue: cards));
    } on Exception catch (e) {
      if (ref.mounted) state = state.copyWith(phase: StudyPhase.error, error: e.toString());
    }
  }

  /// A válasz beküldése. Üres válasz = „nem tudom”. Kiértékelés, automatikus
  /// értékelés és mentés (napló + kimenő sor) egy lépésben.
  Future<void> answer(String typed) async {
    final card = state.current;
    if (state.phase != StudyPhase.question || state.saving || card == null) return;
    _stopwatch.stop();
    final responseTimeMs = _stopwatch.elapsedMilliseconds;
    final check = checkCardAnswer(card, typed);
    final grade = autoGrade(verdict: check.verdict, responseTimeMs: responseTimeMs, card: card);
    state = state.copyWith(saving: true, clearError: true);
    try {
      final updated = await ref.read(studyRepositoryProvider).review(card, grade: grade, responseTimeMs: responseTimeMs);
      if (!ref.mounted) return;

      // A hibás vagy ma még esedékes kártya a sor végére kerül (a leckében újra előjön).
      final rest = state.queue.sublist(1);
      if (check.verdict == AnswerVerdict.wrong || _dueAgainToday(updated)) rest.add(updated);

      // A kezdőképernyő összesítője a lecke bezárásakor frissül, nem válaszonként.
      ref.read(syncControllerProvider.notifier).scheduleSync();
      state = state.copyWith(
        phase: StudyPhase.answer,
        queue: [card, ...rest],
        answered: state.answered + 1,
        correct: state.correct + (check.verdict == AnswerVerdict.wrong ? 0 : 1),
        saving: false,
        check: check,
        typed: typed.trim(),
        grade: grade,
      );
    } on Exception catch (e) {
      _stopwatch.start();
      if (ref.mounted) state = state.copyWith(saving: false, error: 'Mentési hiba: $e');
    }
  }

  /// Tovább a következő kártyára (vagy a lecke vége).
  Future<void> next() async {
    if (state.phase != StudyPhase.answer) return;
    await _showNext(state.copyWith(queue: state.queue.sublist(1), clearAnswer: true));
  }

  Future<void> _showNext(StudySessionState next) async {
    final goal = next.goal;
    if (goal != null && next.answered >= goal) {
      state = next.copyWith(phase: StudyPhase.finished, clearAnswer: true);
      return;
    }
    var queue = next.queue;
    if (queue.isEmpty || (args.endless && queue.length < 3)) {
      queue = [...queue, ...await _refill(queue)];
      if (!ref.mounted) return;
    }
    if (queue.isEmpty) {
      state = next.copyWith(phase: StudyPhase.finished, queue: const [], outOfCards: true, clearAnswer: true);
      return;
    }
    _stopwatch
      ..reset()
      ..start();
    state = next.copyWith(phase: StudyPhase.question, queue: queue, clearAnswer: true);
  }

  /// Utánpótlás: szókészlet-leckében és végtelen módban újabb kártyák töltődnek
  /// be, a napi leckében (napi keret) nem.
  Future<List<StudyCard>> _refill(List<StudyCard> queue) async {
    final scope = args.scope;
    if (scope == null && !args.endless) return const [];
    final repo = ref.read(studyRepositoryProvider);
    final exclude = {for (final c in queue) c.id};
    try {
      return scope != null
          ? await repo.loadScopedQueue(scope, size: lessonSize, exclude: exclude)
          : await repo.loadMore(size: lessonSize, exclude: exclude);
    } on Exception {
      return const [];
    }
  }

  bool _dueAgainToday(StudyCard card) {
    final s = card.scheduling;
    if (s.state != CardState.learning && s.state != CardState.relearning) return false;
    final next = s.nextReviewAt;
    if (next == null) return false;
    final dayEnd = _dayEndsAt;
    return dayEnd == null || next.isBefore(dayEnd);
  }
}

final studySessionProvider =
    NotifierProvider.autoDispose.family<StudySessionController, StudySessionState, StudySessionArgs>(StudySessionController.new);
