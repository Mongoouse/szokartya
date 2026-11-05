import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/repositories/placement_repository.dart';
import '../../domain/placement_test.dart';
import '../../providers.dart';

/// A szintfelmérő tárolt állapota (a kezdőképernyő ajánlásához).
final placementOutcomeProvider = FutureProvider.autoDispose<PlacementOutcome>(
  (ref) => ref.watch(placementRepositoryProvider).load(),
);

/// Induláskor felajánljuk-e a szintfelmérőt (új felhasználónál igen).
final placementOfferProvider = FutureProvider.autoDispose<bool>(
  (ref) => ref.watch(placementRepositoryProvider).shouldOfferOnStart(),
);

/// Véletlenforrás a kérdések sorrendjéhez (tesztben rögzíthető).
final placementRandomProvider = Provider<Random>((ref) => Random());

enum _Phase { intro, test, result }

/// Szintfelmérő: rövid bevezető, szókincsteszt (A1 → C1), eredmény.
///
/// Az app elején (első belépés, még nincs felvett szó) a kezdőképernyő helyett
/// jelenik meg; a kezdőképernyőről később is elindítható. A végén vagy
/// kihagyáskor az eredmény helyben mentődik, és a kezdőképernyő a javasolt
/// szint leckéjét kínálja.
class PlacementScreen extends ConsumerStatefulWidget {
  const PlacementScreen({super.key});

  @override
  ConsumerState<PlacementScreen> createState() => _PlacementScreenState();
}

class _PlacementScreenState extends ConsumerState<PlacementScreen> {
  _Phase _phase = _Phase.intro;
  late PlacementTest _test = _newTest();
  bool _saving = false;

  PlacementTest _newTest() => PlacementTest(random: ref.read(placementRandomProvider));

  @override
  Widget build(BuildContext context) {
    final canPop = Navigator.of(context).canPop();
    return Scaffold(
      appBar: AppBar(
        automaticallyImplyLeading: canPop,
        title: Text(switch (_phase) {
          _Phase.intro => 'Szintfelmérő',
          _Phase.test => 'Szintfelmérő · ${_test.currentLevel}',
          _Phase.result => 'Az eredményed',
        }),
        actions: [
          if (_phase != _Phase.result && !canPop)
            TextButton(key: const Key('placementSkip'), onPressed: _saving ? null : _skip, child: const Text('Kihagyom')),
        ],
      ),
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 560),
            child: switch (_phase) {
              _Phase.intro => _Intro(onStart: () => setState(() => _phase = _Phase.test)),
              _Phase.test => _Question(
                  key: ValueKey(_test.answered),
                  test: _test,
                  onAnswer: _answer,
                ),
              _Phase.result => _Result(
                  result: _test.result,
                  saving: _saving,
                  onDone: _finish,
                  onRetry: () => setState(() {
                    _test = _newTest();
                    _phase = _Phase.test;
                  }),
                ),
            },
          ),
        ),
      ),
    );
  }

  void _answer(String? choice) {
    setState(() {
      _test.answer(choice);
      if (_test.isFinished) _phase = _Phase.result;
    });
  }

  Future<void> _finish() => _close(() => ref.read(placementRepositoryProvider).save(_test.result));

  Future<void> _skip() => _close(() => ref.read(placementRepositoryProvider).skip());

  Future<void> _close(Future<void> Function() persist) async {
    setState(() => _saving = true);
    await persist();
    ref
      ..invalidate(placementOutcomeProvider)
      ..invalidate(placementOfferProvider);
    if (!mounted) return;
    // A kezdőképernyőről nyitva visszalépünk; induláskor a kapu vált át a kezdőképernyőre.
    final navigator = Navigator.of(context);
    if (navigator.canPop()) navigator.pop();
  }
}

class _Intro extends StatelessWidget {
  const _Intro({required this.onStart});

  final VoidCallback onStart;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return ListView(
      padding: const EdgeInsets.all(24),
      children: [
        Icon(Icons.flag_outlined, size: 56, color: theme.colorScheme.primary),
        const SizedBox(height: 16),
        Text('Hol tartasz németből?', style: theme.textTheme.headlineSmall, textAlign: TextAlign.center),
        const SizedBox(height: 12),
        Text(
          'Egy rövid szókincsteszt megmutatja, melyik szinten (A1–C1) érdemes kezdened. '
          'Német szavakat látsz, és ki kell választanod a jelentésüket. Ha nem tudod, nyugodtan '
          'válaszd a „Nem tudom” lehetőséget – a tippelés csak rontja a pontosságot.',
          style: theme.textTheme.bodyLarge,
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: 8),
        Text(
          'Kb. 2–3 perc, legfeljebb 30 kérdés. Később a kezdőképernyőről újra kitöltheted.',
          style: theme.textTheme.bodySmall,
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: 32),
        FilledButton.icon(
          key: const Key('placementStart'),
          icon: const Icon(Icons.play_arrow),
          label: const Text('Kezdés'),
          onPressed: onStart,
        ),
      ],
    );
  }
}

class _Question extends StatelessWidget {
  const _Question({super.key, required this.test, required this.onAnswer});

  final PlacementTest test;
  final void Function(String? choice) onAnswer;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final question = test.current!;
    final levelIndex = test.levels.indexOf(test.currentLevel);
    return ListView(
      padding: const EdgeInsets.all(24),
      children: [
        Semantics(
          label: 'Szint: ${levelIndex + 1} / ${test.levels.length}',
          child: LinearProgressIndicator(value: (levelIndex + 1) / test.levels.length),
        ),
        const SizedBox(height: 8),
        Text('${test.answered + 1}. kérdés', style: theme.textTheme.bodySmall, textAlign: TextAlign.center),
        const SizedBox(height: 24),
        Text('Mit jelent?', style: theme.textTheme.titleMedium, textAlign: TextAlign.center),
        const SizedBox(height: 8),
        Text(
          question.item.german,
          key: const Key('placementWord'),
          style: theme.textTheme.headlineMedium,
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: 32),
        for (final (i, option) in question.options.indexed)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: OutlinedButton(
              key: Key('placementOption-$i'),
              style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(52)),
              onPressed: () => onAnswer(option),
              child: Text(option, textAlign: TextAlign.center),
            ),
          ),
        const SizedBox(height: 8),
        TextButton(
          key: const Key('placementDontKnow'),
          onPressed: () => onAnswer(null),
          child: const Text('Nem tudom'),
        ),
      ],
    );
  }
}

class _Result extends StatelessWidget {
  const _Result({required this.result, required this.saving, required this.onDone, required this.onRetry});

  final PlacementResult result;
  final bool saving;
  final VoidCallback onDone;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final level = result.recommendedLevel;
    final passed = result.passedLevels;
    final summary = switch ((passed.isEmpty, result.allPassed)) {
      (true, _) => 'Az alapoktól érdemes kezdened: az A1 szint szavai a mindennapi helyzetek legfontosabb szavai.',
      (_, true) => 'Minden szinten jól teljesítettél. A $level szint szavaival csiszolhatod tovább a szókincsedet.',
      _ => 'A ${passed.join(', ')} szint szavait jól ismered. A $level szinttel érdemes folytatnod.',
    };
    return ListView(
      padding: const EdgeInsets.all(24),
      children: [
        Text('Ajánlott kezdőszint', style: theme.textTheme.titleMedium, textAlign: TextAlign.center),
        const SizedBox(height: 8),
        Text(
          level,
          key: const Key('placementLevel'),
          style: theme.textTheme.displayMedium?.copyWith(color: theme.colorScheme.primary),
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: 12),
        Text(summary, style: theme.textTheme.bodyLarge, textAlign: TextAlign.center),
        const SizedBox(height: 24),
        for (final s in result.scores)
          ListTile(
            dense: true,
            leading: Icon(
              s.passed ? Icons.check_circle : Icons.cancel,
              color: s.passed ? theme.colorScheme.primary : theme.colorScheme.error,
            ),
            title: Text('${s.level} szint'),
            trailing: Text('${s.correct} / ${s.asked} helyes'),
          ),
        const SizedBox(height: 24),
        FilledButton(
          key: const Key('placementDone'),
          onPressed: saving ? null : onDone,
          child: const Text('Tovább'),
        ),
        const SizedBox(height: 8),
        TextButton(onPressed: saving ? null : onRetry, child: const Text('Újrakezdem')),
      ],
    );
  }
}
