@Tags(['e2e'])
library;

import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:szokartya/core/api/api_client.dart';
import 'package:szokartya/core/api/api_exception.dart';
import 'package:szokartya/core/api/token_store.dart';
import 'package:szokartya/core/config/app_config.dart';
import 'package:szokartya/core/time/clock.dart';
import 'package:szokartya/data/local/app_database.dart';
import 'package:szokartya/data/local/local_store.dart';
import 'package:szokartya/data/repositories/auth_repository.dart';
import 'package:szokartya/data/repositories/study_repository.dart';
import 'package:szokartya/domain/sm2_scheduler.dart';
import 'package:szokartya/sync/sync_engine.dart';

import '../helpers/test_support.dart';

/// Többeszközös adatintegritás VALÓDI backenddel.
///
/// Futtatás (a backend fusson, seedelt adatbázissal):
///   SZOKARTYA_E2E_API=http://localhost:3000/api/v1 flutter test --tags e2e
final apiUrl = Platform.environment['SZOKARTYA_E2E_API'];

/// Kikapcsolható hálózat – offline működés szimulálásához.
class SwitchableClient extends http.BaseClient {
  final _inner = http.Client();
  bool online = true;

  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) {
    if (!online) throw http.ClientException('offline (szimulált)');
    return _inner.send(request);
  }
}

/// Egy eszköz: saját SQLite adatbázis, saját token tároló, saját hálózat.
class Device {
  Device._(this.db) : network = SwitchableClient() {
    store = LocalStore(db);
    api = ApiClient(config: AppConfig(apiBaseUrl: apiUrl!), tokenStore: tokens, httpClient: network);
    auth = AuthRepository(api: api, tokens: tokens, store: store);
    study = StudyRepository(store: store, clock: const SystemClock());
    sync = SyncEngine(api: api, store: store, clock: const SystemClock());
  }

  static Future<Device> create() async => Device._(await openTestDatabase());

  final AppDatabase db;
  final SwitchableClient network;
  final tokens = InMemoryTokenStore();
  late final LocalStore store;
  late final ApiClient api;
  late final AuthRepository auth;
  late final StudyRepository study;
  late final SyncEngine sync;

  /// A kártyák összehasonlítható pillanatképe (helyi azonosító-független mezőkkel együtt).
  Future<List<String>> snapshot() async {
    final rows = await db.db.query('cards', where: 'deleted = 0', orderBy: 'word_id, card_type');
    return [
      for (final c in rows)
        [c['id'], c['word_id'], c['card_type'], c['state'], c['ease_factor'], c['interval_days'], c['repetitions'], c['lapses'],
                c['total_reviews'], c['next_review_at'], c['is_suspended'], c['server_version']]
            .join('|'),
    ];
  }

  Future<List<String>> logIds() async =>
      [for (final r in await db.db.query('review_log', orderBy: 'id')) r['id']! as String];

  Future<void> close() => db.close();
}

void main() {
  if (apiUrl == null) {
    test('többeszközös szinkron (valódi backend)', () {}, skip: 'SZOKARTYA_E2E_API nincs megadva');
    return;
  }
  const password = 'helyes-lo-elem-tuzgolyo';
  late Device a;
  late Device b;
  late String email;

  setUp(() async {
    email = 'e2e-${DateTime.now().microsecondsSinceEpoch}@example.hu';
    a = await Device.create();
    b = await Device.create();
    await a.auth.register(email: email, password: password);
    await b.auth.login(email: email, password: password);
    await a.sync.sync();
    await b.sync.sync();
  });
  tearDown(() async {
    await a.close();
    await b.close();
  });

  Future<void> syncAll() async {
    // Két kör: minden eszköz megkapja a másik feltöltéseit is.
    for (var i = 0; i < 2; i++) {
      await a.sync.sync();
      await b.sync.sync();
    }
  }

  Future<void> expectConverged() async {
    expect(await a.snapshot(), await b.snapshot(), reason: 'a két eszköz kártyaállapota azonos');
    expect(await a.logIds(), await b.logIds(), reason: 'a két eszköz naplója azonos');
    expect(await a.store.outboxCount() + await b.store.outboxCount(), 0, reason: 'nincs feltöltetlen módosítás');
  }

  test('az egyik eszközön végzett munka megjelenik a másikon', () async {
    final created = await a.study.enrollLevel('A1');
    for (final card in (await a.study.loadQueue()).ordered.take(3)) {
      await a.study.review(card, grade: 4, responseTimeMs: 2000);
    }
    await syncAll();

    expect(created, greaterThan(0));
    expect((await b.snapshot()).length, created);
    await expectConverged();
  });

  test('ugyanaz a kártya mindkét eszközön offline értékelve: mindkét értékelés megmarad', () async {
    await a.study.enrollLevel('A1');
    await syncAll();
    final shared = (await a.study.loadQueue()).newCards.first;
    final before = shared.scheduling.totalReviews;

    a.network.online = false;
    b.network.online = false;
    await a.study.review(shared, grade: 4, responseTimeMs: 1500);
    await Future<void>.delayed(const Duration(milliseconds: 20));
    final onB = (await b.study.loadQueue()).ordered.firstWhere((c) => c.id == shared.id);
    await b.study.review(onB, grade: 1, responseTimeMs: 6000);
    await expectLater(a.sync.sync(), throwsA(isA<NetworkException>()));

    a.network.online = true;
    b.network.online = true;
    await syncAll();
    await expectConverged();

    final card = (await a.db.db.query('cards', where: 'id = ?', whereArgs: [shared.id])).single;
    expect(card['total_reviews'], before + 2);
    // A sorrend: A „jó” (LEARNING), majd B „nem tudtam” → vissza az első lépcsőre.
    expect(CardStateWire.parse(card['state']! as String), CardState.learning);
    expect(card['learning_step'], 0);
  });

  test('ugyanazok a szavak mindkét eszközön offline felvéve: nincs duplikált kártya', () async {
    a.network.online = false;
    b.network.online = false;
    final onA = await a.study.enrollLevel('A2');
    final onB = await b.study.enrollLevel('A2');
    expect(onA, onB);
    // B már offline értékel is az eltérő helyi azonosítójú kártyán.
    await b.study.review((await b.study.loadQueue()).newCards.first, grade: 5, responseTimeMs: 900);

    a.network.online = true;
    b.network.online = true;
    await syncAll();
    await expectConverged();

    final rows = await a.db.db.query('cards', where: 'deleted = 0');
    expect(rows.map((r) => '${r['word_id']}/${r['card_type']}').toSet().length, rows.length);
    expect(rows.length, onA);
    expect(rows.where((r) => r['total_reviews'] == 1).length, 1, reason: 'B értékelése átkerült a szerver kártyájára');
  });

  test('felfüggesztés ütközése: a később végzett módosítás nyer mindkét eszközön', () async {
    await a.study.enrollLevel('A1');
    await syncAll();
    final card = (await a.study.loadQueue()).newCards.first;

    a.network.online = false;
    b.network.online = false;
    await b.study.setSuspended(card, true);
    await Future<void>.delayed(const Duration(milliseconds: 20));
    await a.study.setSuspended(card, false); // később: nyer

    a.network.online = true;
    b.network.online = true;
    await b.sync.sync(); // B tölti fel először a korábbi módosítást
    await a.sync.sync();
    await syncAll();
    await expectConverged();
    final row = (await b.db.db.query('cards', where: 'id = ?', whereArgs: [card.id])).single;
    expect(row['is_suspended'], 0);
  });
}
