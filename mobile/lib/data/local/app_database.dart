import 'dart:convert';

import 'package:flutter/foundation.dart' show visibleForTesting;
import 'package:path/path.dart' as p;
import 'package:sqflite/sqflite.dart';

/// Helyi SQLite adatbázis – az offline-first működés alapja.
///
/// Táblák:
///  - `words`       a szókatalógus a szerver JSON-jával (payload) + verzió,
///                  kereséshez kisbetűs szöveggel (search_text);
///  - `word_categories` szó ↔ tematikus kategória (a payloadból, böngészéshez);
///  - `cards`       a felhasználó kártyái és ütemezési állapotuk (helyi, ideiglenes
///                  ütemezés is ide íródik; a szerver állapota a pull-lal érkezik);
///  - `review_log`  értékelési napló (helyi + más eszközökről lehúzott), a napi
///                  keretek offline számításához;
///  - `outbox`      szinkronizálásra váró helyi módosítások, FIFO sorrendben;
///  - `sync_state`  kulcs–érték: szinkron kurzor, felhasználói beállítások.
///
/// Időbélyegek: UTC ezredmásodperc (INTEGER) – rendezhető és zónafüggetlen.
class AppDatabase {
  AppDatabase._(this.db);

  static const _version = 2;

  final Database db;

  /// Megnyitás az alapértelmezett helyen. Tesztben [path] lehet
  /// `inMemoryDatabasePath`, [factory] pedig a `sqflite_common_ffi` gyára.
  /// A [version] csak a migrációs tesztekhez írható felül (régi séma előállítása).
  static Future<AppDatabase> open({
    String? path,
    DatabaseFactory? factory,
    @visibleForTesting int version = _version,
  }) async {
    final dbFactory = factory ?? databaseFactory;
    final dbPath = path ?? p.join(await dbFactory.getDatabasesPath(), 'szokartya.db');
    final db = await dbFactory.openDatabase(
      dbPath,
      options: OpenDatabaseOptions(
        version: version,
        onConfigure: (db) => db.execute('PRAGMA foreign_keys = ON'),
        onCreate: (db, version) => _migrate(db, 0, version),
        onUpgrade: _migrate,
      ),
    );
    return AppDatabase._(db);
  }

  /// Verzióalapú, inkrementális migrációk.
  static Future<void> _migrate(Database db, int from, int to) async {
    final batch = db.batch();
    if (from < 1) {
      batch
        ..execute('''
          CREATE TABLE words (
            id          TEXT PRIMARY KEY,
            payload     TEXT    NOT NULL,
            version     INTEGER NOT NULL,
            cefr_level  TEXT,
            part_of_speech TEXT NOT NULL,
            has_gender  INTEGER NOT NULL DEFAULT 0,
            deleted     INTEGER NOT NULL DEFAULT 0
          )''')
        ..execute('CREATE INDEX words_cefr_idx ON words (cefr_level) WHERE deleted = 0')
        ..execute('''
          CREATE TABLE cards (
            id               TEXT PRIMARY KEY,
            word_id          TEXT    NOT NULL,
            card_type        TEXT    NOT NULL,
            state            TEXT    NOT NULL,
            ease_factor      REAL    NOT NULL,
            interval_days    INTEGER NOT NULL,
            repetitions      INTEGER NOT NULL,
            learning_step    INTEGER NOT NULL,
            lapses           INTEGER NOT NULL,
            total_reviews    INTEGER NOT NULL,
            correct_reviews  INTEGER NOT NULL,
            avg_response_ms  INTEGER,
            stability_days   REAL,
            last_reviewed_at INTEGER,
            next_review_at   INTEGER,
            is_suspended     INTEGER NOT NULL DEFAULT 0,
            server_version   INTEGER NOT NULL DEFAULT 0,
            created_at       INTEGER NOT NULL,
            deleted          INTEGER NOT NULL DEFAULT 0,
            UNIQUE (word_id, card_type)
          )''')
        // Esedékes kártyák – a szerver részleges indexének megfelelője.
        ..execute('''
          CREATE INDEX cards_due_idx ON cards (next_review_at)
            WHERE deleted = 0 AND is_suspended = 0 AND state <> 'NEW' ''')
        ..execute('''
          CREATE INDEX cards_new_idx ON cards (created_at)
            WHERE deleted = 0 AND is_suspended = 0 AND state = 'NEW' ''')
        ..execute('''
          CREATE TABLE review_log (
            id               TEXT PRIMARY KEY,
            card_id          TEXT    NOT NULL,
            grade            INTEGER NOT NULL,
            response_time_ms INTEGER NOT NULL,
            reviewed_at      INTEGER NOT NULL,
            state_before     TEXT    NOT NULL,
            state_after      TEXT    NOT NULL,
            synced           INTEGER NOT NULL DEFAULT 0
          )''')
        ..execute('CREATE INDEX review_log_day_idx ON review_log (reviewed_at)')
        ..execute('''
          CREATE TABLE outbox (
            seq        INTEGER PRIMARY KEY AUTOINCREMENT,
            kind       TEXT    NOT NULL CHECK (kind IN ('enroll', 'card_change', 'review')),
            entity_id  TEXT    NOT NULL,
            payload    TEXT    NOT NULL,
            created_at INTEGER NOT NULL,
            attempts   INTEGER NOT NULL DEFAULT 0
          )''')
        ..execute('CREATE INDEX outbox_entity_idx ON outbox (entity_id)')
        ..execute('''
          CREATE TABLE sync_state (
            key   TEXT PRIMARY KEY,
            value TEXT NOT NULL
          )''');
    }
    if (from < 2 && to >= 2) {
      // Saját szavak és keresés/böngészés: új oszlopok és kategóriatábla.
      batch
        ..execute('ALTER TABLE words ADD COLUMN is_custom INTEGER NOT NULL DEFAULT 0')
        ..execute("ALTER TABLE words ADD COLUMN search_text TEXT NOT NULL DEFAULT ''")
        ..execute('''
          CREATE TABLE word_categories (
            word_id TEXT NOT NULL REFERENCES words (id) ON DELETE CASCADE,
            slug    TEXT NOT NULL,
            name_hu TEXT NOT NULL,
            PRIMARY KEY (word_id, slug)
          )''')
        ..execute('CREATE INDEX word_categories_slug_idx ON word_categories (slug)')
        // Az outbox CHECK kényszere nem módosítható (SQLite) → tábla újraépítése
        // az új 'custom_word' típussal, a sorrend (seq) megőrzésével.
        ..execute('''
          CREATE TABLE outbox_v2 (
            seq        INTEGER PRIMARY KEY AUTOINCREMENT,
            kind       TEXT    NOT NULL CHECK (kind IN ('custom_word', 'enroll', 'card_change', 'review')),
            entity_id  TEXT    NOT NULL,
            payload    TEXT    NOT NULL,
            created_at INTEGER NOT NULL,
            attempts   INTEGER NOT NULL DEFAULT 0
          )''')
        ..execute('INSERT INTO outbox_v2 SELECT seq, kind, entity_id, payload, created_at, attempts FROM outbox')
        ..execute('DROP TABLE outbox')
        ..execute('ALTER TABLE outbox_v2 RENAME TO outbox')
        ..execute('CREATE INDEX outbox_entity_idx ON outbox (entity_id)');
    }
    // Későbbi verziók: if (from < 3) { ... }
    await batch.commit(noResult: true);
    if (from >= 1 && from < 2 && to >= 2) await _backfillV2(db);
  }

  /// A v2 előtt lehúzott szavak keresőszövege és kategóriái a tárolt payloadból.
  static Future<void> _backfillV2(Database db) async {
    final rows = await db.query('words', columns: ['id', 'payload']);
    final batch = db.batch();
    for (final r in rows) {
      final json = jsonDecode(r['payload']! as String) as Map<String, dynamic>;
      batch.update('words', wordIndexColumns(json), where: 'id = ?', whereArgs: [r['id']]);
      for (final c in wordCategoryRows(json)) {
        batch.insert('word_categories', c, conflictAlgorithm: ConflictAlgorithm.ignore);
      }
    }
    await batch.commit(noResult: true);
  }

  /// A keresést és szűrést szolgáló, a payloadból származtatott oszlopok.
  static Map<String, Object?> wordIndexColumns(Map<String, dynamic> json) {
    final translations = ((json['translations'] as List?) ?? const []).map((t) => (t as Map)['text']);
    return {
      'is_custom': json['isCustom'] == true ? 1 : 0,
      'search_text': [json['lemma'], json['display'], ...translations].whereType<String>().join(' ').toLowerCase(),
    };
  }

  static List<Map<String, Object?>> wordCategoryRows(Map<String, dynamic> json) => [
        for (final c in ((json['categories'] as List?) ?? const []).cast<Map<String, dynamic>>())
          {'word_id': json['id'], 'slug': c['slug'], 'name_hu': c['nameHu'] ?? c['slug']},
      ];

  /// Minden helyi adat törlése (kijelentkezéskor – közös eszközön ne maradjon adat).
  Future<void> wipe() async {
    await db.transaction((txn) async {
      for (final table in ['outbox', 'review_log', 'cards', 'word_categories', 'words', 'sync_state']) {
        await txn.delete(table);
      }
    });
  }

  Future<void> close() => db.close();
}
