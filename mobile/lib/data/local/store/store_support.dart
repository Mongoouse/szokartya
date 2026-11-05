/// A helyi tár részei által közösen használt lekérdezés-részletek, írások és leképezések.
library;

import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:sqflite/sqflite.dart';

import '../../../core/api/api_client.dart';
import '../../../domain/sm2_scheduler.dart';
import '../../../domain/word_scope.dart';
import '../../models/study_card.dart';
import '../../models/word.dart';
import '../app_database.dart';
import 'outbox_store.dart';

/// A helyi tár közös alapja: az adatbázis-kapcsolat, amelyen a témánkénti
/// részek (mixinek) dolgoznak.
abstract class LocalStoreBase {
  LocalStoreBase(this.database);

  @protected
  final AppDatabase database;

  @protected
  Database get db => database.db;
}

/// A tanulható (nem törölt, nem felfüggesztett) kártyák a szavuk tárolt alakjával.
const cardSelect = '''
  SELECT c.*, w.payload AS word_payload
    FROM cards c JOIN words w ON w.id = c.word_id
   WHERE c.deleted = 0 AND c.is_suspended = 0 AND w.deleted = 0''';

/// A szókészlet ([WordScope]) SQL-feltétele egy szóazonosító-oszlopra
/// (` AND …` alakban, a hozzá tartozó paraméterekkel).
({String sql, List<Object> args}) scopeFilter(WordScope? scope, String wordIdColumn) => switch (scope) {
      null => (sql: '', args: const []),
      TopicScope(:final group) => (
          sql: ' AND EXISTS (SELECT 1 FROM word_categories wc WHERE wc.word_id = $wordIdColumn '
              'AND wc.slug IN (${List.filled(group.slugs.length, '?').join(', ')}))',
          args: group.slugs,
        ),
      LevelScope(:final level) => (
          sql: ' AND EXISTS (SELECT 1 FROM words ws WHERE ws.id = $wordIdColumn AND ws.cefr_level = ?)',
          args: [level],
        ),
    };

/// Kimenő bejegyzés felvétele a hívó tranzakciójában.
Future<void> enqueueOutbox(Transaction txn, OutboxKind kind, String entityId, Json payload, DateTime now) =>
    txn.insert('outbox', {
      'kind': kind.wire,
      'entity_id': entityId,
      'payload': jsonEncode(payload),
      'created_at': now.millisecondsSinceEpoch,
    });

/// Egy szó (és kategóriái) beírása a hívó tranzakciójában.
Future<void> writeWord(Transaction txn, Json w) async {
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
      'deleted': word.isActive ? 0 : 1,
      ...AppDatabase.wordIndexColumns(w),
    },
    conflictAlgorithm: ConflictAlgorithm.replace,
  );
  await txn.delete('word_categories', where: 'word_id = ?', whereArgs: [word.id]);
  for (final c in AppDatabase.wordCategoryRows(w)) {
    await txn.insert('word_categories', c, conflictAlgorithm: ConflictAlgorithm.ignore);
  }
}

/// A kártyaazonosító átírása a hívó tranzakciójában (lásd [OutboxStore.remapCardId]).
Future<void> remapCardIdInTxn(Transaction txn, String localId, String serverId) async {
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

Map<String, Object?> schedulingColumns(CardSchedulingState s) => {
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

CardSchedulingState schedulingFromJson(Json c) {
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

StudyCard cardFromRow(Map<String, Object?> r) {
  DateTime? date(Object? v) => v == null ? null : DateTime.fromMillisecondsSinceEpoch(v as int, isUtc: true);
  return StudyCard(
    id: r['id']! as String,
    wordId: r['word_id']! as String,
    cardType: CardType.parse(r['card_type']! as String),
    isSuspended: r['is_suspended'] == 1,
    serverVersion: r['server_version']! as int,
    word: wordFromPayload(r['word_payload']),
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

/// A szó tárolt JSON-alakjának visszaalakítása.
Word wordFromPayload(Object? payload) => Word.fromJson(jsonDecode(payload! as String) as Json);
