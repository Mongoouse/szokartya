import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/repositories/study_repository.dart';
import '../../domain/cefr_levels.dart';
import '../../domain/sm2_scheduler.dart';
import '../../providers.dart';
import '../home/home_summary_provider.dart';
import '../stats/stats_screen.dart' show stateLabel;
import '../sync/sync_controller.dart';

final cardsOverviewProvider = FutureProvider.autoDispose<CardsOverview>(
  (ref) => ref.watch(studyRepositoryProvider).cardsOverview(),
);

/// Beállítások → Kártyáim: a kártyák állapot szerint, és egy teljes szint
/// szavainak felvétele egyszerre (haladó lehetőség – a szint- és témakör-leckék
/// a szavakat maguktól, fokozatosan veszik fel).
class CardsOverviewScreen extends ConsumerWidget {
  const CardsOverviewScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final overview = ref.watch(cardsOverviewProvider);
    final theme = Theme.of(context);
    return Scaffold(
      appBar: AppBar(title: const Text('Kártyáim')),
      body: overview.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('Hiba: $e')),
        data: (o) => ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Text(
              '${o.enrolledWords} szót tanulsz. Szavanként több kártya készül (jelentés, németül, '
              'névelő, többes szám), ezért a kártyák száma nagyobb a szavakénál.',
              style: theme.textTheme.bodyMedium,
            ),
            const SizedBox(height: 16),
            Text('Kártyák állapot szerint', style: theme.textTheme.titleSmall),
            Wrap(spacing: 8, children: [
              for (final state in CardState.values) Chip(label: Text('${stateLabel(state)}: ${o.cardsByState[state] ?? 0}')),
            ]),
            const SizedBox(height: 24),
            Text('Teljes szint felvétele', style: theme.textTheme.titleSmall),
            Text(
              'A szint összes még fel nem vett szavából egyszerre készülnek kártyák. Erre általában nincs szükség: '
              'a szint szerinti lecke magától veszi fel a szavakat.',
              style: theme.textTheme.bodySmall,
            ),
            const SizedBox(height: 8),
            if (o.unenrolledByLevel.isEmpty) const Text('Minden elérhető szót felvettél.'),
            Wrap(spacing: 8, children: [
              for (final level in cefrLevels)
                if (o.unenrolledByLevel[level] case final count?)
                  ActionChip(label: Text('$level ($count szó)'), onPressed: () => _enroll(context, ref, level)),
            ]),
          ],
        ),
      ),
    );
  }

  Future<void> _enroll(BuildContext context, WidgetRef ref, String level) async {
    final created = await ref.read(studyRepositoryProvider).enrollLevel(level);
    ref
      ..invalidate(cardsOverviewProvider)
      ..invalidate(homeSummaryProvider);
    ref.read(syncControllerProvider.notifier).scheduleSync();
    if (context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$level: $created új kártya')));
    }
  }
}
