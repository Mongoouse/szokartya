import 'package:sqflite/sqflite.dart' show DatabaseFactory;
import 'package:sqflite_common_ffi_web/sqflite_ffi_web.dart';

/// Böngésző: SQLite WebAssemblyben (web/sqlite3.wasm), megosztott workerben
/// (web/sqflite_sw.js), az adatok az IndexedDB-ben maradnak meg.
///
/// A két fájlt a `dart run sqflite_common_ffi_web:setup` állítja elő; a
/// repóban verziózva vannak, így a buildhez nem kell külön lépés.
DatabaseFactory get platformDatabaseFactory => databaseFactoryFfiWeb;
