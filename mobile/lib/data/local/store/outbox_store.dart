import 'dart:convert';

import 'package:sqflite/sqflite.dart';

import '../../../core/api/api_client.dart';
import 'store_support.dart';

/// Kimenő (szinkronizálásra váró) módosítás típusa.
enum OutboxKind {
  customWord('custom_word'),
  enroll('enroll'),
  cardChange('card_change'),
  review('review'),
  report('report');

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

/// A kimenő sor (outbox) kezelése: lekérés, nyugtázás, elutasított tételek, azonosító-átírás.
mixin OutboxStore on LocalStoreBase {
  Future<List<OutboxEntry>> outbox({required OutboxKind kind, required int limit}) async {
    final rows = await db.query('outbox', where: 'kind = ?', whereArgs: [kind.wire], orderBy: 'seq', limit: limit);
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
      Sqflite.firstIntValue(await db.rawQuery('SELECT COUNT(*) FROM outbox')) ?? 0;

  /// Feldolgozott bejegyzések törlése; az értékelések naplóját szinkronizáltnak jelöli.
  Future<void> completeOutbox(List<OutboxEntry> done) async {
    if (done.isEmpty) return;
    await db.transaction((txn) async {
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
    await db.rawUpdate(
      'UPDATE outbox SET attempts = attempts + 1 WHERE seq IN (${List.filled(entries.length, '?').join(', ')})',
      entries.map((e) => e.seq).toList(),
    );
  }

  /// A szerver által elutasított (pl. időközben törölt szóra felvett) kártya
  /// helyi törlése a hozzá tartozó, még várakozó módosításokkal együtt.
  Future<void> discardCard(String cardId) {
    return db.transaction((txn) async {
      await txn.update('cards', {'deleted': 1}, where: 'id = ?', whereArgs: [cardId]);
      await txn.delete('outbox', where: 'entity_id = ?', whereArgs: [cardId]);
    });
  }

  /// Kártyaazonosító átírása a szerver azonosítójára (offline felvett kártya,
  /// amely egy másik eszközről már létezett). Minden hivatkozást átír.
  Future<void> remapCardId(String localId, String serverId) {
    return db.transaction((txn) => remapCardIdInTxn(txn, localId, serverId));
  }
}
