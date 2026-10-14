import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:szokartya/core/time/clock.dart';
import 'package:szokartya/data/local/app_database.dart';
import 'package:szokartya/data/local/local_store.dart';
import 'package:szokartya/data/models/study_card.dart';
import 'package:szokartya/domain/sm2_scheduler.dart';
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

  Future<StudySessionState> settled() async {
    for (var i = 0; i < 100 && container.read(studySessionProvider).phase == StudyPhase.loading; i++) {
      await Future<void>.delayed(Duration.zero);
    }
    return container.read(studySessionProvider);
  }

  Future<void> start({int newCards = 3, int dailyNew = 20}) async {
    db = await openTestDatabase();
    store = LocalStore(db);
    await seedProfile(store, dailyNew: dailyNew);
    final words = [for (var i = 0; i < newCards; i++) wordJson(id: 'w$i', lemma: 'Wort$i')];
    await store.applyServerWords(words);
    await store.enrollLocally([for (var i = 0; i < newCards; i++) (id: 'c$i', wordId: 'w$i', type: CardType.recognition)], clock.now());

    sync = FakeSyncController();
    container = ProviderContainer(overrides: [
      databaseProvider.overrideWithValue(db),
      clockProvider.overrideWithValue(clock),
      syncControllerProvider.overrideWith(() => sync),
    ]);
    // autoDispose provider – a teszt idejére életben tartjuk.
    container.listen(studySessionProvider, (_, _) {});
  }

  tearDown(() async {
    container.dispose();
    await db.close();
  });

  StudySessionController controller() => container.read(studySessionProvider.notifier);

  test('betöltés után az első kártya előlapja látszik', () async {
    await start();
    final s = await settled();
    expect(s.phase, StudyPhase.question);
    expect(s.remaining, 3);
    expect(s.current!.id, 'c0');
  });

  test('üres sor → azonnal kész', () async {
    await start(newCards: 0);
    expect((await settled()).phase, StudyPhase.finished);
  });

  test('a napi új-kártya keret korlátozza a sort', () async {
    await start(newCards: 5, dailyNew: 2);
    expect((await settled()).remaining, 2);
  });

  test('megfordítás: válasz fázis, intervallum-előnézet minden gombhoz', () async {
    await start();
    await settled();
    controller().reveal();
    final s = container.read(studySessionProvider);
    expect(s.phase, StudyPhase.answer);
    expect(s.preview.keys, containsAll([1, 3, 4, 5]));
    expect(s.preview[1], const Duration(minutes: 1));
    expect(s.preview[4], const Duration(minutes: 10));
    expect(s.preview[5], const Duration(days: 4));
  });

  test('értékelés megfordítás előtt nem lehetséges', () async {
    await start();
    await settled();
    await controller().grade(4);
    expect(container.read(studySessionProvider).reviewed, 0);
    expect(await store.outboxCount(), 3, reason: 'csak a felvételek');
  });

  test('értékelés: helyi mentés, következő kártya, szinkron ütemezése; a tanulási lépcsős kártya visszakerül a sor végére', () async {
    await start();
    await settled();
    controller().reveal();
    await controller().grade(4); // c0 → LEARNING (10 perc), ma még esedékes

    final s = container.read(studySessionProvider);
    expect(s.phase, StudyPhase.question);
    expect(s.reviewed, 1);
    expect(s.correct, 1);
    expect(s.queue.map((c) => c.id), ['c1', 'c2', 'c0']);
    expect(s.queue.last.scheduling.state, CardState.learning);
    expect(sync.scheduled, 1);
    expect((await store.card('c0'))!.scheduling.state, CardState.learning);
  });

  test('„könnyű” válasz után a kártya mára kikerül; minden kártya után kész', () async {
    await start(newCards: 2);
    await settled();
    for (var i = 0; i < 2; i++) {
      controller().reveal();
      await controller().grade(5);
    }
    final s = container.read(studySessionProvider);
    expect(s.phase, StudyPhase.finished);
    expect(s.reviewed, 2);
    expect(await store.countReviewsSince(clock.now().subtract(const Duration(hours: 1))), 2);
  });

  test('hiba esetén a pontosság nem nő; dupla koppintás csak egy értékelést rögzít', () async {
    await start();
    await settled();
    controller().reveal();
    await Future.wait([controller().grade(1), controller().grade(1)]);
    final s = container.read(studySessionProvider);
    expect(s.reviewed, 1);
    expect(s.correct, 0);
    expect((await store.outbox(kind: OutboxKind.review, limit: 10)), hasLength(1));
  });

  test('a mért reakcióidő kerül a naplóba', () async {
    await start();
    await settled();
    await Future<void>.delayed(const Duration(milliseconds: 60));
    controller().reveal();
    await controller().grade(4);
    final log = (await db.db.query('review_log')).single;
    expect(log['response_time_ms'] as int, greaterThanOrEqualTo(50));
  });

  test('a nap végén túl esedékes tanulási kártya nem kerül vissza a sorba', () async {
    clock.time = localDayBounds(DateTime.utc(2026, 3, 10, 12)).end.subtract(const Duration(minutes: 5));
    await start(newCards: 1);
    await settled();
    controller().reveal();
    await controller().grade(4); // 10 perc múlva esedékes → már holnap
    expect(container.read(studySessionProvider).phase, StudyPhase.finished);
    clock.time = DateTime.utc(2026, 3, 10, 9);
  });
}
