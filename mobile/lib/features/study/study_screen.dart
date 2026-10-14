import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'flashcard_view.dart';
import 'study_session_controller.dart';

class StudyScreen extends ConsumerWidget {
  const StudyScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final session = ref.watch(studySessionProvider);
    final controller = ref.read(studySessionProvider.notifier);

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
                      onTap: controller.reveal,
                      child: AnimatedSwitcher(
                        duration: const Duration(milliseconds: 200),
                        child: FlashcardView(
                          key: ValueKey('${session.current!.id}-${session.phase}'),
                          card: session.current!,
                          showAnswer: session.phase == StudyPhase.answer,
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),
                  if (session.error != null)
                    Text(session.error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
                  if (session.phase == StudyPhase.question)
                    FilledButton(onPressed: controller.reveal, child: const Text('Mutasd a választ'))
                  else
                    _GradeButtons(
                      preview: session.preview,
                      enabled: !session.saving,
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

class _GradeButtons extends StatelessWidget {
  const _GradeButtons({required this.preview, required this.enabled, required this.onGrade});

  final Map<int, Duration> preview;
  final bool enabled;
  final ValueChanged<int> onGrade;

  static const _options = [(1, 'Nem tudtam'), (3, 'Nehéz'), (4, 'Jó'), (5, 'Könnyű')];

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        for (final (grade, label) in _options)
          Expanded(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 4),
              child: OutlinedButton(
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
      ],
    );
  }
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
