import 'package:uuid/uuid.dart';

import '../../core/time/clock.dart';
import '../../domain/sm2_scheduler.dart';
import '../local/local_store.dart';
import '../models/study_card.dart';
import '../models/user_settings.dart';
import 'auth_repository.dart';

/// A napi tanulási sor (helyi adatokból számolva).
class StudyQueue {
  const StudyQueue({required this.learning, required this.reviews, required this.newCards});

  final List<StudyCard> learning;
  final List<StudyCard> reviews;
  final List<StudyCard> newCards;

  /// Ajánlott sorrend: előbb a tanulási lépcsők, majd az ismétlések, végül az új kártyák.
  List<StudyCard> get ordered => [...learning, ...reviews, ...newCards];

  bool get isEmpty => learning.isEmpty && reviews.isEmpty && newCards.isEmpty;
}

class HomeSummary {
  const HomeSummary({
    required this.dueToday,
    required this.newAvailableToday,
    required this.reviewedToday,
    required this.cardsByState,
    required this.pendingSync,
    required this.unenrolledByLevel,
  });

  final int dueToday;
  final int newAvailableToday;
  final int reviewedToday;
  final Map<CardState, int> cardsByState;
  final int pendingSync;
  final Map<String, int> unenrolledByLevel;
}

/// Tanulási műveletek – offline-first: minden művelet a helyi adatbázison
/// fut, a kimenő sorba kerül, és a szinkronizáció tölti fel a szerverre.
class StudyRepository {
  StudyRepository({required this._store, required this._clock, this._config = const SchedulerConfig()});

  final LocalStore _store;
  final Clock _clock;
  final SchedulerConfig _config;
  static const _uuid = Uuid();

  /// A szerver `GET /study/queue` logikájának helyi megfelelője (azonos keretekkel).
  Future<StudyQueue> loadQueue({int limit = 200}) async {
    final now = _clock.now();
    final day = localDayBounds(now);
    final profile = await _profile();

    final reviewsDone = await _store.countReviewsSince(day.start, statesBefore: [CardState.review]);
    final newDone = await _store.countReviewsSince(day.start, statesBefore: [CardState.newCard]);
    final reviewsRemaining = (profile.dailyReviewLimit - reviewsDone).clamp(0, limit);
    final newRemaining = (profile.dailyNewCardsLimit - newDone).clamp(0, limit);

    return StudyQueue(
      learning: await _store.dueCards(before: day.end, states: [CardState.learning, CardState.relearning], limit: limit),
      reviews: await _store.dueCards(before: day.end, states: [CardState.review], limit: reviewsRemaining),
      newCards: await _store.newCards(limit: newRemaining),
    );
  }

  /// Egy értékelés rögzítése: helyi ütemezés + napló + kimenő sor, atomian.
  Future<StudyCard> review(StudyCard card, {required int grade, required int responseTimeMs}) async {
    final now = _clock.now();
    final result = scheduleReview(
      card.scheduling,
      grade: grade,
      responseTimeMs: responseTimeMs,
      reviewedAt: now,
      config: _config,
    );
    await _store.recordReview(LocalReview(
      reviewId: _uuid.v4(),
      cardId: card.id,
      grade: grade,
      responseTimeMs: responseTimeMs,
      reviewedAt: now,
      before: card.scheduling,
      after: result.card,
    ));
    return card.copyWith(scheduling: result.card);
  }

  /// Előnézet a gombokhoz: melyik válasz után mikor jön újra a kártya.
  Map<int, Duration> previewIntervals(StudyCard card, {required int responseTimeMs}) {
    final now = _clock.now();
    return {
      for (final grade in const [1, 3, 4, 5])
        grade: scheduleReview(card.scheduling, grade: grade, responseTimeMs: responseTimeMs, reviewedAt: now, config: _config)
            .card
            .nextReviewAt!
            .difference(now),
    };
  }

  /// Egy CEFR szint még fel nem vett szavainak felvétele (felismerés + felidézés,
  /// főneveknél névelőkártya is).
  Future<int> enrollLevel(String cefrLevel) async {
    final words = await _store.unenrolledWords(cefrLevel: cefrLevel);
    final cards = [
      for (final w in words)
        for (final type in [CardType.recognition, CardType.production, if (w.hasGender) CardType.gender])
          (id: _uuid.v4(), wordId: w.id, type: type),
    ];
    return _store.enrollLocally(cards, _clock.now());
  }

  Future<void> setSuspended(StudyCard card, bool suspended) => _store.setSuspended(card.id, suspended, _clock.now());

  Future<HomeSummary> summary() async {
    final now = _clock.now();
    final day = localDayBounds(now);
    final queue = await loadQueue();
    return HomeSummary(
      dueToday: queue.learning.length + queue.reviews.length,
      newAvailableToday: queue.newCards.length,
      reviewedToday: await _store.countReviewsSince(day.start),
      cardsByState: await _store.countCardsByState(),
      pendingSync: await _store.outboxCount(),
      unenrolledByLevel: await _store.unenrolledCountByLevel(),
    );
  }

  Future<UserProfile> _profile() async {
    final raw = await _store.getState(profileStateKey);
    if (raw == null) throw StateError('Nincs bejelentkezett felhasználó');
    return UserProfile.decode(raw);
  }
}
