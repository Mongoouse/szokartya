import 'package:flutter_test/flutter_test.dart';
import 'package:szokartya/data/local/app_database.dart';
import 'package:szokartya/data/local/local_store.dart';
import 'package:szokartya/data/models/study_card.dart';
import 'package:szokartya/domain/sm2_scheduler.dart';

import '../helpers/test_support.dart';

void main() {
  late AppDatabase db;
  late LocalStore store;
  final now = DateTime.utc(2026, 3, 10, 9);

  setUp(() async {
    db = await openTestDatabase();
    store = LocalStore(db);
    await store.applyServerWords([wordJson(id: 'w1'), wordJson(id: 'w2', lemma: 'Stuhl')]);
  });
  tearDown(() => db.close());

  Future<StudyCard> enrollOne(String id, {String wordId = 'w1', CardType type = CardType.recognition}) async {
    await store.enrollLocally([(id: id, wordId: wordId, type: type)], now);
    return (await store.card(id))!;
  }

  group('helyi írások', () {
    test('felvétel: kártya NEW állapotban + kimenő bejegyzés; ismételt felvétel kihagyva', () async {
      expect(await store.enrollLocally([(id: 'c1', wordId: 'w1', type: CardType.recognition)], now), 1);
      expect(await store.enrollLocally([(id: 'c2', wordId: 'w1', type: CardType.recognition)], now), 0);

      final outbox = await store.outbox(kind: OutboxKind.enroll, limit: 10);
      expect(outbox.single.payload, {'progressId': 'c1', 'wordId': 'w1', 'cardType': 'RECOGNITION'});
      expect((await store.newCards(limit: 10)).map((c) => c.id), ['c1']);
    });

    test('értékelés: állapot + napló + kimenő bejegyzés egy tranzakcióban', () async {
      final card = await enrollOne('c1');
      final after = scheduleReview(card.scheduling, grade: 4, responseTimeMs: 1500, reviewedAt: now).card;
      await store.recordReview(LocalReview(
        reviewId: 'r1',
        cardId: 'c1',
        grade: 4,
        responseTimeMs: 1500,
        reviewedAt: now,
        before: card.scheduling,
        after: after,
      ));

      expect((await store.card('c1'))!.scheduling.state, CardState.learning);
      expect(await store.countReviewsSince(now.subtract(const Duration(hours: 1)), statesBefore: [CardState.newCard]), 1);
      final outbox = await store.outbox(kind: OutboxKind.review, limit: 10);
      expect(outbox.single.payload, containsPair('reviewId', 'r1'));
    });

    test('atomikus: ha a napló beszúrása elbukik (duplikált reviewId), a kártya sem változik', () async {
      final card = await enrollOne('c1');
      final after = scheduleReview(card.scheduling, grade: 4, responseTimeMs: 1500, reviewedAt: now).card;
      final review = LocalReview(reviewId: 'r1', cardId: 'c1', grade: 4, responseTimeMs: 1500, reviewedAt: now, before: card.scheduling, after: after);
      await store.recordReview(review);
      final snapshot = (await store.card('c1'))!.scheduling;

      final second = scheduleReview(after, grade: 1, responseTimeMs: 1500, reviewedAt: now).card;
      await expectLater(
        store.recordReview(LocalReview(reviewId: 'r1', cardId: 'c1', grade: 1, responseTimeMs: 1, reviewedAt: now, before: after, after: second)),
        throwsA(anything),
      );
      expect((await store.card('c1'))!.scheduling.totalReviews, snapshot.totalReviews);
      expect(await store.outboxCount(), 2); // enroll + 1 review
    });

    test('felfüggesztés: kimenő jelzőmódosítás az utolsó ismert szerververzióval', () async {
      await enrollOne('c1');
      await store.applyServerCards([progressJson(id: 'c1', wordId: 'w1', version: 3)]);
      await store.setSuspended('c1', true, now);
      final change = (await store.outbox(kind: OutboxKind.cardChange, limit: 10)).single;
      expect(change.payload, containsPair('baseVersion', 3));
      expect(await store.card('c1'), isNull, reason: 'felfüggesztett kártya nem jelenik meg a sorban');
    });
  });

  group('szerverállapot alkalmazása', () {
    test('szavak: régebbi verzió nem írja felül az újabbat; törölt szó eltűnik', () async {
      await store.applyServerWords([wordJson(id: 'w1', translation: 'új', version: 50)]);
      await store.applyServerWords([wordJson(id: 'w1', translation: 'régi', version: 40)]);
      await enrollOne('c1');
      expect((await store.card('c1'))!.word.primaryTranslation, 'új');

      await store.applyServerWords([wordJson(id: 'w1', version: 51, deleted: true)]);
      expect(await store.card('c1'), isNull);
    });

    test('kártya: azonos vagy régebbi verzió kihagyva (átfedő pull)', () async {
      await store.applyServerCards([progressJson(id: 'c1', wordId: 'w1', state: 'REVIEW', version: 5, intervalDays: 6, nextReviewAt: now)]);
      await store.applyServerCards([progressJson(id: 'c1', wordId: 'w1', state: 'NEW', version: 5)]);
      await store.applyServerCards([progressJson(id: 'c1', wordId: 'w1', state: 'NEW', version: 4)]);
      final card = (await store.dueCards(before: now, states: [CardState.review], limit: 10)).single;
      expect(card.scheduling.intervalDays, 6);
      expect(card.serverVersion, 5);
    });

    test('feltöltetlen helyi értékelés esetén az ütemezési mezőket nem írja felül', () async {
      final card = await enrollOne('c1');
      final after = scheduleReview(card.scheduling, grade: 5, responseTimeMs: 900, reviewedAt: now).card;
      await store.recordReview(LocalReview(reviewId: 'r1', cardId: 'c1', grade: 5, responseTimeMs: 900, reviewedAt: now, before: card.scheduling, after: after));

      // Közben egy másik eszköz miatt újabb szerververzió jön, még a helyi értékelés nélkül.
      await store.applyServerCards([progressJson(id: 'c1', wordId: 'w1', state: 'NEW', version: 2, isSuspended: false)]);
      final local = (await store.card('c1'))!;
      expect(local.scheduling.state, CardState.review, reason: 'a helyi haladás nem ugrik vissza');
      expect(local.serverVersion, 2);
    });

    test('ugyanarra a (szó, típus) párra érkező szerverkártya átveszi a helyi azonosítót (remap)', () async {
      await enrollOne('local-id');
      final card = (await store.card('local-id'))!;
      final after = scheduleReview(card.scheduling, grade: 4, responseTimeMs: 1000, reviewedAt: now).card;
      await store.recordReview(LocalReview(reviewId: 'r1', cardId: 'local-id', grade: 4, responseTimeMs: 1000, reviewedAt: now, before: card.scheduling, after: after));

      await store.applyServerCards([progressJson(id: 'server-id', wordId: 'w1', version: 3)]);

      expect(await store.card('local-id'), isNull);
      expect(await store.card('server-id'), isNotNull);
      final pending = await store.outbox(kind: OutboxKind.review, limit: 10);
      expect(pending.single.entityId, 'server-id');
      expect(pending.single.payload['progressId'], 'server-id');
      final logs = await db.db.query('review_log');
      expect(logs.single['card_id'], 'server-id');
    });

    test('remapCardId: minden hivatkozást átír', () async {
      await enrollOne('a');
      await store.setSuspended('a', true, now);
      await store.remapCardId('a', 'b');
      expect((await db.db.query('cards')).single['id'], 'b');
      final entries = [...await store.outbox(kind: OutboxKind.enroll, limit: 10), ...await store.outbox(kind: OutboxKind.cardChange, limit: 10)];
      expect(entries.every((e) => e.entityId == 'b' && e.payload['progressId'] == 'b'), isTrue);
    });

    test('elutasított kártya eldobása a várakozó módosításaival együtt', () async {
      await enrollOne('c1');
      await store.discardCard('c1');
      expect(await store.card('c1'), isNull);
      expect(await store.outboxCount(), 0);
    });

    test('lehúzott napló beszámít a napi keretbe (más eszköz értékelései)', () async {
      await store.applyServerReviewLogs([
        {
          'id': 'x',
          'progressId': 'c9',
          'grade': 4,
          'responseTimeMs': 1000,
          'reviewedAt': now.toIso8601String(),
          'stateBefore': 'NEW',
          'stateAfter': 'LEARNING',
        },
      ]);
      expect(await store.countReviewsSince(now.subtract(const Duration(minutes: 1)), statesBefore: [CardState.newCard]), 1);
    });
  });

  test('wipe: minden helyi adat törlődik', () async {
    await enrollOne('c1');
    await store.setState('k', 'v');
    await store.wipe();
    expect(await store.outboxCount(), 0);
    expect(await store.getState('k'), isNull);
    expect(await db.db.query('words'), isEmpty);
  });
}
