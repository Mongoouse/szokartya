import 'package:sqflite/sqflite.dart';

import '../../../core/api/api_client.dart';
import '../../../domain/sm2_scheduler.dart';
import '../../models/study_card.dart';
import 'outbox_store.dart';
import 'store_support.dart';

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

/// Helyi módosítások: mindegyik egy tranzakcióban, kimenő bejegyzéssel együtt íródik.
mixin LocalChanges on LocalStoreBase {
  /// Kártyák offline felvétele. A már létező (szó, típus) párokat kihagyja.
  Future<int> enrollLocally(List<({String id, String wordId, CardType type})> cards, DateTime now) {
    return db.transaction((txn) async {
      var created = 0;
      for (final c in cards) {
        final initial = CardSchedulingState.initial();
        final inserted = await txn.insert(
          'cards',
          {
            'id': c.id,
            'word_id': c.wordId,
            'card_type': c.type.wire,
            ...schedulingColumns(initial),
            'is_suspended': 0,
            'server_version': 0,
            'created_at': now.millisecondsSinceEpoch,
            'deleted': 0,
          },
          conflictAlgorithm: ConflictAlgorithm.ignore,
        );
        if (inserted == 0) continue;
        created++;
        await enqueueOutbox(txn, OutboxKind.enroll, c.id, {'progressId': c.id, 'wordId': c.wordId, 'cardType': c.type.wire}, now);
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
    await db.transaction((txn) async {
      await writeWord(txn, {...wordPayload, 'version': 0});
      await enqueueOutbox(txn, OutboxKind.customWord, wordPayload['id'] as String, pushPayload, now);
    });
    return enrollLocally(cards, now);
  }

  /// A szerver által elutasított saját szó és kártyái helyi törlése.
  Future<void> discardWord(String wordId) {
    return db.transaction((txn) async {
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
    return db.transaction((txn) async {
      await txn.update('cards', schedulingColumns(r.after), where: 'id = ?', whereArgs: [r.cardId]);
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
      await enqueueOutbox(
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

  /// Hibabejelentés offline rögzítése: a következő szinkron tölti fel (push `reports`).
  /// Az azonosítót a kliens adja, így az ismételt feltöltés idempotens.
  Future<void> recordReport({
    required String id,
    required String wordId,
    required CardType? cardType,
    required String category,
    required String message,
    required DateTime now,
  }) {
    return db.transaction((txn) => enqueueOutbox(
          txn,
          OutboxKind.report,
          id,
          {
            'id': id,
            'wordId': wordId,
            'cardType': ?cardType?.wire,
            'category': category,
            'message': message,
            'createdAt': now.toUtc().toIso8601String(),
          },
          now,
        ));
  }

  /// Felfüggesztés offline (LWW-vel szinkronizálódik).
  Future<void> setSuspended(String cardId, bool suspended, DateTime now) {
    return db.transaction((txn) async {
      final rows = await txn.query('cards', columns: ['server_version'], where: 'id = ?', whereArgs: [cardId]);
      if (rows.isEmpty) return;
      await txn.update('cards', {'is_suspended': suspended ? 1 : 0}, where: 'id = ?', whereArgs: [cardId]);
      await enqueueOutbox(
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
}
