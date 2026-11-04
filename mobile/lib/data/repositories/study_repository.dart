import 'package:uuid/uuid.dart';

import '../../core/time/clock.dart';
import '../../domain/cefr_levels.dart';
import '../../domain/sm2_scheduler.dart';
import '../../domain/topic_groups.dart';
import '../../domain/word_scope.dart';
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

/// Egy szókészlet (témakör vagy szint) összesítője a kezdőképernyőhöz.
class ScopeSummary<S extends WordScope> {
  const ScopeSummary({required this.scope, required this.totalWords, required this.enrolledWords, required this.knowledge});

  final S scope;
  final int totalWords;
  final int enrolledWords;

  /// Ismeret 0–1 között: a szókészlet szavainak átlagos találati aránya (a
  /// válaszidőtől függetlenül; a még nem gyakorolt szó 0-val számít).
  /// 0 = egyik szavára sem adott jó választ, 1 = minden szavára mindig jót.
  final double knowledge;
}

class HomeSummary {
  const HomeSummary({
    required this.dueToday,
    required this.newAvailableToday,
    required this.reviewedToday,
    required this.pendingSync,
    required this.enrolledWords,
    required this.levels,
    required this.topics,
  });

  final int dueToday;
  final int newAvailableToday;
  final int reviewedToday;
  final int pendingSync;

  /// Felvett szavak száma (a kártyák száma ennek többszöröse: szavanként több típus).
  final int enrolledWords;

  /// A szókincs szintjei (A1, A2 …) a szavak számával, szintsorrendben.
  final List<({String level, int words})> levels;
  final List<ScopeSummary<TopicScope>> topics;
}

/// A kártyák áttekintése (Beállítások → Kártyáim).
class CardsOverview {
  const CardsOverview({required this.enrolledWords, required this.cardsByState, required this.unenrolledByLevel});

  final int enrolledWords;
  final Map<CardState, int> cardsByState;
  final Map<String, int> unenrolledByLevel;
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
    final budget = await _dailyBudget(limit: limit);
    return StudyQueue(
      learning: await _store.dueCards(before: budget.dayEnd, states: _learningStates, limit: limit),
      reviews: await _store.dueCards(before: budget.dayEnd, states: [CardState.review], limit: budget.reviews),
      newCards: spreadByWord(await _store.newCards(limit: budget.newCards)),
      dayEndsAt: budget.dayEnd,
    );
  }

  static const _learningStates = [CardState.learning, CardState.relearning];
  static const _dueStates = [CardState.learning, CardState.relearning, CardState.review];

  /// A mai nap határai és a napi keretekből még hátralévő ismétlések / új kártyák.
  Future<({DateTime dayStart, DateTime dayEnd, int reviews, int newCards})> _dailyBudget({required int limit}) async {
    final profile = await _profile();
    final day = localDayBounds(_clock.now(), timeZone: profile.timezone);
    final reviewsDone = await _store.countReviewsSince(day.start, statesBefore: [CardState.review]);
    final newDone = await _store.countReviewsSince(day.start, statesBefore: [CardState.newCard]);
    return (
      dayStart: day.start,
      dayEnd: day.end,
      reviews: (profile.dailyReviewLimit - reviewsDone).clamp(0, limit),
      newCards: (profile.dailyNewCardsLimit - newDone).clamp(0, limit),
    );
  }

  /// Utánpótlás a végtelen gyakorláshoz: a ma esedékes kártyák, utánuk új
  /// kártyák a napi keret figyelmen kívül hagyásával. [exclude]: a munkamenet
  /// sorában már bent lévő kártyák.
  Future<List<StudyCard>> loadMore({int size = 20, Set<String> exclude = const {}}) =>
      _collect(size: size, exclude: exclude);

  /// Szókészlet-lecke (témakör vagy szint) sora: a szókészlet ma esedékes
  /// kártyái, a már felvett új kártyái, és ha ez kevés, a még fel nem vett
  /// szavai közül annyi kerül felvételre, amennyi a lecke kitöltéséhez kell
  /// (nem az egész szókészlet – így nem keletkezik több ezer feltöltendő
  /// módosítás). A sorrend és az ütemezés ugyanaz, mint a napi leckében.
  Future<List<StudyCard>> loadScopedQueue(WordScope scope, {int size = 20, Set<String> exclude = const {}}) async {
    final cards = await _collect(size: size, exclude: exclude, scope: scope);
    if (cards.length >= size) return cards;
    final types = await preferredCardTypes();
    final words = await _store.unenrolledWordsIn(scope, limit: ((size - cards.length) / types.length).ceil() + 1);
    if (words.isEmpty) return cards;
    await enrollWords(words, types: types);
    return _collect(size: size, exclude: exclude, scope: scope);
  }

  /// Ma esedékes kártyák, utánuk új kártyák (a napi keret nélkül), a sorban már
  /// bent lévők ([exclude]) kihagyásával.
  Future<List<StudyCard>> _collect({required int size, required Set<String> exclude, WordScope? scope}) async {
    final profile = await _profile();
    final dayEnd = localDayBounds(_clock.now(), timeZone: profile.timezone).end;
    final want = size + exclude.length;
    final due = await _store.dueCards(before: dayEnd, states: _dueStates, limit: want, scope: scope);
    // Szavanként több új kártya van egymás után: többet kérünk, hogy a
    // szétszórás után is több szó kerüljön a sorba.
    final fresh = due.length >= want ? const <StudyCard>[] : await _store.newCards(limit: want * CardType.values.length, scope: scope);
    return [...due, ...spreadByWord(fresh)].where((c) => !exclude.contains(c.id)).take(size).toList();
  }

  /// Az új kártyák sorrendje úgy, hogy ugyanannak a szónak a kártyái ne
  /// kövessék egymást (különben a „Mit jelent?” hátlapja elárulná a következő
  /// „Hogy mondod németül?” kártya válaszát): előbb minden szó első kártyája,
  /// aztán a másodikak stb.
  static List<StudyCard> spreadByWord(List<StudyCard> cards) {
    final byWord = <String, List<StudyCard>>{};
    for (final c in cards) {
      byWord.putIfAbsent(c.wordId, () => []).add(c);
    }
    for (final list in byWord.values) {
      list.sort((a, b) => a.cardType.index.compareTo(b.cardType.index));
    }
    final result = <StudyCard>[];
    for (var round = 0; result.length < cards.length; round++) {
      for (final list in byWord.values) {
        if (round < list.length) result.add(list[round]);
      }
    }
    return result;
  }

  /// Egy szókészlet összesítője (szavak, felvett szavak, ismeret).
  Future<ScopeSummary<S>> scopeSummary<S extends WordScope>(S scope) async {
    final stats = await _store.scopeStats(scope);
    return ScopeSummary(
      scope: scope,
      totalWords: stats.total,
      enrolledWords: stats.enrolled,
      knowledge: stats.total == 0 ? 0 : stats.knowledgeSum / stats.total,
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

  Future<List<({Word word, bool enrolled})>> searchWords({
    String query = '',
    String? cefrLevel,
    WordScope? scope,
    bool customOnly = false,
    int limit = 100,
  }) =>
      _store.searchWords(query: query, cefrLevel: cefrLevel, scope: scope, customOnly: customOnly, limit: limit);

  Future<Set<CardType>> enrolledTypes(String wordId) => _store.enrolledTypes(wordId);

  Future<void> setSuspended(StudyCard card, bool suspended) => _store.setSuspended(card.id, suspended, _clock.now());

  /// A kezdőképernyő összesítője – csak számlálás, kártyák betöltése nélkül
  /// (minden szinkron és lecke után újraszámolódik, ezért legyen olcsó).
  Future<HomeSummary> summary() async {
    const limit = 200;
    final budget = await _dailyBudget(limit: limit);
    final learning = await _store.countDueCards(before: budget.dayEnd, states: _learningStates);
    final reviews = await _store.countDueCards(before: budget.dayEnd, states: [CardState.review]);
    final levels = await _store.wordCountByLevel();
    return HomeSummary(
      dueToday: learning.clamp(0, limit) + reviews.clamp(0, budget.reviews),
      newAvailableToday: (await _store.countNewCards()).clamp(0, budget.newCards),
      reviewedToday: await _store.countReviewsSince(budget.dayStart),
      pendingSync: await _store.outboxCount(),
      enrolledWords: await _store.countEnrolledWords(),
      levels: [
        for (final level in cefrLevels)
          if (levels[level] case final words?) (level: level, words: words),
      ],
      topics: [
        for (final group in topicGroups)
          if (await scopeSummary(TopicScope(group)) case final topic when topic.totalWords > 0) topic,
      ],
    );
  }

  /// Kártyák állapot szerint, felvett szavak, szintenként a még fel nem vett szavak.
  Future<CardsOverview> cardsOverview() async => CardsOverview(
        enrolledWords: await _store.countEnrolledWords(),
        cardsByState: await _store.countCardsByState(),
        unenrolledByLevel: await _store.unenrolledCountByLevel(),
      );

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
