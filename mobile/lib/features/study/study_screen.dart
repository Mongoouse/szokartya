import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/models/study_card.dart';
import '../../domain/answer_check.dart';
import '../../providers.dart';
import 'flashcard_view.dart';
import 'study_session_controller.dart';

class StudyScreen extends ConsumerStatefulWidget {
  const StudyScreen({super.key});

  @override
  ConsumerState<StudyScreen> createState() => _StudyScreenState();
}

class _StudyScreenState extends ConsumerState<StudyScreen> {
  final _answer = TextEditingController();

  @override
  void dispose() {
    _answer.dispose();
    super.dispose();
  }

  void _reveal() {
    final typed = _answer.text;
    _answer.clear();
    ref.read(studySessionProvider.notifier).reveal(typed: typed);
  }

  @override
  Widget build(BuildContext context) {
    final session = ref.watch(studySessionProvider);
    final controller = ref.read(studySessionProvider.notifier);
    final card = session.current;
    final typing = session.phase == StudyPhase.question && card?.cardType == CardType.production;

    return Scaffold(
      appBar: AppBar(
        title: Text(session.phase == StudyPhase.finished ? 'Kész' : 'Hátra: ${session.remaining}'),
      ),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: switch (session.phase) {
            StudyPhase.loading => const Center(child: CircularProgressIndicator()),
            StudyPhase.error => Center(child: Text(session.error ?? 'Ismeretlen hiba')),
            StudyPhase.finished => _Finished(reviewed: session.reviewed, correct: session.correct),
            StudyPhase.question || StudyPhase.answer => Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Expanded(
                    child: GestureDetector(
                      onTap: typing ? null : _reveal,
                      child: AnimatedSwitcher(
                        duration: const Duration(milliseconds: 200),
                        child: FlashcardView(
                          key: ValueKey('${card!.id}-${session.phase}'),
                          card: card,
                          showAnswer: session.phase == StudyPhase.answer,
                          onSpeak: () => ref.read(speakerProvider).speak(card.word.display),
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),
                  if (session.error != null)
                    Text(session.error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
                  if (session.check != null) _CheckBanner(check: session.check!, typed: session.typed ?? ''),
                  if (typing) ...[
                    TextField(
                      key: const Key('typedAnswer'),
                      controller: _answer,
                      autofocus: true,
                      autocorrect: false,
                      textInputAction: TextInputAction.done,
                      onSubmitted: (_) => _reveal(),
                      decoration: const InputDecoration(
                        labelText: 'Válaszod (névelővel)',
                        helperText: 'Üresen hagyva csak megfordítja a kártyát',
                      ),
                    ),
                    const SizedBox(height: 8),
                  ],
                  if (session.phase == StudyPhase.question)
                    FilledButton(onPressed: _reveal, child: Text(typing ? 'Ellenőrzés' : 'Mutasd a választ'))
                  else
                    _GradeButtons(
                      preview: session.preview,
                      enabled: !session.saving,
                      suggested: session.check?.verdict.suggestedGrade,
                      onGrade: controller.grade,
                    ),
                ],
              ),
          },
        ),
      ),
    );
  }
}

class _CheckBanner extends StatelessWidget {
  const _CheckBanner({required this.check, required this.typed});

  final AnswerCheck check;
  final String typed;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final (icon, color, label) = switch (check.verdict) {
      AnswerVerdict.correct => (Icons.check_circle, Colors.green, 'Helyes'),
      AnswerVerdict.almost => (Icons.adjust, Colors.orange, 'Majdnem'),
      AnswerVerdict.wrong => (Icons.cancel, scheme.error, 'Hibás'),
    };
    return Semantics(
      liveRegion: true,
      child: Padding(
        padding: const EdgeInsets.only(bottom: 12),
        child: Row(
          children: [
            Icon(icon, color: color),
            const SizedBox(width: 8),
            Expanded(child: Text('$label: „$typed”${check.hint != null ? ' – ${check.hint}' : ''}')),
          ],
        ),
      ),
    );
  }
}

class _GradeButtons extends StatelessWidget {
  const _GradeButtons({required this.preview, required this.enabled, required this.onGrade, this.suggested});

  final Map<int, Duration> preview;
  final bool enabled;
  final ValueChanged<int> onGrade;

  /// A gépelt válasz alapján javasolt értékelés (kiemelve jelenik meg).
  final int? suggested;

  static const _options = [(1, 'Nem tudtam'), (3, 'Nehéz'), (4, 'Jó'), (5, 'Könnyű')];

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        for (final (grade, label) in _options)
          Expanded(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 4),
              child: Semantics(
                button: true,
                label: preview[grade] == null
                    ? 'Értékelés: $label'
                    : 'Értékelés: $label, következő ismétlés ${formatInterval(preview[grade]!)} múlva',
                excludeSemantics: true,
                child: _button(
                  context,
                  highlighted: grade == suggested,
                  onPressed: enabled ? () => onGrade(grade) : null,
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(label, textAlign: TextAlign.center),
                      if (preview[grade] != null)
                        Text(formatInterval(preview[grade]!), style: Theme.of(context).textTheme.labelSmall),
                    ],
                  ),
                ),
              ),
            ),
          ),
      ],
    );
  }

  static Widget _button(BuildContext context, {required bool highlighted, required VoidCallback? onPressed, required Widget child}) =>
      highlighted ? FilledButton.tonal(onPressed: onPressed, child: child) : OutlinedButton(onPressed: onPressed, child: child);
}

/// „1 perc”, „10 perc”, „4 nap”, „2 hónap”.
String formatInterval(Duration d) {
  if (d.inMinutes < 60) return '${d.inMinutes.clamp(1, 59)} perc';
  if (d.inHours < 24) return '${d.inHours} óra';
  if (d.inDays < 31) return '${d.inDays} nap';
  if (d.inDays < 365) return '${(d.inDays / 30).round()} hónap';
  return '${(d.inDays / 365).toStringAsFixed(1)} év';
}

class _Finished extends StatelessWidget {
  const _Finished({required this.reviewed, required this.correct});

  final int reviewed;
  final int correct;

  @override
  Widget build(BuildContext context) {
    final accuracy = reviewed == 0 ? 0 : (correct * 100 / reviewed).round();
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.check_circle_outline, size: 64),
          const SizedBox(height: 16),
          Text('Mára végeztél!', style: Theme.of(context).textTheme.headlineSmall),
          const SizedBox(height: 8),
          Text(reviewed == 0 ? 'Nincs esedékes kártya.' : '$reviewed értékelés, $accuracy% helyes'),
          const SizedBox(height: 24),
          FilledButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Vissza')),
        ],
      ),
    );
  }
}
