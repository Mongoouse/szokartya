// A helyi SQLite adatbázis gyára platformonként: mobilon a natív sqflite,
// böngészőben a WebAssembly-alapú sqflite_common_ffi_web (IndexedDB-ben tárol).
// A feltételes export miatt a natív build nem húzza be a webes kódot, és fordítva.
export 'platform_database_factory_native.dart' if (dart.library.js_interop) 'platform_database_factory_web.dart';
