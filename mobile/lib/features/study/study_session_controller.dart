import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/time/clock.dart';
import '../../data/models/study_card.dart';
import '../../domain/sm2_scheduler.dart';
import '../../providers.dart';
import '../home/home_summary_provider.dart';
import '../sync/sync_controller.dart';

enum StudyPhase {
  /// A napi sor betöltése.
  loading,

  /// A kártya előlapja látszik – a felhasználó felidéz.
  question,

  /// A hátlap látszik – a felhasználó értékeli magát.
  answer,

  /// Nincs több kártya mára.
  finished,

  error,
}

/// A tanulási munkamenet megváltoztathatatlan állapota.
class StudySessionState {
  const StudySessionState({
    required this.phase,
    this.queue = const [],
    this.reviewed = 0,
    this.correct = 0,
    this.preview = const {},
    this.saving = false,
    this.error,
  });

  final StudyPhase phase;

  /// Hátralévő kártyák; az első az aktuális.
  final List<StudyCard> queue;
  final int reviewed;
  final int correct;

  /// Válaszonként a következő ismétlésig hátralévő idő (a gombok feliratához).
  final Map<int, Duration> preview;

  /// Értékelés mentése folyamatban – a gombok addig tiltva (dupla koppintás ellen).
  final bool saving;
  final String? error;

  StudyCard? get current => queue.isEmpty ? null : queue.first;
  int get remaining => queue.length;

  StudySessionState copyWith({
    StudyPhase? phase,
    List<StudyCard>? queue,
    int? reviewed,
    int? correct,
    Map<int, Duration>? preview,
    bool? saving,
    String? error,
  }) =>
      StudySessionState(
        phase: phase ?? this.phase,
        queue: queue ?? this.queue,
        reviewed: reviewed ?? this.reviewed,
        correct: correct ?? this.correct,
        preview: preview ?? this.preview,
        saving: saving ?? this.saving,
        error: error ?? this.error,
      );
}

/// A szókártya-felület állapotgépe:
///
/// ```
/// loading ─► question ─reveal()─► answer ─grade()─► question … ─► finished
/// ```
///
/// A reakcióidőt az előlap megjelenésétől a megfordításig mérjük – ez a
/// felidézés ideje, ezt használja az ütemező. A tanulási lépcsőn maradt
/// kártyák (1–10 perc) a munkamenet végére visszakerülnek a sorba.
class StudySessionController extends Notifier<StudySessionState> {
  final Stopwatch _stopwatch = Stopwatch();
  int _responseTimeMs = 0;

  @override
  StudySessionState build() {
    Future.microtask(_load);
    return const StudySessionState(phase: StudyPhase.loading);
  }

  Future<void> _load() async {
    try {
      final queue = await ref.read(studyRepositoryProvider).loadQueue();
      if (!ref.mounted) return;
      _showNext(state.copyWith(queue: queue.ordered));
    } on Exception catch (e) {
      if (ref.mounted) state = state.copyWith(phase: StudyPhase.error, error: e.toString());
    }
  }

  /// A kártya megfordítása.
  void reveal() {
    final card = state.current;
    if (state.phase != StudyPhase.question || card == null) return;
    _stopwatch.stop();
    _responseTimeMs = _stopwatch.elapsedMilliseconds;
    state = state.copyWith(
      phase: StudyPhase.answer,
      preview: ref.read(studyRepositoryProvider).previewIntervals(card, responseTimeMs: _responseTimeMs),
    );
  }

  /// Önértékelés: 1 = nem tudtam, 3 = nehéz, 4 = jó, 5 = könnyű.
  Future<void> grade(int grade) async {
    final card = state.current;
    if (state.phase != StudyPhase.answer || state.saving || card == null) return;
    state = state.copyWith(saving: true);
    try {
      final updated = await ref.read(studyRepositoryProvider).review(
            card,
            grade: grade,
            responseTimeMs: _responseTimeMs,
          );
      if (!ref.mounted) return;

      final rest = state.queue.sublist(1);
      if (_dueAgainToday(updated)) rest.add(updated);

      ref.read(syncControllerProvider.notifier).scheduleSync();
      ref.invalidate(homeSummaryProvider);
      _showNext(state.copyWith(
        queue: rest,
        reviewed: state.reviewed + 1,
        correct: state.correct + (grade >= 3 ? 1 : 0),
        saving: false,
      ));
    } on Exception catch (e) {
      if (ref.mounted) state = state.copyWith(saving: false, error: 'Mentési hiba: $e');
    }
  }

  void _showNext(StudySessionState next) {
    if (next.queue.isEmpty) {
      state = next.copyWith(phase: StudyPhase.finished, preview: const {});
      return;
    }
    _stopwatch
      ..reset()
      ..start();
    state = next.copyWith(phase: StudyPhase.question, preview: const {});
  }

  bool _dueAgainToday(StudyCard card) {
    final s = card.scheduling;
    if (s.state != CardState.learning && s.state != CardState.relearning) return false;
    final next = s.nextReviewAt;
    return next != null && next.isBefore(localDayBounds(ref.read(clockProvider).now()).end);
  }
}

final studySessionProvider =
    NotifierProvider.autoDispose<StudySessionController, StudySessionState>(StudySessionController.new);
