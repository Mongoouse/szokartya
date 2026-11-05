import 'package:sqflite/sqflite.dart';

import '../../../domain/sm2_scheduler.dart';
import '../../models/study_card.dart';
import '../../models/word.dart';
import 'store_support.dart';

/// Statisztika nyers adatai; az összesítés a repository-ban, időzóna szerint történik.
mixin StatsQueries on LocalStoreBase {
  /// Az adott időszakban értékelt kártyák száma, értékelés előtti állapot szerint.
  Future<int> countReviewsSince(DateTime since, {List<CardState>? statesBefore}) async {
    final where = StringBuffer('reviewed_at >= ?');
    final args = <Object>[since.millisecondsSinceEpoch];
    if (statesBefore != null) {
      where.write(' AND state_before IN (${List.filled(statesBefore.length, '?').join(', ')})');
      args.addAll(statesBefore.map((s) => s.wire));
    }
    return Sqflite.firstIntValue(await db.rawQuery('SELECT COUNT(*) FROM review_log WHERE $where', args)) ?? 0;
  }

  Future<List<({DateTime reviewedAt, int grade, CardState stateBefore, int responseTimeMs})>> reviewsSince(DateTime since) async {
    final rows = await db.query(
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
    final rows = await db.rawQuery(
      "SELECT next_review_at FROM cards WHERE deleted = 0 AND is_suspended = 0 AND state <> 'NEW' AND next_review_at < ?",
      [until.millisecondsSinceEpoch],
    );
    return [for (final r in rows) DateTime.fromMillisecondsSinceEpoch(r['next_review_at']! as int, isUtc: true)];
  }

  /// Az értékelések napjai (helyi napkezdetek nélkül, nyers időpontok) a sorozat számításához.
  Future<List<DateTime>> allReviewTimes() async {
    final rows = await db.rawQuery('SELECT reviewed_at FROM review_log ORDER BY reviewed_at DESC');
    return [for (final r in rows) DateTime.fromMillisecondsSinceEpoch(r['reviewed_at']! as int, isUtc: true)];
  }

  Future<Map<CardType, int>> countCardsByType() async {
    final rows = await db.rawQuery('SELECT card_type, COUNT(*) AS n FROM cards WHERE deleted = 0 GROUP BY card_type');
    return {for (final r in rows) CardType.parse(r['card_type']! as String): r['n']! as int};
  }

  /// A legtöbbet elrontott kártyák (felejtések száma szerint).
  Future<List<({Word word, CardType type, int lapses})>> hardestCards({int limit = 5}) async {
    final rows = await db.rawQuery(
      'SELECT c.card_type, c.lapses, w.payload FROM cards c JOIN words w ON w.id = c.word_id '
      'WHERE c.deleted = 0 AND w.deleted = 0 AND c.lapses > 0 ORDER BY c.lapses DESC, c.id LIMIT ?',
      [limit],
    );
    return [
      for (final r in rows)
        (
          word: wordFromPayload(r['payload']),
          type: CardType.parse(r['card_type']! as String),
          lapses: r['lapses']! as int,
        ),
    ];
  }
}
