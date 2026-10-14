import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_exception.dart';
import '../../providers.dart';
import '../home/home_summary_provider.dart';

/// A szinkronizáció UI-állapota.
class SyncStatus {
  const SyncStatus({this.running = false, this.lastSyncAt, this.error, this.offline = false});

  final bool running;
  final DateTime? lastSyncAt;
  final String? error;

  /// Az utolsó kísérlet hálózati hiba miatt bukott el – offline mód.
  final bool offline;

  SyncStatus copyWith({bool? running, DateTime? lastSyncAt, String? error, bool? offline, bool clearError = false}) =>
      SyncStatus(
        running: running ?? this.running,
        lastSyncAt: lastSyncAt ?? this.lastSyncAt,
        error: clearError ? null : (error ?? this.error),
        offline: offline ?? this.offline,
      );
}

/// A szinkronizáció ütemezése: azonnali (belépés, kézi frissítés), késleltetett
/// (értékelések után, kötegelve) és periodikus.
class SyncController extends Notifier<SyncStatus> {
  static const _debounce = Duration(seconds: 5);
  static const _period = Duration(minutes: 5);

  Timer? _debounceTimer;
  Timer? _periodicTimer;

  @override
  SyncStatus build() {
    _periodicTimer = Timer.periodic(_period, (_) => syncNow());
    ref.onDispose(() {
      _debounceTimer?.cancel();
      _periodicTimer?.cancel();
    });
    unawaited(_loadLastSync());
    return const SyncStatus();
  }

  /// Értékelés után: rövid várakozással kötegeljük a feltöltést.
  void scheduleSync() {
    _debounceTimer?.cancel();
    _debounceTimer = Timer(_debounce, syncNow);
  }

  Future<void> syncNow() async {
    _debounceTimer?.cancel();
    if (state.running) return;
    state = state.copyWith(running: true, clearError: true);
    try {
      final report = await ref.read(syncEngineProvider).sync();
      state = SyncStatus(lastSyncAt: report.finishedAt);
    } on NetworkException {
      state = state.copyWith(running: false, offline: true);
    } on UnauthorizedException {
      state = state.copyWith(running: false);
    } on ApiException catch (e) {
      state = state.copyWith(running: false, error: e.message);
    } finally {
      ref.invalidate(homeSummaryProvider);
    }
  }

  Future<void> _loadLastSync() async {
    final last = await ref.read(syncEngineProvider).lastSyncAt();
    if (last != null && ref.mounted) state = state.copyWith(lastSyncAt: last);
  }
}

final syncControllerProvider = NotifierProvider<SyncController, SyncStatus>(SyncController.new);
