import 'dart:async';

import 'package:uuid/uuid.dart';

import '../core/api/api_client.dart';
import '../core/api/api_exception.dart';
import '../core/time/clock.dart';
import '../data/local/local_store.dart';
import '../data/models/user_settings.dart';
import '../data/repositories/auth_repository.dart';

/// Egy szinkronizációs kör eredménye.
class SyncReport {
  const SyncReport({required this.pushed, required this.rejected, required this.pulled, required this.finishedAt});

  final int pushed;

  /// A szerver által véglegesen elutasított helyi módosítások (pl. törölt szó).
  final int rejected;
  final int pulled;
  final DateTime finishedAt;
}

/// Offline-first szinkronizáció: előbb PUSH (kimenő sor), utána PULL (változások).
///
/// Miért ebben a sorrendben: a pull a szerver végleges állapotát hozza; ha a
/// helyi értékelések már fent vannak, a lehúzott állapot azokat is tartalmazza,
/// így a helyi ideiglenes ütemezés egy körben konvergál.
///
/// Garanciák:
///  - egyszerre egy futás (single-flight): párhuzamos hívások ugyanazt a
///    Future-t kapják;
///  - idempotens: megszakadt futás után a kimenő sor újraküldhető (a szerver a
///    reviewId / progressId alapján felismeri az ismétlést);
///  - a kurzor csak a lap sikeres alkalmazása után mentődik.
class SyncEngine {
  SyncEngine({required this._api, required this._store, required this._clock});

  static const _cursorKey = 'sync.cursor';
  static const _deviceKey = 'device.id';
  static const _lastSyncKey = 'sync.last_at';
  static const _batchSize = 200;
  static const _maxPushRounds = 20;
  static const _maxPullPages = 100;

  final ApiClient _api;
  final LocalStore _store;
  final Clock _clock;

  Future<SyncReport>? _inFlight;

  Future<SyncReport> sync() => _inFlight ??= _run().whenComplete(() => _inFlight = null);

  Future<DateTime?> lastSyncAt() async {
    final raw = await _store.getState(_lastSyncKey);
    return raw == null ? null : DateTime.parse(raw);
  }

  Future<String> deviceId() async {
    final existing = await _store.getState(_deviceKey);
    if (existing != null) return existing;
    final id = const Uuid().v4();
    await _store.setState(_deviceKey, id);
    return id;
  }

  Future<SyncReport> _run() async {
    var pushed = 0;
    var rejected = 0;
    for (var round = 0; round < _maxPushRounds; round++) {
      final (sent, failed) = await _pushOnce();
      pushed += sent;
      rejected += failed;
      if (sent == 0) break;
    }
    final pulled = await _pullAll();
    await _refreshProfile();
    final finishedAt = _clock.now();
    await _store.setState(_lastSyncKey, finishedAt.toIso8601String());
    return SyncReport(pushed: pushed, rejected: rejected, pulled: pulled, finishedAt: finishedAt);
  }

  // ---------------------------------------------------------------------------
  // Push
  // ---------------------------------------------------------------------------

  /// Egy köteg feltöltése. @returns (elküldött tételek, elutasítottak).
  Future<(int, int)> _pushOnce() async {
    // Függőségi sorrend: saját szó → kártyafelvétel → módosítás / értékelés (a
    // szerver is így dolgozza fel egy kérésen belül). Ha egy előbbi típusból
    // több vár, mint ami egy kötegbe fér, a későbbiek a következő körre maradnak –
    // különben egy értékelés megelőzhetné a saját kártyája felvételét, és a
    // szerver elutasítaná.
    final customWords = await _store.outbox(kind: OutboxKind.customWord, limit: _batchSize);
    final wordsPending = customWords.length == _batchSize;
    final enrollments = wordsPending ? <OutboxEntry>[] : await _store.outbox(kind: OutboxKind.enroll, limit: _batchSize);
    final enrollmentsPending = wordsPending || enrollments.length == _batchSize;
    final changes = enrollmentsPending ? <OutboxEntry>[] : await _store.outbox(kind: OutboxKind.cardChange, limit: _batchSize);
    final reviews = enrollmentsPending ? <OutboxEntry>[] : await _store.outbox(kind: OutboxKind.review, limit: _batchSize);
    final all = [...customWords, ...enrollments, ...changes, ...reviews];
    if (all.isEmpty) return (0, 0);

    final Json response;
    try {
      response = await _api.post('/sync/push', body: {
        'clientTime': _clock.now().toIso8601String(),
        'deviceId': await deviceId(),
        'customWords': customWords.map((e) => e.payload).toList(),
        'enrollments': enrollments.map((e) => e.payload).toList(),
        'cardChanges': changes.map((e) => e.payload).toList(),
        'reviews': reviews.map((e) => e.payload).toList(),
      });
    } on ApiException {
      await _store.incrementOutboxAttempts(all);
      rethrow;
    }

    var rejected = 0;

    // Elutasított saját szó (pl. érvénytelen adat): a helyi szó és kártyái törlődnek.
    final wordResults = ((response['customWords'] as List?) ?? const []).cast<Json>();
    for (final r in wordResults) {
      if (r['status'] == 'rejected') {
        rejected++;
        await _store.discardWord(r['wordId'] as String);
      }
    }

    // Kártyafelvételek: azonosító-leképezés, elutasításnál a helyi kártya törlése.
    final enrollResults = (response['enrollments'] as List).cast<Json>();
    for (final r in enrollResults) {
      final localId = r['progressId'] as String;
      final serverId = r['serverProgressId'] as String?;
      if (r['status'] == 'rejected') {
        rejected++;
        await _store.discardCard(localId);
      } else if (serverId != null && serverId != localId) {
        await _store.remapCardId(localId, serverId);
      }
    }
    rejected += _countRejected(response['cardChanges']);
    rejected += _countRejected(response['reviews']);

    // Minden tétel végleges választ kapott (applied / duplicate / conflict /
    // rejected) – a konfliktusos és elutasított tételek állapotát a pull javítja.
    await _store.completeOutbox(all);
    return (all.length, rejected);
  }

  static int _countRejected(Object? results) =>
      (results as List).cast<Json>().where((r) => r['status'] == 'rejected').length;

  // ---------------------------------------------------------------------------
  // Pull
  // ---------------------------------------------------------------------------

  Future<int> _pullAll() async {
    var pulled = 0;
    var cursor = await _store.getState(_cursorKey);
    for (var page = 0; page < _maxPullPages; page++) {
      final Json response;
      try {
        response = await _api.get('/sync/pull', query: {'cursor': ?cursor, 'limit': '500'});
      } on HttpStatusException catch (e) {
        if (e.statusCode == 400 && cursor != null) {
          // Érvénytelen kurzor (pl. szerverfrissítés után) → teljes újraszinkron.
          cursor = null;
          continue;
        }
        rethrow;
      }

      final words = (response['words'] as List).cast<Json>();
      final cards = (response['progress'] as List).cast<Json>();
      final logs = (response['reviewLogs'] as List).cast<Json>();
      // Sorrend: szavak → kártyák (a kártya a szóra hivatkozik) → napló.
      await _store.applyServerWords(words);
      await _store.applyServerCards(cards);
      await _store.applyServerReviewLogs(logs);
      pulled += words.length + cards.length + logs.length;

      cursor = response['cursor'] as String;
      await _store.setState(_cursorKey, cursor);
      if (response['hasMore'] != true) break;
    }
    return pulled;
  }

  /// A napi keretek a profilban vannak – egy másik eszközön módosíthatták.
  Future<void> _refreshProfile() async {
    final json = await _api.get('/users/me');
    await _store.setState(profileStateKey, UserProfile.fromJson(json).encode());
  }
}
