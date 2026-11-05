import 'package:sqflite/sqflite.dart';

import '../../../domain/sm2_scheduler.dart';
import '../../../domain/word_scope.dart';
import '../../models/study_card.dart';
import 'store_support.dart';

/// Kártyák olvasása: tanulási sor és darabszámok.
mixin CardQueries on LocalStoreBase {
  /// Esedékes (nem új) kártyák a megadott időpontig, esedékesség szerint.
  /// [scope]: csak ennek a szókészletnek a kártyái.
  Future<List<StudyCard>> dueCards({
    required DateTime before,
    required List<CardState> states,
    required int limit,
    WordScope? scope,
  }) async {
    if (limit <= 0) return const [];
    final placeholders = List.filled(states.length, '?').join(', ');
    final filter = scopeFilter(scope, 'c.word_id');
    final rows = await db.rawQuery(
      "$cardSelect AND c.state <> 'NEW' AND c.state IN ($placeholders) AND c.next_review_at <= ?${filter.sql} "
      'ORDER BY c.next_review_at, c.id LIMIT ?',
      [...states.map((s) => s.wire), before.millisecondsSinceEpoch, ...filter.args, limit],
    );
    return rows.map(cardFromRow).toList();
  }

  /// Új kártyák felvételi sorrendben.
  Future<List<StudyCard>> newCards({required int limit, WordScope? scope}) async {
    if (limit <= 0) return const [];
    final filter = scopeFilter(scope, 'c.word_id');
    final rows = await db.rawQuery(
      "$cardSelect AND c.state = 'NEW'${filter.sql} ORDER BY c.created_at, c.id LIMIT ?",
      [...filter.args, limit],
    );
    return rows.map(cardFromRow).toList();
  }

  /// Esedékes kártyák száma állapotonként a megadott időpontig (a kezdőképernyő
  /// összesítőjéhez – a kártyák betöltése és dekódolása nélkül).
  Future<int> countDueCards({required DateTime before, required List<CardState> states}) async =>
      Sqflite.firstIntValue(await db.rawQuery(
        'SELECT COUNT(*) FROM cards c JOIN words w ON w.id = c.word_id '
        'WHERE c.deleted = 0 AND c.is_suspended = 0 AND w.deleted = 0 AND c.next_review_at <= ? '
        'AND c.state IN (${List.filled(states.length, '?').join(', ')})',
        [before.millisecondsSinceEpoch, ...states.map((s) => s.wire)],
      )) ??
      0;

  /// Új (még nem tanult) kártyák száma.
  Future<int> countNewCards() async =>
      Sqflite.firstIntValue(await db.rawQuery(
        'SELECT COUNT(*) FROM cards c JOIN words w ON w.id = c.word_id '
        "WHERE c.deleted = 0 AND c.is_suspended = 0 AND w.deleted = 0 AND c.state = 'NEW'",
      )) ??
      0;

  /// Felvett szavak száma (egy szóhoz kártyatípusonként egy-egy kártya tartozik).
  Future<int> countEnrolledWords() async =>
      Sqflite.firstIntValue(await db.rawQuery(
        'SELECT COUNT(DISTINCT c.word_id) FROM cards c JOIN words w ON w.id = c.word_id '
        'WHERE c.deleted = 0 AND c.is_suspended = 0 AND w.deleted = 0',
      )) ??
      0;

  Future<StudyCard?> card(String id) async {
    final rows = await db.rawQuery('$cardSelect AND c.id = ?', [id]);
    return rows.isEmpty ? null : cardFromRow(rows.first);
  }

  Future<Map<CardState, int>> countCardsByState() async {
    final rows = await db.rawQuery(
      'SELECT state, COUNT(*) AS n FROM cards WHERE deleted = 0 AND is_suspended = 0 GROUP BY state',
    );
    return {for (final r in rows) CardStateWire.parse(r['state']! as String): r['n']! as int};
  }
}
