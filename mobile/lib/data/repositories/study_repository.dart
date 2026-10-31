import 'package:uuid/uuid.dart';

import '../../core/time/clock.dart';
import '../../domain/sm2_scheduler.dart';
import '../local/local_store.dart';
import '../models/custom_word_input.dart';
import '../models/study_card.dart';
import '../models/word.dart';
import '../models/user_settings.dart';
import 'auth_repository.dart';

/// A napi tanulási sor (helyi adatokból számolva).
class StudyQueue {
  const StudyQueue({required this.learning, required this.reviews, required this.newCards, required this.dayEndsAt});

  final List<StudyCard> learning;
  final List<StudyCard> reviews;
  final List<StudyCard> newCards;

  /// A „mai nap” vége (a profil időzónája szerint) – ami ezután esedékes, holnapra marad.
  final DateTime dayEndsAt;

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
    required this.categories,
  });

  final int dueToday;
  final int newAvailableToday;
  final int reviewedToday;
  final Map<CardState, int> cardsByState;
  final int pendingSync;
  final Map<String, int> unenrolledByLevel;
  final List<({String slug, String nameHu, int total, int unenrolled})> categories;
}

/// Tanulási statisztika a helyi naplóból (offline is).
class StudyStats {
  const StudyStats({
    required this.days,
    required this.forecast,
    required this.reviewsLast30Days,
    required this.accuracyLast30Days,
    required this.avgResponseMsLast30Days,
    required this.streakDays,
    required this.cardsByState,
    required this.cardsByType,
    required this.hardest,
  });

  /// Az elmúlt 30 nap értékelései naponként (a legrégebbi elöl).
  final List<({DateTime day, int reviews, int correct})> days;

  /// A következő 14 nap esedékes kártyái naponként (a mai napon a lemaradás is).
  final List<({DateTime day, int due})> forecast;
  final int reviewsLast30Days;
  final double? accuracyLast30Days;
  final int? avgResponseMsLast30Days;

  /// Egymást követő napok száma értékeléssel (ma még nem tanult → tegnapig számolva).
  final int streakDays;
  final Map<CardState, int> cardsByState;
  final Map<CardType, int> cardsByType;
  final List<({Word word, CardType type, int lapses})> hardest;
}

/// Tanulási műveletek – offline-first: minden művelet a helyi adatbázison
/// fut, a kimenő sorba kerül, és a szinkronizáció tölti fel a szerverre.
class StudyRepository {
  StudyRepository({required this._store, required this._clock, this._config = const SchedulerConfig()});

  final LocalStore _store;
  final Clock _clock;
  final SchedulerConfig _config;
  static const _uuid = Uuid();
  static const _cardTypesKey = 'prefs.card_types';

  /// A szerver `GET /study/queue` logikájának helyi megfelelője (azonos keretekkel).
  Future<StudyQueue> loadQueue({int limit = 200}) async {
    final now = _clock.now();
    final profile = await _profile();
    final day = localDayBounds(now, timeZone: profile.timezone);

    final reviewsDone = await _store.countReviewsSince(day.start, statesBefore: [CardState.review]);
    final newDone = await _store.countReviewsSince(day.start, statesBefore: [CardState.newCard]);
    final reviewsRemaining = (profile.dailyReviewLimit - reviewsDone).clamp(0, limit);
    final newRemaining = (profile.dailyNewCardsLimit - newDone).clamp(0, limit);

    return StudyQueue(
      learning: await _store.dueCards(before: day.end, states: [CardState.learning, CardState.relearning], limit: limit),
      reviews: await _store.dueCards(before: day.end, states: [CardState.review], limit: reviewsRemaining),
      newCards: await _store.newCards(limit: newRemaining),
      dayEndsAt: day.end,
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
      config: await _schedulerConfig(),
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
  Future<Map<int, Duration>> previewIntervals(StudyCard card, {required int responseTimeMs}) async {
    final now = _clock.now();
    final config = await _schedulerConfig();
    return {
      for (final grade in const [1, 3, 4, 5])
        grade: scheduleReview(card.scheduling, grade: grade, responseTimeMs: responseTimeMs, reviewedAt: now, config: config)
            .card
            .nextReviewAt!
            .difference(now),
    };
  }

  // ---------------------------------------------------------------------------
  // Kártyafelvétel
  // ---------------------------------------------------------------------------

  /// A felvételkor létrehozandó kártyatípusok (helyi beállítás). Alapértelmezés:
  /// felismerés, felidézés, névelő, többes szám.
  Future<Set<CardType>> preferredCardTypes() async {
    final raw = await _store.getState(_cardTypesKey);
    if (raw == null) return {CardType.recognition, CardType.production, CardType.gender, CardType.plural};
    return {for (final w in raw.split(',').where((x) => x.isNotEmpty)) CardType.parse(w)};
  }

  Future<void> setPreferredCardTypes(Set<CardType> types) =>
      _store.setState(_cardTypesKey, types.map((t) => t.wire).join(','));

  /// Egy CEFR szint még fel nem vett szavainak felvétele a választott típusokkal.
  Future<int> enrollLevel(String cefrLevel) async => enrollWords(await _store.unenrolledWords(cefrLevel: cefrLevel));

  /// Egy tematikus kategória még fel nem vett szavainak felvétele.
  Future<int> enrollCategory(String slug) async => enrollWords(await _store.unenrolledWordsInCategory(slug));

  /// Szavak felvétele: a választott típusok közül az alkalmazhatókkal (a már
  /// meglévő kártyákat a tároló kihagyja). @returns az új kártyák száma.
  Future<int> enrollWords(List<Word> words, {Set<CardType>? types}) async {
    final wanted = types ?? await preferredCardTypes();
    final cards = [
      for (final w in words)
        for (final type in CardType.values)
          if (wanted.contains(type) && type.appliesTo(w)) (id: _uuid.v4(), wordId: w.id, type: type),
    ];
    return _store.enrollLocally(cards, _clock.now());
  }

  /// Saját szó offline felvétele és azonnali kártyafelvétele. A szerver a
  /// következő szinkronnál hozza létre (ugyanazzal az azonosítóval).
  Future<Word> addCustomWord(CustomWordInput input) async {
    final id = _uuid.v4();
    final push = input.toPushJson(id);
    final word = Word.fromJson(input.toLocalWordJson(id));
    final types = await preferredCardTypes();
    await _store.createCustomWordLocally(
      wordPayload: word.toJson(),
      pushPayload: push,
      cards: [
        for (final type in CardType.values)
          if ((types.contains(type) || type == CardType.recognition) && type.appliesTo(word)) (id: _uuid.v4(), wordId: id, type: type),
      ],
      now: _clock.now(),
    );
    return word;
  }

  Future<List<({Word word, bool enrolled})>> searchWords({String query = '', String? cefrLevel, String? categorySlug, bool customOnly = false}) =>
      _store.searchWords(query: query, cefrLevel: cefrLevel, categorySlug: categorySlug, customOnly: customOnly);

  Future<Set<CardType>> enrolledTypes(String wordId) => _store.enrolledTypes(wordId);

  Future<void> setSuspended(StudyCard card, bool suspended) => _store.setSuspended(card.id, suspended, _clock.now());

  Future<HomeSummary> summary() async {
    final now = _clock.now();
    final profile = await _profile();
    final day = localDayBounds(now, timeZone: profile.timezone);
    final queue = await loadQueue();
    return HomeSummary(
      dueToday: queue.learning.length + queue.reviews.length,
      newAvailableToday: queue.newCards.length,
      reviewedToday: await _store.countReviewsSince(day.start),
      cardsByState: await _store.countCardsByState(),
      pendingSync: await _store.outboxCount(),
      unenrolledByLevel: await _store.unenrolledCountByLevel(),
      categories: await _store.categories(),
    );
  }

  /// Statisztika a helyi naplóból: napi aktivitás, pontosság, sorozat, előrejelzés.
  Future<StudyStats> stats() async {
    final now = _clock.now();
    final tz = (await _profile()).timezone;
    final today = localDayBounds(now, timeZone: tz);

    // A nap kezdetei visszafelé 29 napig (a DST-váltás miatt nem 24 órás lépésekkel).
    final dayStarts = <DateTime>[today.start];
    for (var i = 1; i < 30; i++) {
      dayStarts.insert(0, localDayBounds(dayStarts.first.subtract(const Duration(hours: 12)), timeZone: tz).start);
    }
    final logs = await _store.reviewsSince(dayStarts.first);
    final days = [
      for (var i = 0; i < dayStarts.length; i++)
        () {
          final end = i + 1 < dayStarts.length ? dayStarts[i + 1] : today.end;
          final inDay = logs.where((l) => !l.reviewedAt.isBefore(dayStarts[i]) && l.reviewedAt.isBefore(end));
          return (day: dayStarts[i], reviews: inDay.length, correct: inDay.where((l) => l.grade >= 3).length);
        }(),
    ];

    final forecastEnds = <DateTime>[today.end];
    for (var i = 1; i < 14; i++) {
      forecastEnds.add(localDayBounds(forecastEnds.last.add(const Duration(hours: 12)), timeZone: tz).end);
    }
    final dueTimes = await _store.dueTimesUntil(forecastEnds.last);
    final forecast = [
      for (var i = 0; i < forecastEnds.length; i++)
        (
          day: i == 0 ? today.start : forecastEnds[i - 1],
          // Az első nap a lemaradást (korábban esedékes kártyákat) is tartalmazza.
          due: dueTimes.where((t) => t.isBefore(forecastEnds[i]) && (i == 0 || !t.isBefore(forecastEnds[i - 1]))).length,
        ),
    ];

    final total = logs.length;
    final correct = logs.where((l) => l.grade >= 3).length;
    return StudyStats(
      days: days,
      forecast: forecast,
      reviewsLast30Days: total,
      accuracyLast30Days: total == 0 ? null : correct / total,
      avgResponseMsLast30Days: total == 0 ? null : (logs.fold<int>(0, (a, l) => a + l.responseTimeMs) / total).round(),
      streakDays: _streak(await _store.allReviewTimes(), today.start, tz),
      cardsByState: await _store.countCardsByState(),
      cardsByType: await _store.countCardsByType(),
      hardest: await _store.hardestCards(),
    );
  }

  /// Egymást követő tanulási napok száma a mai (vagy, ha ma még nem volt, a tegnapi) naptól visszafelé.
  static int _streak(List<DateTime> timesDesc, DateTime todayStart, String tz) {
    final days = <DateTime>{for (final t in timesDesc) localDayBounds(t, timeZone: tz).start};
    var cursor = todayStart;
    if (!days.contains(cursor)) {
      cursor = localDayBounds(cursor.subtract(const Duration(hours: 12)), timeZone: tz).start;
    }
    var streak = 0;
    while (days.contains(cursor)) {
      streak++;
      cursor = localDayBounds(cursor.subtract(const Duration(hours: 12)), timeZone: tz).start;
    }
    return streak;
  }

  /// Az ütemező konfigurációja a profilban választott célmegtartással.
  Future<SchedulerConfig> _schedulerConfig() async {
    final target = (await _profile()).targetRetention;
    return target == _config.targetRetention ? _config : _config.withTargetRetention(target);
  }

  Future<UserProfile> _profile() async {
    final raw = await _store.getState(profileStateKey);
    if (raw == null) throw StateError('Nincs bejelentkezett felhasználó');
    return UserProfile.decode(raw);
  }
}
