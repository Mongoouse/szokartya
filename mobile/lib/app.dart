import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'features/auth/auth_controller.dart';
import 'features/auth/login_screen.dart';
import 'features/home/home_screen.dart';
import 'features/sync/sync_controller.dart';
import 'providers.dart';

class SzokartyaApp extends StatelessWidget {
  const SzokartyaApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Szókártya',
      theme: ThemeData(colorSchemeSeed: const Color(0xFF2E7D32), useMaterial3: true),
      darkTheme: ThemeData(colorSchemeSeed: const Color(0xFF2E7D32), brightness: Brightness.dark, useMaterial3: true),
      home: const _AuthGate(),
    );
  }
}

/// Bejelentkezési állapot szerinti útválasztás.
class _AuthGate extends ConsumerWidget {
  const _AuthGate();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(authControllerProvider);
    return switch (auth) {
      AsyncData(value: final profile?) => _BackgroundSync(child: HomeScreen(profile: profile)),
      AsyncLoading() when auth.value == null && !auth.hasError =>
        const Scaffold(body: Center(child: CircularProgressIndicator())),
      _ => const LoginScreen(),
    };
  }
}

/// Háttérszinkron bejelentkezett állapotban: előtérbe kerüléskor és a
/// hálózat visszatértekor. (Az app bezárt állapotában nem fut – ehhez
/// platformszintű ütemező, pl. WorkManager kellene.)
class _BackgroundSync extends ConsumerStatefulWidget {
  const _BackgroundSync({required this.child});

  final Widget child;

  @override
  ConsumerState<_BackgroundSync> createState() => _BackgroundSyncState();
}

class _BackgroundSyncState extends ConsumerState<_BackgroundSync> {
  late final AppLifecycleListener _lifecycle;
  StreamSubscription<bool>? _connectivity;

  @override
  void initState() {
    super.initState();
    final sync = ref.read(syncControllerProvider.notifier);
    _lifecycle = AppLifecycleListener(onResume: sync.onResumed);
    _connectivity = ref.read(connectivityProvider).listen(
          (online) => sync.onConnectivityChanged(online: online),
          onError: (Object _) {}, // nem támogatott platform: csak a periodikus szinkron marad
        );
  }

  @override
  void dispose() {
    _lifecycle.dispose();
    unawaited(_connectivity?.cancel());
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => widget.child;
}
