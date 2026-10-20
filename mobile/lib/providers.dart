import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'core/api/api_client.dart';
import 'core/api/token_store.dart';
import 'core/config/app_config.dart';
import 'core/time/clock.dart';
import 'core/tts/speaker.dart';
import 'data/local/app_database.dart';
import 'data/local/local_store.dart';
import 'data/repositories/auth_repository.dart';
import 'data/repositories/settings_repository.dart';
import 'data/repositories/study_repository.dart';
import 'sync/sync_engine.dart';

/// Függőségi gráf (composition root). Minden függőség provideren keresztül
/// jön, így tesztben bármelyik felülírható (`ProviderScope(overrides: …)`).

final appConfigProvider = Provider<AppConfig>((ref) => AppConfig.fromEnvironment());

final clockProvider = Provider<Clock>((ref) => const SystemClock());

/// Az adatbázist a main() nyitja meg induláskor, és ezzel írja felül.
final databaseProvider = Provider<AppDatabase>(
  (ref) => throw UnimplementedError('databaseProvider: a main()-ben felül kell írni'),
);

final tokenStoreProvider = Provider<TokenStore>((ref) => SecureTokenStore());

final apiClientProvider = Provider<ApiClient>((ref) {
  final client = ApiClient(config: ref.watch(appConfigProvider), tokenStore: ref.watch(tokenStoreProvider));
  ref.onDispose(client.close);
  return client;
});

final localStoreProvider = Provider<LocalStore>((ref) => LocalStore(ref.watch(databaseProvider)));

final authRepositoryProvider = Provider<AuthRepository>(
  (ref) => AuthRepository(
    api: ref.watch(apiClientProvider),
    tokens: ref.watch(tokenStoreProvider),
    store: ref.watch(localStoreProvider),
  ),
);

final studyRepositoryProvider = Provider<StudyRepository>(
  (ref) => StudyRepository(store: ref.watch(localStoreProvider), clock: ref.watch(clockProvider)),
);

final syncEngineProvider = Provider<SyncEngine>(
  (ref) => SyncEngine(
    api: ref.watch(apiClientProvider),
    store: ref.watch(localStoreProvider),
    clock: ref.watch(clockProvider),
  ),
);

final settingsRepositoryProvider = Provider<SettingsRepository>(
  (ref) => SettingsRepository(api: ref.watch(apiClientProvider), store: ref.watch(localStoreProvider)),
);

/// Német kiejtés (tesztben némítható).
final speakerProvider = Provider<Speaker>((ref) => DeviceSpeaker());

/// Hálózati állapot változásai (true = van kapcsolat). Tesztben felülírható.
final connectivityProvider = Provider<Stream<bool>>(
  (ref) => Connectivity().onConnectivityChanged.map((r) => r.any((c) => c != ConnectivityResult.none)).distinct(),
);
