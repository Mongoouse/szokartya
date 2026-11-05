import 'package:sqflite/sqflite.dart';

import '../../../core/api/api_client.dart';
import '../../models/word.dart';
import 'store_support.dart';

/// A szerverről lehúzott állapot (pull) alkalmazása a helyi adatbázisra.
mixin ServerApply on LocalStoreBase {
  /// Lehúzott szavak beírása; régebbi verzió nem írja felül az újabbat.
  Future<void> applyServerWords(List<Json> words) async {
    if (words.isEmpty) return;
    await db.transaction((txn) async {
      for (final w in words) {
        final word = Word.fromJson(w);
        final existing = await txn.query('words', columns: ['version'], where: 'id = ?', whereArgs: [word.id]);
        if (existing.isNotEmpty && (existing.first['version']! as int) >= word.version) continue;
        await writeWord(txn, w);
      }
    });
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
    await db.transaction((txn) async {
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
          await remapCardIdInTxn(txn, t['id']! as String, id);
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
          'deleted': c['isActive'] == false ? 1 : 0,
          if (!hasPendingFlags) 'is_suspended': c['isSuspended'] == true ? 1 : 0,
          if (!hasPendingReviews || local.isEmpty) ...schedulingColumns(schedulingFromJson(c)),
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
    await db.transaction((txn) async {
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
}
