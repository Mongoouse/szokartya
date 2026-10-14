import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/models/user_settings.dart';
import '../../domain/sm2_scheduler.dart';
import '../../providers.dart';
import '../auth/auth_controller.dart';
import '../study/study_screen.dart';
import '../sync/sync_controller.dart';
import 'home_summary_provider.dart';

class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key, required this.profile});

  final UserProfile profile;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final summary = ref.watch(homeSummaryProvider);
    final sync = ref.watch(syncControllerProvider);

    return Scaffold(
      appBar: AppBar(
        title: Text('Szia, ${profile.greetingName}!'),
        actions: [
          _SyncIndicator(status: sync),
          PopupMenuButton<String>(
            onSelected: (v) => v == 'logout' ? _signOut(context, ref) : null,
            itemBuilder: (_) => const [PopupMenuItem(value: 'logout', child: Text('Kijelentkezés'))],
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: ref.read(syncControllerProvider.notifier).syncNow,
        child: summary.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => ListView(children: [Padding(padding: const EdgeInsets.all(24), child: Text('Hiba: $e'))]),
          data: (s) => ListView(
            padding: const EdgeInsets.all(16),
            children: [
              Row(
                children: [
                  _Stat(label: 'Esedékes ma', value: s.dueToday),
                  _Stat(label: 'Új kártya', value: s.newAvailableToday),
                  _Stat(label: 'Ma értékelve', value: s.reviewedToday),
                ],
              ),
              const SizedBox(height: 24),
              FilledButton.icon(
                icon: const Icon(Icons.play_arrow),
                label: const Text('Tanulás indítása'),
                onPressed: s.dueToday + s.newAvailableToday == 0
                    ? null
                    : () async {
                        await Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const StudyScreen()));
                        ref.invalidate(homeSummaryProvider);
                      },
              ),
              const SizedBox(height: 24),
              Text('Kártyáid', style: Theme.of(context).textTheme.titleMedium),
              Wrap(
                spacing: 8,
                children: [
                  for (final state in CardState.values)
                    Chip(label: Text('${_stateLabel(state)}: ${s.cardsByState[state] ?? 0}')),
                ],
              ),
              const SizedBox(height: 24),
              Text('Új szavak felvétele', style: Theme.of(context).textTheme.titleMedium),
              if (s.unenrolledByLevel.isEmpty)
                const Padding(
                  padding: EdgeInsets.only(top: 8),
                  child: Text('Minden elérhető szót felvettél (vagy még nem futott szinkronizáció).'),
                ),
              Wrap(
                spacing: 8,
                children: [
                  for (final entry in (s.unenrolledByLevel.entries.toList()..sort((a, b) => a.key.compareTo(b.key))))
                    ActionChip(
                      label: Text('${entry.key} (${entry.value})'),
                      onPressed: () => _enroll(context, ref, entry.key),
                    ),
                ],
              ),
              if (s.pendingSync > 0) ...[
                const SizedBox(height: 24),
                Text('${s.pendingSync} módosítás vár feltöltésre', style: Theme.of(context).textTheme.bodySmall),
              ],
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _enroll(BuildContext context, WidgetRef ref, String level) async {
    final created = await ref.read(studyRepositoryProvider).enrollLevel(level);
    ref.invalidate(homeSummaryProvider);
    ref.read(syncControllerProvider.notifier).scheduleSync();
    if (context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$created új kártya ($level)')));
    }
  }

  Future<void> _signOut(BuildContext context, WidgetRef ref) async {
    final auth = ref.read(authControllerProvider.notifier);
    if (await auth.signOut()) return;
    if (!context.mounted) return;
    final force = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Feltöltetlen módosítások'),
        content: const Text(
          'Vannak még fel nem töltött értékelések (nincs kapcsolat). Kijelentkezéskor ezek elvesznek.',
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Mégse')),
          TextButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Kijelentkezés')),
        ],
      ),
    );
    if (force == true) await auth.signOut(force: true);
  }

  static String _stateLabel(CardState s) => switch (s) {
        CardState.newCard => 'Új',
        CardState.learning => 'Tanulás',
        CardState.review => 'Ismétlés',
        CardState.relearning => 'Újratanulás',
      };
}

class _Stat extends StatelessWidget {
  const _Stat({required this.label, required this.value});

  final String label;
  final int value;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Card(
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 16),
          child: Column(
            children: [
              Text('$value', style: Theme.of(context).textTheme.headlineMedium),
              Text(label, style: Theme.of(context).textTheme.bodySmall),
            ],
          ),
        ),
      ),
    );
  }
}

class _SyncIndicator extends StatelessWidget {
  const _SyncIndicator({required this.status});

  final SyncStatus status;

  @override
  Widget build(BuildContext context) {
    final (icon, tooltip) = switch (status) {
      SyncStatus(running: true) => (Icons.sync, 'Szinkronizálás…'),
      SyncStatus(offline: true) => (Icons.cloud_off, 'Offline – a módosítások később töltődnek fel'),
      SyncStatus(error: final e?) => (Icons.sync_problem, 'Szinkronhiba: $e'),
      _ => (Icons.cloud_done, 'Szinkronizálva'),
    };
    return Tooltip(message: tooltip, child: Padding(padding: const EdgeInsets.all(12), child: Icon(icon)));
  }
}
