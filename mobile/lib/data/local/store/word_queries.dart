import '../../../domain/word_scope.dart';
import '../../models/study_card.dart';
import '../../models/word.dart';
import 'store_support.dart';

/// Szavak olvasása: szókereső, felvehető szavak, szókészlet-összesítők.
mixin WordQueries on LocalStoreBase {
  /// Egy szókészlet összesítője: szavak száma, ebből a felvettek, és az ismeret
  /// (a szavankénti találati arányok összege – a még nem gyakorolt szó 0-val
  /// számít). A találati arány az időtől független: helyes / összes válasz a szó
  /// minden kártyáján.
  Future<({int total, int enrolled, double knowledgeSum})> scopeStats(WordScope scope) async {
    final filter = scopeFilter(scope, 'w.id');
    final rows = await db.rawQuery(
      'SELECT COUNT(*) AS total, COALESCE(SUM(s.cards > 0), 0) AS enrolled, '
      'COALESCE(SUM(CASE WHEN s.answers > 0 THEN CAST(s.correct AS REAL) / s.answers ELSE 0 END), 0) AS knowledge '
      'FROM words w LEFT JOIN ('
      '  SELECT word_id, COUNT(*) AS cards, SUM(total_reviews) AS answers, SUM(correct_reviews) AS correct '
      '  FROM cards WHERE deleted = 0 GROUP BY word_id'
      ') s ON s.word_id = w.id '
      'WHERE w.deleted = 0${filter.sql}',
      filter.args,
    );
    final r = rows.first;
    return (
      total: (r['total'] as int?) ?? 0,
      enrolled: (r['enrolled'] as int?) ?? 0,
      knowledgeSum: ((r['knowledge'] as num?) ?? 0).toDouble(),
    );
  }

  /// Egy szókészlet még fel nem vett szavai (a felvétel sorrendjében).
  Future<List<Word>> unenrolledWordsIn(WordScope scope, {required int limit}) async {
    if (limit <= 0) return const [];
    final filter = scopeFilter(scope, 'w.id');
    final rows = await db.rawQuery(
      'SELECT w.payload FROM words w WHERE w.deleted = 0${filter.sql} '
      'AND NOT EXISTS (SELECT 1 FROM cards c WHERE c.word_id = w.id AND c.deleted = 0) ORDER BY w.rowid LIMIT ?',
      [...filter.args, limit],
    );
    return rows.map((r) => wordFromPayload(r['payload'])).toList();
  }

  /// A szókincs szintjei a szavak számával (pl. {A1: 650, B2: 1558}).
  Future<Map<String, int>> wordCountByLevel() async {
    final rows = await db.rawQuery(
      'SELECT cefr_level, COUNT(*) AS n FROM words WHERE deleted = 0 AND cefr_level IS NOT NULL GROUP BY cefr_level',
    );
    return {for (final r in rows) r['cefr_level']! as String: r['n']! as int};
  }

  /// Adott szintű, még fel nem vett szavak.
  Future<List<Word>> unenrolledWords({required String cefrLevel}) async {
    final rows = await db.rawQuery(
      'SELECT w.payload FROM words w WHERE w.deleted = 0 AND w.cefr_level = ? '
      'AND NOT EXISTS (SELECT 1 FROM cards c WHERE c.word_id = w.id AND c.deleted = 0) ORDER BY w.rowid',
      [cefrLevel],
    );
    return rows.map((r) => wordFromPayload(r['payload'])).toList();
  }

  /// Szókereső: részleges egyezés a német alakra vagy a magyar fordításra,
  /// szint- és kategóriaszűréssel. A felvett szavakat is visszaadja (jelölve).
  Future<List<({Word word, bool enrolled})>> searchWords({
    String query = '',
    String? cefrLevel,
    WordScope? scope,
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
    final filter = scopeFilter(scope, 'w.id');
    if (filter.sql.isNotEmpty) {
      where.add(filter.sql.replaceFirst(' AND ', ''));
      args.addAll(filter.args);
    }
    if (customOnly) where.add('w.is_custom = 1');
    final rows = await db.rawQuery(
      'SELECT w.payload, EXISTS (SELECT 1 FROM cards c WHERE c.word_id = w.id AND c.deleted = 0) AS enrolled '
      'FROM words w WHERE ${where.join(' AND ')} '
      // Előbb a szó elején egyezők, majd betűrend.
      "ORDER BY CASE WHEN w.search_text LIKE ? ESCAPE '\\' THEN 0 ELSE 1 END, w.search_text LIMIT ?",
      [...args, '$escaped%', limit],
    );
    return [
      for (final r in rows) (word: wordFromPayload(r['payload']), enrolled: r['enrolled'] == 1),
    ];
  }

  /// A szó kártyatípusai, amelyek már fel vannak véve.
  Future<Set<CardType>> enrolledTypes(String wordId) async {
    final rows = await db.query('cards', columns: ['card_type'], where: 'word_id = ? AND deleted = 0', whereArgs: [wordId]);
    return {for (final r in rows) CardType.parse(r['card_type']! as String)};
  }

  Future<Map<String, int>> unenrolledCountByLevel() async {
    final rows = await db.rawQuery(
      'SELECT cefr_level, COUNT(*) AS n FROM words w WHERE w.deleted = 0 AND cefr_level IS NOT NULL '
      'AND NOT EXISTS (SELECT 1 FROM cards c WHERE c.word_id = w.id AND c.deleted = 0) GROUP BY cefr_level',
    );
    return {for (final r in rows) r['cefr_level']! as String: r['n']! as int};
  }
}
