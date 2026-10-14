import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:szokartya/core/api/api_client.dart';
import 'package:szokartya/core/api/api_exception.dart';
import 'package:szokartya/core/api/token_store.dart';
import 'package:szokartya/core/config/app_config.dart';
import 'package:szokartya/data/local/app_database.dart';
import 'package:szokartya/data/local/local_store.dart';
import 'package:szokartya/data/models/study_card.dart';
import 'package:szokartya/data/repositories/auth_repository.dart';
import 'package:szokartya/data/models/user_settings.dart';
import 'package:szokartya/data/repositories/study_repository.dart';
import 'package:szokartya/sync/sync_engine.dart';

import '../helpers/test_support.dart';

/// Egyszerű, programozható hamis szerver a szinkron végpontokhoz.
class FakeServer {
  final pushes = <Json>[];
  final pullCursors = <String?>[];
  Json Function(Json body) onPush = (body) => {
        'serverTime': DateTime.utc(2026).toIso8601String(),
        'clockOffsetMs': 0,
        'enrollments': [
          for (final e in (body['enrollments'] as List).cast<Json>())
            {'progressId': e['progressId'], 'status': 'created', 'serverProgressId': e['progressId']},
        ],
        'cardChanges': [
          for (final c in (body['cardChanges'] as List).cast<Json>()) {'progressId': c['progressId'], 'status': 'applied'},
        ],
        'reviews': [
          for (final r in (body['reviews'] as List).cast<Json>()) {'reviewId': r['reviewId'], 'status': 'applied'},
        ],
      };
  List<Json> pullPages = [];
  int failPushTimes = 0;
  int pullBadCursorTimes = 0;
  Duration pushDelay = Duration.zero;

  http.Client get client => MockClient((req) async {
        final path = req.url.path.replaceFirst('/api/v1', '');
        switch (path) {
          case '/sync/push':
            if (failPushTimes > 0) {
              failPushTimes--;
              throw http.ClientException('kapcsolat megszakadt');
            }
            await Future<void>.delayed(pushDelay);
            final body = jsonDecode(req.body) as Json;
            pushes.add(body);
            return _json(onPush(body));
          case '/sync/pull':
            final cursor = req.url.queryParameters['cursor'];
            pullCursors.add(cursor);
            if (cursor != null && pullBadCursorTimes > 0) {
              pullBadCursorTimes--;
              return _json({'message': 'Érvénytelen kurzor'}, 400);
            }
            final page = pullPages.isEmpty ? _emptyPage('final') : pullPages.removeAt(0);
            return _json(page);
          case '/users/me':
            return _json(UserProfile(
              id: 'u1',
              email: 'anna@example.hu',
              displayName: 'Anna',
              timezone: 'Europe/Budapest',
              dailyNewCardsLimit: 7,
              dailyReviewLimit: 70,
            ).toJson());
        }
        return _json({'message': 'ismeretlen: $path'}, 404);
      });

  static Json _emptyPage(String cursor) =>
      {'serverTime': DateTime.utc(2026).toIso8601String(), 'cursor': cursor, 'hasMore': false, 'progress': <Json>[], 'words': <Json>[], 'reviewLogs': <Json>[]};

  static http.Response _json(Object body, [int status = 200]) =>
      http.Response(jsonEncode(body), status, headers: {'content-type': 'application/json; charset=utf-8'});
}

Json page({required String cursor, bool hasMore = false, List<Json> words = const [], List<Json> progress = const []}) => {
      'serverTime': DateTime.utc(2026).toIso8601String(),
      'cursor': cursor,
      'hasMore': hasMore,
      'progress': progress,
      'words': words,
      'reviewLogs': <Json>[],
    };

void main() {
  late AppDatabase db;
  late LocalStore store;
  late FakeServer server;
  late SyncEngine engine;
  late StudyRepository study;
  final clock = FakeClock(DateTime.utc(2026, 3, 10, 9));

  setUp(() async {
    db = await openTestDatabase();
    store = LocalStore(db);
    await seedProfile(store);
    await store.applyServerWords([wordJson(id: 'w1'), wordJson(id: 'w2', lemma: 'Stuhl')]);
    server = FakeServer();
    final tokens = InMemoryTokenStore();
    await tokens.write(const AuthTokens(accessToken: 'a', refreshToken: 'r'));
    final api = ApiClient(config: const AppConfig(apiBaseUrl: 'https://api.test/api/v1'), tokenStore: tokens, httpClient: server.client);
    engine = SyncEngine(api: api, store: store, clock: clock);
    study = StudyRepository(store: store, clock: clock);
  });
  tearDown(() => db.close());

  Future<void> enrollAndReview() async {
    await store.enrollLocally([(id: 'c1', wordId: 'w1', type: CardType.recognition)], clock.now());
    await study.review((await store.card('c1'))!, grade: 4, responseTimeMs: 1200);
  }

  test('push: a kimenő sort egy kötegben küldi, majd kiüríti; utána pull és profilfrissítés', () async {
    await enrollAndReview();
    final report = await engine.sync();

    expect(server.pushes, hasLength(1));
    final body = server.pushes.single;
    expect(body['clientTime'], clock.now().toIso8601String());
    expect(body['deviceId'], isA<String>());
    expect((body['enrollments'] as List), hasLength(1));
    expect((body['reviews'] as List).single, containsPair('progressId', 'c1'));

    expect(report.pushed, 2);
    expect(await store.outboxCount(), 0);
    expect((await db.db.query('review_log')).single['synced'], 1);
    expect(await store.getState('sync.cursor'), 'final');
    expect(UserProfile.decode((await store.getState(profileStateKey))!).dailyNewCardsLimit, 7);
  });

  test('„exists” válasz: a helyi kártya és minden hivatkozása a szerver azonosítójára íródik', () async {
    await enrollAndReview();
    await store.setSuspended('c1', true, clock.now());
    server.onPush = (body) => {
          'serverTime': clock.now().toIso8601String(),
          'clockOffsetMs': 0,
          'enrollments': [
            {'progressId': 'c1', 'status': 'exists', 'serverProgressId': 'server-c1'},
          ],
          'cardChanges': [
            {'progressId': 'c1', 'status': 'applied'},
          ],
          'reviews': [
            for (final r in (body['reviews'] as List).cast<Json>()) {'reviewId': r['reviewId'], 'status': 'applied'},
          ],
        };
    await engine.sync();

    expect((await db.db.query('cards')).single['id'], 'server-c1');
    expect((await db.db.query('review_log')).single['card_id'], 'server-c1');
  });

  test('elutasított felvétel: a helyi kártya törlődik', () async {
    await store.enrollLocally([(id: 'c1', wordId: 'w1', type: CardType.recognition)], clock.now());
    server.onPush = (_) => {
          'serverTime': clock.now().toIso8601String(),
          'clockOffsetMs': 0,
          'enrollments': [
            {'progressId': 'c1', 'status': 'rejected', 'reason': 'unknown_word'},
          ],
          'cardChanges': <Json>[],
          'reviews': <Json>[],
        };
    final report = await engine.sync();
    expect(report.rejected, 1);
    expect(await store.card('c1'), isNull);
  });

  test('hálózati hiba: a kimenő sor megmarad, a következő szinkron feltölti (nincs adatvesztés)', () async {
    await enrollAndReview();
    server.failPushTimes = 1;
    await expectLater(engine.sync(), throwsA(isA<NetworkException>()));
    expect(await store.outboxCount(), 2);
    expect((await db.db.query('outbox')).every((r) => r['attempts'] == 1), isTrue);

    await engine.sync();
    expect(await store.outboxCount(), 0);
    expect(server.pushes, hasLength(1));
  });

  test('pull lapozás: a kurzort továbbadja, és a lapok sorrendjében alkalmaz', () async {
    server.pullPages = [
      page(cursor: 'p1', hasMore: true, words: [wordJson(id: 'w3', lemma: 'Lampe')]),
      page(cursor: 'p2', hasMore: true, progress: [progressJson(id: 's1', wordId: 'w3')]),
      page(cursor: 'p3'),
    ];
    final report = await engine.sync();
    expect(server.pullCursors, [null, 'p1', 'p2']);
    expect(report.pulled, 2);
    expect(await store.getState('sync.cursor'), 'p3');
    expect((await store.card('s1'))!.word.lemma, 'Lampe');
  });

  test('érvénytelen kurzor (400): egyszer teljes újraszinkront kezd', () async {
    await store.setState('sync.cursor', 'elavult');
    server.pullBadCursorTimes = 1;
    server.pullPages = [page(cursor: 'fresh')];
    await engine.sync();
    expect(server.pullCursors, ['elavult', null]);
    expect(await store.getState('sync.cursor'), 'fresh');
  });

  test('single-flight: párhuzamos hívások egyetlen futáson osztoznak', () async {
    await enrollAndReview();
    server.pushDelay = const Duration(milliseconds: 50);
    final results = await Future.wait([engine.sync(), engine.sync(), engine.sync()]);
    expect(server.pushes, hasLength(1));
    expect(identical(results[0], results[1]) && identical(results[1], results[2]), isTrue);
  });

  test('az eszközazonosító stabil a futások között', () async {
    final first = await engine.deviceId();
    expect(await engine.deviceId(), first);
  });
}
