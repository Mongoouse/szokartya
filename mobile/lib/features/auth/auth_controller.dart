import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_exception.dart';
import '../../data/models/user_settings.dart';
import '../../providers.dart';
import '../sync/sync_controller.dart';

/// A munkamenet állapota: `null` = kijelentkezve.
class AuthController extends AsyncNotifier<UserProfile?> {
  @override
  Future<UserProfile?> build() async {
    // Lejárt, nem frissíthető munkamenet → automatikus kiléptetés.
    ref.read(apiClientProvider).onSessionExpired = () => state = const AsyncData(null);
    return ref.read(authRepositoryProvider).restoreSession();
  }

  Future<void> login(String email, String password) => _authenticate(
        () async => ref.read(authRepositoryProvider).login(
              email: email.trim(),
              password: password,
              deviceId: await ref.read(syncEngineProvider).deviceId(),
            ),
      );

  Future<void> register(String email, String password, String? displayName) => _authenticate(
        () async => ref.read(authRepositoryProvider).register(
              email: email.trim(),
              password: password,
              displayName: displayName?.trim(),
              deviceId: await ref.read(syncEngineProvider).deviceId(),
            ),
      );

  /// Kilépés előtt megpróbáljuk feltölteni a várakozó módosításokat, hogy a
  /// helyi adatok törlésével ne vesszen el tanulási előzmény.
  /// @returns false, ha maradt fel nem töltött módosítás (a UI megerősítést kér).
  Future<bool> signOut({bool force = false}) async {
    if (!force) {
      try {
        await ref.read(syncEngineProvider).sync();
      } on ApiException {
        // offline – lásd lent
      }
      if (await ref.read(localStoreProvider).outboxCount() > 0) return false;
    }
    await ref.read(authRepositoryProvider).logout();
    state = const AsyncData(null);
    return true;
  }

  Future<void> _authenticate(Future<UserProfile> Function() action) async {
    state = const AsyncLoading<UserProfile?>();
    state = await AsyncValue.guard(action);
    if (state.value != null) {
      // Az első szinkron a háttérben indul; hibája nem akadályozza a belépést.
      unawaited(ref.read(syncControllerProvider.notifier).syncNow());
    }
  }
}

final authControllerProvider = AsyncNotifierProvider<AuthController, UserProfile?>(AuthController.new);
