import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/models/study_card.dart';
import '../../data/repositories/study_repository.dart';
import '../../domain/sm2_scheduler.dart';
import '../../providers.dart';

final studyStatsProvider = FutureProvider.autoDispose<StudyStats>((ref) => ref.watch(studyRepositoryProvider).stats());

/// Tanulási statisztika: aktivitás, pontosság, sorozat, előrejelzés, nehéz kártyák.
class StatsScreen extends ConsumerWidget {
  const StatsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final stats = ref.watch(studyStatsProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Statisztika')),
      body: stats.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('Hiba: $e')),
        data: (s) => ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Row(
              children: [
                _Figure(label: 'Sorozat', value: '${s.streakDays} nap'),
                _Figure(
                  label: 'Pontosság (30 nap)',
                  value: s.accuracyLast30Days == null ? '–' : '${(s.accuracyLast30Days! * 100).round()}%',
                ),
                _Figure(label: 'Értékelés (30 nap)', value: '${s.reviewsLast30Days}'),
              ],
            ),
            if (s.avgResponseMsLast30Days != null)
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Text('Átlagos felidézési idő: ${(s.avgResponseMsLast30Days! / 1000).toStringAsFixed(1)} mp'),
              ),
            const SizedBox(height: 24),
            _Section(title: 'Napi aktivitás (30 nap)'),
            _BarChart(
              values: [for (final d in s.days) d.reviews],
              highlight: [for (final d in s.days) d.correct],
              semanticsLabel: 'Az elmúlt 30 napban összesen ${s.reviewsLast30Days} értékelés',
            ),
            const SizedBox(height: 24),
            _Section(title: 'Esedékes kártyák (14 nap)'),
            _BarChart(
              values: [for (final d in s.forecast) d.due],
              semanticsLabel: 'Ma ${s.forecast.first.due}, a következő 14 napban '
                  '${s.forecast.fold<int>(0, (a, d) => a + d.due)} esedékes kártya',
            ),
            const SizedBox(height: 24),
            _Section(title: 'Kártyák állapot szerint'),
            Wrap(spacing: 8, children: [
              for (final state in CardState.values) Chip(label: Text('${stateLabel(state)}: ${s.cardsByState[state] ?? 0}')),
            ]),
            const SizedBox(height: 16),
            _Section(title: 'Kártyák típus szerint'),
            Wrap(spacing: 8, children: [
              for (final type in CardType.values)
                if ((s.cardsByType[type] ?? 0) > 0) Chip(label: Text('${type.label}: ${s.cardsByType[type]}')),
            ]),
            if (s.hardest.isNotEmpty) ...[
              const SizedBox(height: 24),
              _Section(title: 'Legnehezebb kártyák'),
              for (final h in s.hardest)
                ListTile(
                  dense: true,
                  title: Text(h.word.display),
                  subtitle: Text('${h.word.primaryTranslation} · ${h.type.label}'),
                  trailing: Text('${h.lapses}× elfelejtve'),
                ),
            ],
          ],
        ),
      ),
    );
  }
}

String stateLabel(CardState s) => switch (s) {
      CardState.newCard => 'Új',
      CardState.learning => 'Tanulás',
      CardState.review => 'Ismétlés',
      CardState.relearning => 'Újratanulás',
    };

class _Section extends StatelessWidget {
  const _Section({required this.title});

  final String title;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: Text(title, style: Theme.of(context).textTheme.titleMedium),
      );
}

class _Figure extends StatelessWidget {
  const _Figure({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) => Expanded(
        child: Card(
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 16, horizontal: 4),
            child: Column(children: [
              Text(value, style: Theme.of(context).textTheme.titleLarge),
              Text(label, style: Theme.of(context).textTheme.bodySmall, textAlign: TextAlign.center),
            ]),
          ),
        ),
      );
}

/// Egyszerű oszlopdiagram külső csomag nélkül. [highlight]: az oszlop kiemelt része (pl. helyes válaszok).
class _BarChart extends StatelessWidget {
  const _BarChart({required this.values, required this.semanticsLabel, this.highlight});

  final List<int> values;
  final List<int>? highlight;
  final String semanticsLabel;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final max = values.fold<int>(1, (a, v) => v > a ? v : a);
    return Semantics(
      label: semanticsLabel,
      excludeSemantics: true,
      child: SizedBox(
        height: 100,
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            for (var i = 0; i < values.length; i++)
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 1),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.end,
                    children: [
                      Container(
                        height: 100 * (values[i] - (highlight?[i] ?? 0)) / max,
                        color: highlight == null ? scheme.primary : scheme.secondaryContainer,
                      ),
                      if (highlight != null) Container(height: 100 * highlight![i] / max, color: scheme.primary),
                    ],
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}
