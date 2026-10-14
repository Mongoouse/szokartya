import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'app.dart';
import 'data/local/app_database.dart';
import 'providers.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  // A helyi adatbázis megnyitása az első képkocka előtt: így minden provider
  // szinkron módon kaphatja meg, és az app hálózat nélkül is azonnal indul.
  final database = await AppDatabase.open();
  runApp(
    ProviderScope(
      overrides: [databaseProvider.overrideWithValue(database)],
      child: const SzokartyaApp(),
    ),
  );
}
