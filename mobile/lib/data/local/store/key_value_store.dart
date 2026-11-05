import 'package:sqflite/sqflite.dart';

import 'store_support.dart';

/// Kulcs–érték állapot (szinkron kurzor, beállítások) és a teljes törlés.
mixin KeyValueStore on LocalStoreBase {
  Future<String?> getState(String key) async {
    final rows = await db.query('sync_state', where: 'key = ?', whereArgs: [key]);
    return rows.isEmpty ? null : rows.first['value']! as String;
  }

  Future<void> setState(String key, String value) =>
      db.insert('sync_state', {'key': key, 'value': value}, conflictAlgorithm: ConflictAlgorithm.replace);

  Future<void> wipe() => database.wipe();

  /// A szinkron kurzor törlése: a következő pull teljes (pl. a katalógusszintek változása után).
  Future<void> resetSyncCursor() => db.delete('sync_state', where: 'key = ?', whereArgs: ['sync.cursor']);
}
