import 'dart:convert';

import 'package:sqflite/sqflite.dart';

import '../../core/api/api_client.dart';
import '../../domain/sm2_scheduler.dart';
import '../models/study_card.dart';
import '../models/word.dart';
import 'app_database.dart';

/// Kimenő (szinkronizálásra váró) módosítás típusa.
enum OutboxKind {
  customWord('custom_word'),
  enroll('enroll'),
  cardChange('card_change'),
  review('review');

  const OutboxKind(this.wire);

  final String wire;

  static OutboxKind parse(String v) => values.firstWhere((k) => k.wire == v);
}

class OutboxEntry {
  const OutboxEntry({required this.seq, required this.kind, required this.entityId, required this.payload});

  final int seq;
  final OutboxKind kind;
  final String entityId;
  final Json payload;
}

/// Egy helyi értékelés minden adata, amit egy tranzakcióban kell rögzíteni.
class LocalReview {
  const LocalReview({
    required this.reviewId,
    required this.cardId,
    required this.grade,
    required this.responseTimeMs,
    required this.reviewedAt,
    required this.before,
    required this.after,
  });

  final String reviewId;
  final String cardId;
  final int grade;
  final int responseTimeMs;
  final DateTime reviewedAt;
  final CardSchedulingState before;
  final CardSchedulingState after;
}

/// A helyi adatbázis adatelérési rétege (DAO). Minden SQL itt van; a felsőbb
/// rétegek típusos modellekkel dolgoznak.
class LocalStore {
  LocalStore(this._database);

  final AppDatabase _database;

  Database get _db => _database.db;

  // ---------------------------------------------------------------------------
  // Kártyák (olvasás)
  // ---------------------------------------------------------------------------

  static const _cardSelect = '''
    SELECT c.*, w.payload AS word_payload
      FROM cards c JOIN words w ON w.id = c.word_id
     WHERE c.deleted = 0 AND c.is_suspended = 0 AND w.deleted = 0''';

  /// Esedékes (nem új) kártyák a megadott időpontig, esedékesség szerint.
  Future<List<StudyCard>> dueCards({required DateTime before, required List<CardState> states, required int limit}) async {
    if (limit <= 0) return const [];
    final placeholders = List.filled(states.length, '?').join(', ');
    final rows = await _db.rawQuery(
      "$_cardSelect AND c.state <> 'NEW' AND c.state IN ($placeholders) AND c.next_review_at <= ? "
      'ORDER BY c.next_review_at, c.id LIMIT ?',
      [...states.map((s) => s.wire), before.millisecondsSinceEpoch, limit],
    );
    return rows.map(_cardFromRow).toList();
  }

  /// Új kártyák felvételi sorrendben.
  Future<List<StudyCard>> newCards({required int limit}) async {
    if (limit <= 0) return const [];
    final rows = await _db.rawQuery("$_cardSelect AND c.state = 'NEW' ORDER BY c.created_at, c.id LIMIT ?", [limit]);
    return rows.map(_cardFromRow).toList();
  }

  Future<StudyCard?> card(String id) async {
    final rows = await _db.rawQuery('$_cardSelect AND c.id = ?', [id]);
    return rows.isEmpty ? null : _cardFromRow(rows.first);
  }

  /// Az adott időszakban értékelt kártyák száma, értékelés előtti állapot szerint.
  Future<int> countReviewsSince(DateTime since, {List<CardState>? statesBefore}) async {
    final where = StringBuffer('reviewed_at >= ?');
    final args = <Object>[since.millisecondsSinceEpoch];
    if (statesBefore != null) {
      where.write(' AND state_before IN (${List.filled(statesBefore.length, '?').join(', ')})');
      args.addAll(statesBefore.map((s) => s.wire));
    }
    return Sqflite.firstIntValue(await _db.rawQuery('SELECT COUNT(*) FROM review_log WHERE $where', args)) ?? 0;
  }

  Future<Map<CardState, int>> countCardsByState() async {
    final rows = await _db.rawQuery(
      'SELECT state, COUNT(*) AS n FROM cards WHERE deleted = 0 AND is_suspended = 0 GROUP BY state',
    );
    return {for (final r in rows) CardStateWire.parse(r['state']! as String): r['n']! as int};
  }

  Future<int> countDue(DateTime before) async =>
      Sqflite.firstIntValue(await _db.rawQuery(
        "SELECT COUNT(*) FROM cards WHERE deleted = 0 AND is_suspended = 0 AND state <> 'NEW' AND next_review_at <= ?",
        [before.millisecondsSinceEpoch],
      )) ??
      0;

  // ---------------------------------------------------------------------------
  // Szavak
  // ---------------------------------------------------------------------------

  /// Adott szintű, még fel nem vett szavak.
  Future<List<Word>> unenrolledWords({required String cefrLevel}) async {
    final rows = await _db.rawQuery(
      'SELECT w.payload FROM words w WHERE w.deleted = 0 AND w.cefr_level = ? '
      'AND NOT EXISTS (SELECT 1 FROM cards c WHERE c.word_id = w.id AND c.deleted = 0) ORDER BY w.rowid',
      [cefrLevel],
    );
    return rows.map((r) => Word.fromJson(jsonDecode(r['payload']! as String) as Json)).toList();
  }

  /// Egy kategória még fel nem vett szavai.
  Future<List<Word>> unenrolledWordsInCategory(String slug) async {
    final rows = await _db.rawQuery(
      'SELECT w.payload FROM words w JOIN word_categories wc ON wc.word_id = w.id '
      'WHERE w.deleted = 0 AND wc.slug = ? '
      'AND NOT EXISTS (SELECT 1 FROM cards c WHERE c.word_id = w.id AND c.deleted = 0) ORDER BY w.rowid',
      [slug],
    );
    return rows.map((r) => Word.fromJson(jsonDecode(r['payload']! as String) as Json)).toList();
  }

  /// Kategóriák a szavak és a még fel nem vett szavak számával, név szerint.
  Future<List<({String slug, String nameHu, int total, int unenrolled})>> categories() async {
    final rows = await _db.rawQuery(
      'SELECT wc.slug, MIN(wc.name_hu) AS name_hu, COUNT(*) AS total, '
      'SUM(CASE WHEN EXISTS (SELECT 1 FROM cards c WHERE c.word_id = w.id AND c.deleted = 0) THEN 0 ELSE 1 END) AS unenrolled '
      'FROM word_categories wc JOIN words w ON w.id = wc.word_id WHERE w.deleted = 0 '
      'GROUP BY wc.slug ORDER BY name_hu',
    );
    return [
      for (final r in rows)
        (
          slug: r['slug']! as String,
          nameHu: r['name_hu']! as String,
          total: r['total']! as int,
          unenrolled: (r['unenrolled'] as int?) ?? 0,
        ),
    ];
  }

  /// Szókereső: részleges egyezés a német alakra vagy a magyar fordításra,
  /// szint- és kategóriaszűréssel. A felvett szavakat is visszaadja (jelölve).
  Future<List<({Word word, bool enrolled})>> searchWords({
    String query = '',
    String? cefrLevel,
    String? categorySlug,
    bool customOnly = false,
    int limit = 100,
  }) async {
    final where = <String>['w.deleted = 0'];
    final args = <Object>[];
    final q = query.trim().toLowerCase();
    final escaped = q.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_');
    if (q.isNotEmpty) {
      where.add("w.search_text LIKE ? ESCAPE '\\'");
      args.add('%$escaped%');
    }
    if (cefrLevel != null) {
      where.add('w.cefr_level = ?');
      args.add(cefrLevel);
    }
    if (categorySlug != null) {
      where.add('EXISTS (SELECT 1 FROM word_categories wc WHERE wc.word_id = w.id AND wc.slug = ?)');
      args.add(categorySlug);
    }
    if (customOnly) where.add('w.is_custom = 1');
    final rows = await _db.rawQuery(
      'SELECT w.payload, EXISTS (SELECT 1 FROM cards c WHERE c.word_id = w.id AND c.deleted = 0) AS enrolled '
      'FROM words w WHERE ${where.join(' AND ')} '
      // Előbb a szó elején egyezők, majd betűrend.
      "ORDER BY CASE WHEN w.search_text LIKE ? ESCAPE '\\' THEN 0 ELSE 1 END, w.search_text LIMIT ?",
      [...args, '$escaped%', limit],
    );
    return [
      for (final r in rows) (word: Word.fromJson(jsonDecode(r['payload']! as String) as Json), enrolled: r['enrolled'] == 1),
    ];
  }

  /// A szó kártyatípusai, amelyek már fel vannak véve.
  Future<Set<CardType>> enrolledTypes(String wordId) async {
    final rows = await _db.query('cards', columns: ['card_type'], where: 'word_id = ? AND deleted = 0', whereArgs: [wordId]);
    return {for (final r in rows) CardType.parse(r['card_type']! as String)};
  }

  Future<Map<String, int>> unenrolledCountByLevel() async {
    final rows = await _db.rawQuery(
      'SELECT cefr_level, COUNT(*) AS n FROM words w WHERE w.deleted = 0 AND cefr_level IS NOT NULL '
      'AND NOT EXISTS (SELECT 1 FROM cards c WHERE c.word_id = w.id AND c.deleted = 0) GROUP BY cefr_level',
    );
    return {for (final r in rows) r['cefr_level']! as String: r['n']! as int};
  }

  // ---------------------------------------------------------------------------
  // Helyi módosítások (mindig kimenő bejegyzéssel, egy tranzakcióban)
  // ---------------------------------------------------------------------------

  /// Kártyák offline felvétele. A már létező (szó, típus) párokat kihagyja.
  Future<int> enrollLocally(List<({String id, String wordId, CardType type})> cards, DateTime now) {
    return _db.transaction((txn) async {
      var created = 0;
      for (final c in cards) {
        final initial = CardSchedulingState.initial();
        final inserted = await txn.insert(
          'cards',
          {
            'id': c.id,
            'word_id': c.wordId,
            'card_type': c.type.wire,
            ..._schedulingColumns(initial),
            'is_suspended': 0,
            'server_version': 0,
            'created_at': now.millisecondsSinceEpoch,
            'deleted': 0,
          },
          conflictAlgorithm: ConflictAlgorithm.ignore,
        );
        if (inserted == 0) continue;
        created++;
        await _enqueue(txn, OutboxKind.enroll, c.id, {'progressId': c.id, 'wordId': c.wordId, 'cardType': c.type.wire}, now);
      }
      return created;
    });
  }

  /// Saját szó offline létrehozása: a szó helyi másolata (a szerver későbbi
  /// verziója felülírja), a feltöltendő kérés és a kártyafelvételek egy
  /// tranzakcióban. A kimenő sorban a szó a felvételek előtt áll.
  Future<int> createCustomWordLocally({
    required Json wordPayload,
    required Json pushPayload,
    required List<({String id, String wordId, CardType type})> cards,
    required DateTime now,
  }) async {
    await _db.transaction((txn) async {
      await _writeWord(txn, {...wordPayload, 'version': 0});
      await _enqueue(txn, OutboxKind.customWord, wordPayload['id'] as String, pushPayload, now);
    });
    return enrollLocally(cards, now);
  }

  /// A szerver által elutasított saját szó és kártyái helyi törlése.
  Future<void> discardWord(String wordId) {
    return _db.transaction((txn) async {
      await txn.update('words', {'deleted': 1}, where: 'id = ?', whereArgs: [wordId]);
      final cards = await txn.query('cards', columns: ['id'], where: 'word_id = ?', whereArgs: [wordId]);
      await txn.update('cards', {'deleted': 1}, where: 'word_id = ?', whereArgs: [wordId]);
      for (final c in cards) {
        await txn.delete('outbox', where: 'entity_id = ?', whereArgs: [c['id']]);
      }
      await txn.delete('outbox', where: 'entity_id = ?', whereArgs: [wordId]);
    });
  }

  /// Egy értékelés atomi rögzítése: ideiglenes ütemezési állapot + napló + kimenő sor.
  /// Ha bármelyik lépés elbukik, egyik sem marad meg.
  Future<void> recordReview(LocalReview r) {
    return _db.transaction((txn) async {
      await txn.update('cards', _schedulingColumns(r.after), where: 'id = ?', whereArgs: [r.cardId]);
      await txn.insert('review_log', {
        'id': r.reviewId,
        'card_id': r.cardId,
        'grade': r.grade,
        'response_time_ms': r.responseTimeMs,
        'reviewed_at': r.reviewedAt.millisecondsSinceEpoch,
        'state_before': r.before.state.wire,
        'state_after': r.after.state.wire,
        'synced': 0,
      });
      await _enqueue(
        txn,
        OutboxKind.review,
        r.cardId,
        {
          'reviewId': r.reviewId,
          'progressId': r.cardId,
          'grade': r.grade,
          'responseTimeMs': r.responseTimeMs,
          'reviewedAt': r.reviewedAt.toUtc().toIso8601String(),
        },
        r.reviewedAt,
      );
    });
  }

  /// Felfüggesztés offline (LWW-vel szinkronizálódik).
  Future<void> setSuspended(String cardId, bool suspended, DateTime now) {
    return _db.transaction((txn) async {
      final rows = await txn.query('cards', columns: ['server_version'], where: 'id = ?', whereArgs: [cardId]);
      if (rows.isEmpty) return;
      await txn.update('cards', {'is_suspended': suspended ? 1 : 0}, where: 'id = ?', whereArgs: [cardId]);
      await _enqueue(
        txn,
        OutboxKind.cardChange,
        cardId,
        {
          'progressId': cardId,
          'baseVersion': rows.first['server_version']! as int,
          'changedAt': now.toUtc().toIso8601String(),
          'isSuspended': suspended,
        },
        now,
      );
    });
  }

  // ---------------------------------------------------------------------------
  // Kimenő sor (outbox)
  // ---------------------------------------------------------------------------

  Future<List<OutboxEntry>> outbox({required OutboxKind kind, required int limit}) async {
    final rows = await _db.query('outbox', where: 'kind = ?', whereArgs: [kind.wire], orderBy: 'seq', limit: limit);
    return rows
        .map((r) => OutboxEntry(
              seq: r['seq']! as int,
              kind: OutboxKind.parse(r['kind']! as String),
              entityId: r['entity_id']! as String,
              payload: jsonDecode(r['payload']! as String) as Json,
            ))
        .toList();
  }

  Future<int> outboxCount() async =>
      Sqflite.firstIntValue(await _db.rawQuery('SELECT COUNT(*) FROM outbox')) ?? 0;

  /// Feldolgozott bejegyzések törlése; az értékelések naplóját szinkronizáltnak jelöli.
  Future<void> completeOutbox(List<OutboxEntry> done) async {
    if (done.isEmpty) return;
    await _db.transaction((txn) async {
      for (final e in done) {
        await txn.delete('outbox', where: 'seq = ?', whereArgs: [e.seq]);
        if (e.kind == OutboxKind.review) {
          await txn.update('review_log', {'synced': 1}, where: 'id = ?', whereArgs: [e.payload['reviewId']]);
        }
      }
    });
  }

  Future<void> incrementOutboxAttempts(List<OutboxEntry> entries) async {
    if (entries.isEmpty) return;
    await _db.rawUpdate(
      'UPDATE outbox SET attempts = attempts + 1 WHERE seq IN (${List.filled(entries.length, '?').join(', ')})',
      entries.map((e) => e.seq).toList(),
    );
  }

  /// A szerver által elutasított (pl. időközben törölt szóra felvett) kártya
  /// helyi törlése a hozzá tartozó, még várakozó módosításokkal együtt.
  Future<void> discardCard(String cardId) {
    return _db.transaction((txn) async {
      await txn.update('cards', {'deleted': 1}, where: 'id = ?', whereArgs: [cardId]);
      await txn.delete('outbox', where: 'entity_id = ?', whereArgs: [cardId]);
    });
  }

  /// Kártyaazonosító átírása a szerver azonosítójára (offline felvett kártya,
  /// amely egy másik eszközről már létezett). Minden hivatkozást átír.
  Future<void> remapCardId(String localId, String serverId) {
    return _db.transaction((txn) => _remapCardId(txn, localId, serverId));
  }

  Future<void> _remapCardId(Transaction txn, String localId, String serverId) async {
    if (localId == serverId) return;
    final serverExists = (await txn.query('cards', columns: ['id'], where: 'id = ?', whereArgs: [serverId])).isNotEmpty;
    if (serverExists) {
      // A szerver kártyája már lejött (pull) – a helyi másolat felesleges.
      await txn.delete('cards', where: 'id = ?', whereArgs: [localId]);
    } else {
      await txn.update('cards', {'id': serverId}, where: 'id = ?', whereArgs: [localId]);
    }
    await txn.update('review_log', {'card_id': serverId}, where: 'card_id = ?', whereArgs: [localId]);

    final pending = await txn.query('outbox', where: 'entity_id = ?', whereArgs: [localId]);
    for (final row in pending) {
      final payload = jsonDecode(row['payload']! as String) as Json..['progressId'] = serverId;
      await txn.update(
        'outbox',
        {'entity_id': serverId, 'payload': jsonEncode(payload)},
        where: 'seq = ?',
        whereArgs: [row['seq']],
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Szerverállapot alkalmazása (pull)
  // ---------------------------------------------------------------------------

  /// Lehúzott szavak beírása; régebbi verzió nem írja felül az újabbat.
  Future<void> applyServerWords(List<Json> words) async {
    if (words.isEmpty) return;
    await _db.transaction((txn) async {
      for (final w in words) {
        final word = Word.fromJson(w);
        final existing = await txn.query('words', columns: ['version'], where: 'id = ?', whereArgs: [word.id]);
        if (existing.isNotEmpty && (existing.first['version']! as int) >= word.version) continue;
        await _writeWord(txn, w);
      }
    });
  }

  Future<void> _writeWord(Transaction txn, Json w) async {
    final word = Word.fromJson(w);
    await txn.insert(
      'words',
      {
        'id': word.id,
        'payload': jsonEncode(w),
        'version': word.version,
        'cefr_level': word.cefrLevel,
        'part_of_speech': word.partOfSpeech,
        'has_gender': word.hasGender ? 1 : 0,
        'deleted': w['deletedAt'] != null ? 1 : 0,
        ...AppDatabase.wordIndexColumns(w),
      },
      conflictAlgorithm: ConflictAlgorithm.replace,
    );
    await txn.delete('word_categories', where: 'word_id = ?', whereArgs: [word.id]);
    for (final c in AppDatabase.wordCategoryRows(w)) {
      await txn.insert('word_categories', c, conflictAlgorithm: ConflictAlgorithm.ignore);
    }
  }

  /// Lehúzott kártyaállapotok alkalmazása.
  ///
  /// Szabályok:
  ///  - régebbi vagy azonos szerververzió → kihagyás (átfedő pull duplikátumai);
  ///  - ha a kártyára még feltöltetlen helyi értékelés vár, az ütemezési mezőket
  ///    NEM írjuk felül (különben a helyi haladás „visszaugrana”); a következő
  ///    push + pull után a szerver állapota a helyi értékeléseket is tartalmazza;
  ///  - ha ugyanarra a (szó, típus) párra helyben más azonosítójú kártya van,
  ///    a helyit átírjuk a szerver azonosítójára.
  Future<void> applyServerCards(List<Json> cards) async {
    if (cards.isEmpty) return;
    await _db.transaction((txn) async {
      for (final c in cards) {
        final id = c['id'] as String;
        final version = (c['version'] as num).toInt();

        final twin = await txn.query(
          'cards',
          columns: ['id'],
          where: 'word_id = ? AND card_type = ? AND id <> ?',
          whereArgs: [c['wordId'], c['cardType'], id],
        );
        for (final t in twin) {
          await _remapCardId(txn, t['id']! as String, id);
        }

        final local = await txn.query('cards', columns: ['server_version'], where: 'id = ?', whereArgs: [id]);
        if (local.isNotEmpty && (local.first['server_version']! as int) >= version) continue;

        final hasPendingReviews = Sqflite.firstIntValue(await txn.rawQuery(
              "SELECT COUNT(*) FROM outbox WHERE entity_id = ? AND kind = 'review'",
              [id],
            ))! >
            0;
        final hasPendingFlags = Sqflite.firstIntValue(await txn.rawQuery(
              "SELECT COUNT(*) FROM outbox WHERE entity_id = ? AND kind = 'card_change'",
              [id],
            ))! >
            0;

        final row = <String, Object?>{
          'id': id,
          'word_id': c['wordId'],
          'card_type': c['cardType'],
          'server_version': version,
          'created_at': DateTime.parse(c['createdAt'] as String).millisecondsSinceEpoch,
          'deleted': c['deletedAt'] != null ? 1 : 0,
          if (!hasPendingFlags) 'is_suspended': c['isSuspended'] == true ? 1 : 0,
          if (!hasPendingReviews || local.isEmpty) ..._schedulingColumns(_schedulingFromJson(c)),
        };
        if (local.isEmpty) {
          row.putIfAbsent('is_suspended', () => c['isSuspended'] == true ? 1 : 0);
          await txn.insert('cards', row);
        } else {
          await txn.update('cards', row, where: 'id = ?', whereArgs: [id]);
        }
      }
    });
  }

  /// Más eszközökről (vagy a szerverről visszaigazolt) értékelések.
  Future<void> applyServerReviewLogs(List<Json> logs) async {
    if (logs.isEmpty) return;
    await _db.transaction((txn) async {
      for (final l in logs) {
        await txn.insert(
          'review_log',
          {
            'id': l['id'],
            'card_id': l['progressId'],
            'grade': l['grade'],
            'response_time_ms': l['responseTimeMs'],
            'reviewed_at': DateTime.parse(l['reviewedAt'] as String).millisecondsSinceEpoch,
            'state_before': l['stateBefore'],
            'state_after': l['stateAfter'],
            'synced': 1,
          },
          conflictAlgorithm: ConflictAlgorithm.replace,
        );
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Statisztika (nyers adatok; az összesítés a repository-ban, időzóna szerint)
  // ---------------------------------------------------------------------------

  Future<List<({DateTime reviewedAt, int grade, CardState stateBefore, int responseTimeMs})>> reviewsSince(DateTime since) async {
    final rows = await _db.query(
      'review_log',
      columns: ['reviewed_at', 'grade', 'state_before', 'response_time_ms'],
      where: 'reviewed_at >= ?',
      whereArgs: [since.millisecondsSinceEpoch],
      orderBy: 'reviewed_at',
    );
    return [
      for (final r in rows)
        (
          reviewedAt: DateTime.fromMillisecondsSinceEpoch(r['reviewed_at']! as int, isUtc: true),
          grade: r['grade']! as int,
          stateBefore: CardStateWire.parse(r['state_before']! as String),
          responseTimeMs: r['response_time_ms']! as int,
        ),
    ];
  }

  /// Az aktív, már tanult kártyák esedékességei a megadott időpontig (előrejelzéshez).
  Future<List<DateTime>> dueTimesUntil(DateTime until) async {
    final rows = await _db.rawQuery(
      "SELECT next_review_at FROM cards WHERE deleted = 0 AND is_suspended = 0 AND state <> 'NEW' AND next_review_at < ?",
      [until.millisecondsSinceEpoch],
    );
    return [for (final r in rows) DateTime.fromMillisecondsSinceEpoch(r['next_review_at']! as int, isUtc: true)];
  }

  /// Az értékelések napjai (helyi napkezdetek nélkül, nyers időpontok) a sorozat számításához.
  Future<List<DateTime>> allReviewTimes() async {
    final rows = await _db.rawQuery('SELECT reviewed_at FROM review_log ORDER BY reviewed_at DESC');
    return [for (final r in rows) DateTime.fromMillisecondsSinceEpoch(r['reviewed_at']! as int, isUtc: true)];
  }

  Future<Map<CardType, int>> countCardsByType() async {
    final rows = await _db.rawQuery('SELECT card_type, COUNT(*) AS n FROM cards WHERE deleted = 0 GROUP BY card_type');
    return {for (final r in rows) CardType.parse(r['card_type']! as String): r['n']! as int};
  }

  /// A legtöbbet elrontott kártyák (felejtések száma szerint).
  Future<List<({Word word, CardType type, int lapses})>> hardestCards({int limit = 5}) async {
    final rows = await _db.rawQuery(
      'SELECT c.card_type, c.lapses, w.payload FROM cards c JOIN words w ON w.id = c.word_id '
      'WHERE c.deleted = 0 AND w.deleted = 0 AND c.lapses > 0 ORDER BY c.lapses DESC, c.id LIMIT ?',
      [limit],
    );
    return [
      for (final r in rows)
        (
          word: Word.fromJson(jsonDecode(r['payload']! as String) as Json),
          type: CardType.parse(r['card_type']! as String),
          lapses: r['lapses']! as int,
        ),
    ];
  }

  // ---------------------------------------------------------------------------
  // Kulcs–érték állapot
  // ---------------------------------------------------------------------------

  Future<String?> getState(String key) async {
    final rows = await _db.query('sync_state', where: 'key = ?', whereArgs: [key]);
    return rows.isEmpty ? null : rows.first['value']! as String;
  }

  Future<void> setState(String key, String value) =>
      _db.insert('sync_state', {'key': key, 'value': value}, conflictAlgorithm: ConflictAlgorithm.replace);

  Future<void> wipe() => _database.wipe();

  /// A szinkron kurzor törlése: a következő pull teljes (pl. a katalógusszintek változása után).
  Future<void> resetSyncCursor() => _db.delete('sync_state', where: 'key = ?', whereArgs: ['sync.cursor']);

  // ---------------------------------------------------------------------------
  // Leképezések
  // ---------------------------------------------------------------------------

  Future<void> _enqueue(Transaction txn, OutboxKind kind, String entityId, Json payload, DateTime now) =>
      txn.insert('outbox', {
        'kind': kind.wire,
        'entity_id': entityId,
        'payload': jsonEncode(payload),
        'created_at': now.millisecondsSinceEpoch,
      });

  static Map<String, Object?> _schedulingColumns(CardSchedulingState s) => {
        'state': s.state.wire,
        'ease_factor': s.easeFactor,
        'interval_days': s.intervalDays,
        'repetitions': s.repetitions,
        'learning_step': s.learningStep,
        'lapses': s.lapses,
        'total_reviews': s.totalReviews,
        'correct_reviews': s.correctReviews,
        'avg_response_ms': s.avgResponseMs,
        'stability_days': s.stabilityDays,
        'last_reviewed_at': s.lastReviewedAt?.millisecondsSinceEpoch,
        'next_review_at': s.nextReviewAt?.millisecondsSinceEpoch,
      };

  static CardSchedulingState _schedulingFromJson(Json c) {
    DateTime? date(Object? v) => v == null ? null : DateTime.parse(v as String).toUtc();
    return CardSchedulingState(
      state: CardStateWire.parse(c['state'] as String),
      easeFactor: (c['easeFactor'] as num).toDouble(),
      intervalDays: (c['intervalDays'] as num).toInt(),
      repetitions: (c['repetitions'] as num).toInt(),
      learningStep: (c['learningStep'] as num).toInt(),
      lapses: (c['lapses'] as num).toInt(),
      totalReviews: (c['totalReviews'] as num).toInt(),
      correctReviews: (c['correctReviews'] as num).toInt(),
      avgResponseMs: (c['avgResponseMs'] as num?)?.toInt(),
      stabilityDays: (c['stabilityDays'] as num?)?.toDouble(),
      lastReviewedAt: date(c['lastReviewedAt']),
      nextReviewAt: date(c['nextReviewAt']),
    );
  }

  static StudyCard _cardFromRow(Map<String, Object?> r) {
    DateTime? date(Object? v) => v == null ? null : DateTime.fromMillisecondsSinceEpoch(v as int, isUtc: true);
    return StudyCard(
      id: r['id']! as String,
      wordId: r['word_id']! as String,
      cardType: CardType.parse(r['card_type']! as String),
      isSuspended: r['is_suspended'] == 1,
      serverVersion: r['server_version']! as int,
      word: Word.fromJson(jsonDecode(r['word_payload']! as String) as Json),
      scheduling: CardSchedulingState(
        state: CardStateWire.parse(r['state']! as String),
        easeFactor: (r['ease_factor']! as num).toDouble(),
        intervalDays: r['interval_days']! as int,
        repetitions: r['repetitions']! as int,
        learningStep: r['learning_step']! as int,
        lapses: r['lapses']! as int,
        totalReviews: r['total_reviews']! as int,
        correctReviews: r['correct_reviews']! as int,
        avgResponseMs: r['avg_response_ms'] as int?,
        stabilityDays: (r['stability_days'] as num?)?.toDouble(),
        lastReviewedAt: date(r['last_reviewed_at']),
        nextReviewAt: date(r['next_review_at']),
      ),
    );
  }
}
