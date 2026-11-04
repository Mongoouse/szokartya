import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/models/user_settings.dart';
import '../../data/repositories/study_repository.dart';
import '../../domain/word_scope.dart';
import '../admin/admin_screen.dart';
import '../auth/auth_controller.dart';
import '../reports/my_reports_screen.dart';
import '../settings/settings_screen.dart';
import '../stats/stats_screen.dart';
import '../study/study_screen.dart';
import '../study/study_session_controller.dart';
import '../sync/sync_controller.dart';
import '../words/custom_word_screen.dart';
import '../words/topic_screen.dart';
import '../words/word_browser_screen.dart';
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
            tooltip: 'Menü',
            onSelected: (v) => switch (v) {
              'stats' => _open(context, ref, const StatsScreen()),
              'words' => _open(context, ref, const WordBrowserScreen()),
              'custom' => _open(context, ref, const CustomWordScreen()),
              'settings' => _open(context, ref, SettingsScreen(profile: profile)),
              'reports' => _open(context, ref, const MyReportsScreen()),
              'admin' => _open(context, ref, const AdminScreen()),
              _ => _signOut(context, ref),
            },
            itemBuilder: (_) => [
              const PopupMenuItem(value: 'stats', child: Text('Statisztika')),
              const PopupMenuItem(value: 'words', child: Text('Szókereső')),
              const PopupMenuItem(value: 'custom', child: Text('Új saját szó')),
              const PopupMenuItem(value: 'reports', child: Text('Bejelentéseim')),
              if (profile.isAdmin) const PopupMenuItem(value: 'admin', child: Text('Adminisztráció')),
              const PopupMenuItem(value: 'settings', child: Text('Beállítások')),
              const PopupMenuItem(value: 'logout', child: Text('Kijelentkezés')),
            ],
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
                key: const Key('startLesson'),
                icon: const Icon(Icons.play_arrow),
                label: const Text('Lecke indítása (20 kártya)'),
                onPressed: s.dueToday + s.newAvailableToday == 0 ? null : () => _study(context, ref, const StudySessionArgs()),
              ),
              const SizedBox(height: 8),
              OutlinedButton.icon(
                key: const Key('startEndless'),
                icon: const Icon(Icons.all_inclusive),
                label: const Text('Végtelen gyakorlás'),
                onPressed: s.enrolledWords == 0 ? null : () => _study(context, ref, const StudySessionArgs(endless: true)),
              ),
              if (s.levels.isNotEmpty) ...[
                const SizedBox(height: 24),
                Text('Lecke szint szerint (20 kártya)', style: Theme.of(context).textTheme.titleMedium),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    for (final l in s.levels)
                      Tooltip(
                        message: '${l.level}: ${l.words} szó',
                        child: FilledButton.tonal(
                          key: Key('level-${l.level}'),
                          onPressed: () => _study(context, ref, StudySessionArgs(scope: LevelScope(l.level))),
                          child: Text(l.level, style: const TextStyle(fontSize: 16)),
                        ),
                      ),
                  ],
                ),
              ],
              if (s.topics.isNotEmpty) ...[
                const SizedBox(height: 24),
                Text('Témakörök', style: Theme.of(context).textTheme.titleMedium),
                const SizedBox(height: 4),
                for (final t in s.topics) _TopicTile(summary: t, onTap: () => _open(context, ref, TopicScreen(scope: t.scope))),
              ],
              const SizedBox(height: 16),
              OutlinedButton.icon(
                icon: const Icon(Icons.search),
                label: const Text('Szókereső'),
                onPressed: () => _open(context, ref, const WordBrowserScreen()),
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

  Future<void> _study(BuildContext context, WidgetRef ref, StudySessionArgs args) async {
    await Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => StudyScreen(args: args)));
    ref.invalidate(homeSummaryProvider);
  }

  Future<void> _open(BuildContext context, WidgetRef ref, Widget screen) async {
    await Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => screen));
    ref.invalidate(homeSummaryProvider);
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
          'Vannak még fel nem töltött értékelések (nincs kapcsolat). Ezek ezen az eszközön megmaradnak, '
          'és a következő bejelentkezéskor feltöltődnek. Ha itt másik fiókkal lépsz be, elvesznek.',
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Mégse')),
          TextButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Kijelentkezés')),
        ],
      ),
    );
    if (force == true) await auth.signOut(force: true);
  }
}

/// Témakör a kezdőképernyőn: szószám és ismeret (%), koppintásra a szólista.
class _TopicTile extends StatelessWidget {
  const _TopicTile({required this.summary, required this.onTap});

  final ScopeSummary<TopicScope> summary;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final percent = (summary.knowledge * 100).round();
    return Card(
      margin: const EdgeInsets.symmetric(vertical: 4),
      child: ListTile(
        title: Text(summary.scope.title),
        subtitle: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('${summary.totalWords} szó · ismeret: $percent%'),
            const SizedBox(height: 4),
            Semantics(
              label: 'Ismeret: $percent%',
              child: LinearProgressIndicator(value: summary.knowledge),
            ),
          ],
        ),
        trailing: const Icon(Icons.chevron_right),
        onTap: onTap,
      ),
    );
  }
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
