import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:szokartya/core/time/clock.dart';
import 'package:szokartya/data/local/app_database.dart';
import 'package:szokartya/data/local/local_store.dart';
import 'package:szokartya/data/models/study_card.dart';
import 'package:szokartya/domain/answer_check.dart';
import 'package:szokartya/domain/sm2_scheduler.dart';
import 'package:szokartya/domain/topic_groups.dart';
import 'package:szokartya/domain/word_scope.dart';
import 'package:szokartya/features/study/study_session_controller.dart';
import 'package:szokartya/features/sync/sync_controller.dart';
import 'package:szokartya/providers.dart';

import '../helpers/test_support.dart';

/// Hálózat nélküli szinkronvezérlő: csak számolja a kéréseket.
class FakeSyncController extends SyncController {
  int scheduled = 0;

  @override
  SyncStatus build() => const SyncStatus();

  @override
  void scheduleSync() => scheduled++;

  @override
  Future<void> syncNow() async {}
}

void main() {
  late AppDatabase db;
  late LocalStore store;
  late ProviderContainer container;
  late FakeSyncController sync;
  final clock = FakeClock(DateTime.utc(2026, 3, 10, 9));

  const daily = StudySessionArgs();

  Future<StudySessionState> settled([StudySessionArgs args = daily]) async {
    for (var i = 0; i < 100 && container.read(studySessionProvider(args)).phase == StudyPhase.loading; i++) {
      await Future<void>.delayed(Duration.zero);
    }
    return container.read(studySessionProvider(args));
  }

  Future<void> start({int newCards = 3, int dailyNew = 20, StudySessionArgs args = daily, List<({String slug, String nameHu})> categories = const []}) async {
    db = await openTestDatabase();
    store = LocalStore(db);
    await seedProfile(store, dailyNew: dailyNew);
    final words = [for (var i = 0; i < newCards; i++) wordJson(id: 'w$i', lemma: 'Wort$i', translation: 'szó$i', categories: categories)];
    await store.applyServerWords(words);
    await store.enrollLocally([for (var i = 0; i < newCards; i++) (id: 'c$i', wordId: 'w$i', type: CardType.recognition)], clock.now());

    sync = FakeSyncController();
    container = ProviderContainer(overrides: [
      databaseProvider.overrideWithValue(db),
      clockProvider.overrideWithValue(clock),
      syncControllerProvider.overrideWith(() => sync),
    ]);
    // autoDispose provider – a teszt idejére életben tartjuk.
    container.listen(studySessionProvider(args), (_, _) {});
  }

  tearDown(() async {
    container.dispose();
    await db.close();
  });

  StudySessionController controller([StudySessionArgs args = daily]) => container.read(studySessionProvider(args).notifier);
  StudySessionState read([StudySessionArgs args = daily]) => container.read(studySessionProvider(args));

  /// A helyes válasz az aktuális kártyára (felismerés: „szóN”).
  String rightAnswer([StudySessionArgs args = daily]) => read(args).current!.word.primaryTranslation;

  test('betöltés után az első kártya előlapja látszik; a lecke 20 kártyás', () async {
    await start();
    final s = await settled();
    expect(s.phase, StudyPhase.question);
    expect(s.goal, lessonSize);
    expect(s.remaining, 20);
    expect(s.current!.id, 'c0');
  });

  test('üres sor → azonnal kész', () async {
    await start(newCards: 0);
    final s = await settled();
    expect(s.phase, StudyPhase.finished);
    expect(s.outOfCards, isTrue);
  });

  test('a napi új-kártya keret korlátozza a sort', () async {
    await start(newCards: 5, dailyNew: 2);
    expect((await settled()).queue, hasLength(2));
  });

  test('helyes, gyors válasz: automatikus „könnyű” értékelés, mentés a válaszkor, a számláló csökken', () async {
    await start();
    await settled();
    await controller().answer(rightAnswer());

    var s = read();
    expect(s.phase, StudyPhase.answer);
    expect(s.check!.verdict, AnswerVerdict.correct);
    expect(s.grade, 5);
    expect((await store.card('c0'))!.scheduling.intervalDays, 4);
    expect(s.answered, 1);
    expect(s.remaining, 19);
    expect(sync.scheduled, 1);
    expect((await store.outbox(kind: OutboxKind.review, limit: 10)).single.payload['grade'], 5);

    await controller().next();
    s = read();
    expect(s.phase, StudyPhase.question);
    expect(s.queue.map((c) => c.id), ['c1', 'c2'], reason: 'a könnyű kártya mára kikerül');
  });

  test('hibás válasz („nem tudom”): értékelés 1, a kártya a sor végére kerül, de a számláló így is csökken', () async {
    await start();
    await settled();
    await controller().answer('');
    var s = read();
    expect(s.check!.verdict, AnswerVerdict.wrong);
    expect(s.grade, 1);
    expect(s.answered, 1);
    expect(s.correct, 0);
    await controller().next();
    s = read();
    expect(s.queue.map((c) => c.id), ['c1', 'c2', 'c0']);
    expect(s.remaining, 19);
    expect((await store.card('c0'))!.scheduling.state, CardState.learning);
  });

  test('a lecke 20 válasz után véget ér, akkor is, ha minden válasz hibás', () async {
    await start(newCards: 3);
    await settled();
    for (var i = 0; i < 20; i++) {
      expect(read().phase, StudyPhase.question, reason: '$i. kártya');
      await controller().answer('rossz');
      await controller().next();
    }
    final s = read();
    expect(s.phase, StudyPhase.finished);
    expect(s.answered, 20);
    expect(s.outOfCards, isFalse);
    expect(await store.countReviewsSince(clock.now().subtract(const Duration(hours: 1))), 20);
  });

  test('ha minden kártya kikerül a sorból, a lecke 20 előtt véget ér', () async {
    await start(newCards: 2);
    await settled();
    for (var i = 0; i < 2; i++) {
      await controller().answer(rightAnswer());
      await controller().next();
    }
    final s = read();
    expect(s.phase, StudyPhase.finished);
    expect(s.answered, 2);
    expect(s.outOfCards, isTrue);
  });

  test('végtelen mód: nincs 20-as korlát, a sor új kártyákkal töltődik (a napi kereten túl is)', () async {
    const endless = StudySessionArgs(endless: true);
    await start(newCards: 30, dailyNew: 2, args: endless);
    final first = await settled(endless);
    expect(first.goal, isNull);
    expect(first.remaining, isNull);
    for (var i = 0; i < 25; i++) {
      expect(read(endless).phase, StudyPhase.question, reason: '$i. kártya');
      await controller(endless).answer(rightAnswer(endless));
      await controller(endless).next();
    }
    expect(read(endless).answered, 25);
    expect(read(endless).phase, StudyPhase.question);
  });

  test('témakör-lecke: csak a témakör szavai; a még fel nem vett szavakból annyit vesz fel, amennyi kell', () async {
    const topic = StudySessionArgs(scope: TopicScope(TopicGroup(id: 'termeszet', nameHu: 'Természet', slugs: ['natur'])));
    await start(newCards: 0, args: topic);
    final nature = [for (var i = 0; i < 30; i++) wordJson(id: 'n$i', lemma: 'Baum$i', translation: 'fa$i', categories: [(slug: 'natur', nameHu: 'Természet')])];
    final other = [for (var i = 0; i < 5; i++) wordJson(id: 'o$i', lemma: 'Geld$i', translation: 'pénz$i', categories: [(slug: 'wirtschaft', nameHu: 'Gazdaság')])];
    await store.applyServerWords([...nature, ...other]);
    container.invalidate(studySessionProvider(topic));
    container.listen(studySessionProvider(topic), (_, _) {});

    final s = await settled(topic);
    expect(s.phase, StudyPhase.question);
    expect(s.queue, hasLength(20));
    expect(s.queue.every((c) => c.wordId.startsWith('n')), isTrue);
    final enrolledWords = (await db.db.rawQuery('SELECT DISTINCT word_id FROM cards')).length;
    expect(enrolledWords, lessThan(30), reason: 'nem az egész témakör kerül felvételre');
  });

  test('a mért megoldási idő kerül a naplóba', () async {
    await start();
    await settled();
    await Future<void>.delayed(const Duration(milliseconds: 60));
    await controller().answer(rightAnswer());
    final log = (await db.db.query('review_log')).single;
    expect(log['response_time_ms']! as int, greaterThanOrEqualTo(50));
  });

  test('a nap végén túl esedékes tanulási kártya nem kerül vissza a sorba', () async {
    // A „nap” a profil időzónája (Europe/Budapest) szerint ér véget, nem az eszközé.
    clock.time = localDayBounds(DateTime.utc(2026, 3, 10, 12), timeZone: 'Europe/Budapest').end.subtract(const Duration(minutes: 5));
    expect(clock.now(), DateTime.utc(2026, 3, 10, 22, 55));
    await start(newCards: 1);
    await settled();
    // Majdnem helyes (ékezethiba) → „nehéz” → tanulási lépcső, 10 perc múlva esedékes → már holnap.
    await controller().answer('szo0');
    expect(read().grade, 3);
    await controller().next();
    expect(read().phase, StudyPhase.finished);
    clock.time = DateTime.utc(2026, 3, 10, 9);
  });
}
