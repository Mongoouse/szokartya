import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/models/study_card.dart';
import '../../domain/answer_check.dart';
import '../../domain/card_answer.dart';
import '../../providers.dart';
import '../reports/report_dialog.dart';
import 'accent_bar.dart';
import 'flashcard_view.dart';
import 'study_session_controller.dart';

class StudyScreen extends ConsumerStatefulWidget {
  const StudyScreen({super.key, this.args = const StudySessionArgs()});

  final StudySessionArgs args;

  @override
  ConsumerState<StudyScreen> createState() => _StudyScreenState();
}

class _StudyScreenState extends ConsumerState<StudyScreen> {
  final _answer = TextEditingController();
  final _answerFocus = FocusNode();
  final _nextFocus = FocusNode();

  StudySessionController get _controller => ref.read(studySessionProvider(widget.args).notifier);

  @override
  void dispose() {
    _answer.dispose();
    _answerFocus.dispose();
    _nextFocus.dispose();
    super.dispose();
  }

  void _submit([String? value]) {
    final typed = value ?? _answer.text;
    _answer.clear();
    _controller.answer(typed);
  }

  String _title(StudySessionState s) {
    if (s.phase == StudyPhase.finished) return 'Kész';
    final topic = widget.args.topic?.nameHu;
    final progress = s.goal == null ? '${s.answered}. kártya' : 'Hátra: ${s.remaining} / ${s.goal}';
    return topic == null ? progress : '$progress · $topic';
  }

  @override
  Widget build(BuildContext context) {
    final session = ref.watch(studySessionProvider(widget.args));
    final card = session.current;

    // Válasz után a „Tovább” gomb kapja a fókuszt (Enterrel is tovább lehet lépni).
    ref.listen(studySessionProvider(widget.args).select((s) => s.phase), (_, phase) {
      if (phase == StudyPhase.answer) _nextFocus.requestFocus();
      if (phase == StudyPhase.question) _answerFocus.requestFocus();
    });

    return Scaffold(
      appBar: AppBar(
        title: Text(_title(session)),
        actions: [
          if (card != null && (session.phase == StudyPhase.question || session.phase == StudyPhase.answer))
            IconButton(
              key: const Key('reportWord'),
              tooltip: 'Hibát találtam',
              icon: const Icon(Icons.flag_outlined),
              onPressed: () => showReportDialog(context, ref, word: card.word, cardType: card.cardType),
            ),
        ],
      ),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: switch (session.phase) {
            StudyPhase.loading => const Center(child: CircularProgressIndicator()),
            StudyPhase.error => Center(child: Text(session.error ?? 'Ismeretlen hiba')),
            StudyPhase.finished => _Finished(
              answered: session.answered,
              correct: session.correct,
              outOfCards: session.outOfCards,
              endless: session.goal == null,
            ),
            StudyPhase.question || StudyPhase.answer => Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                if (session.goal != null)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: LinearProgressIndicator(value: session.answered / session.goal!),
                  ),
                Expanded(
                  child: AnimatedSwitcher(
                    duration: const Duration(milliseconds: 200),
                    child: FlashcardView(
                      key: ValueKey('${card!.id}-${session.answered}-${session.phase}'),
                      card: card,
                      showAnswer: session.phase == StudyPhase.answer,
                      onSpeak: () => ref.read(speakerProvider).speak(card.word.display),
                    ),
                  ),
                ),
                const SizedBox(height: 12),
                if (session.error != null) Text(session.error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
                if (session.phase == StudyPhase.question)
                  ..._questionControls(card, session.saving)
                else ...[
                  _ResultBanner(
                    check: session.check!,
                    typed: session.typed ?? '',
                    grade: session.grade!,
                    nextInterval: session.nextInterval,
                  ),
                  FilledButton(
                    key: const Key('nextCard'),
                    focusNode: _nextFocus,
                    autofocus: true,
                    onPressed: _controller.next,
                    child: Text(session.goal != null && session.remaining == 0 ? 'Lecke vége' : 'Tovább'),
                  ),
                ],
              ],
            ),
          },
        ),
      ),
    );
  }

  List<Widget> _questionControls(StudyCard card, bool saving) {
    if (card.cardType == CardType.gender) {
      return [
        Row(
          children: [
            for (final article in const ['der', 'die', 'das'])
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 4),
                  child: FilledButton.tonal(
                    key: Key('article-$article'),
                    onPressed: saving ? null : () => _submit(article),
                    child: Text(article, style: const TextStyle(fontSize: 18)),
                  ),
                ),
              ),
          ],
        ),
        const SizedBox(height: 8),
        TextButton(onPressed: saving ? null : () => _submit(''), child: const Text('Nem tudom')),
      ];
    }
    final german = card.cardType != CardType.recognition;
    return [
      TextField(
        key: const Key('typedAnswer'),
        controller: _answer,
        focusNode: _answerFocus,
        autofocus: true,
        autocorrect: false,
        enableSuggestions: false,
        keyboardType: TextInputType.text,
        textInputAction: TextInputAction.done,
        onSubmitted: saving ? null : (_) => _submit(),
        decoration: InputDecoration(labelText: _inputLabel(card.cardType), border: const OutlineInputBorder()),
      ),
      AccentBar(controller: _answer, focusNode: _answerFocus, letters: german ? germanLetters : hungarianLetters),
      Row(
        children: [
          Expanded(
            child: OutlinedButton(key: const Key('dontKnow'), onPressed: saving ? null : () => _submit(''), child: const Text('Nem tudom')),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: FilledButton(key: const Key('checkAnswer'), onPressed: saving ? null : _submit, child: const Text('Ellenőrzés')),
          ),
        ],
      ),
    ];
  }

  static String _inputLabel(CardType type) => switch (type) {
    CardType.recognition => 'Mit jelent magyarul?',
    CardType.production => 'Németül, névelővel (pl. der Tisch)',
    CardType.gender => 'Névelő',
    CardType.plural => 'Többes szám (pl. die Tische)',
    CardType.verbForms => 'Alapalakok (pl. fährt, fuhr, ist gefahren)',
    CardType.valency => 'Elöljáró + eset (pl. auf + Akk.)',
  };
}

class _ResultBanner extends StatelessWidget {
  const _ResultBanner({required this.check, required this.typed, required this.grade, this.nextInterval});

  final AnswerCheck check;
  final String typed;
  final int grade;
  final Duration? nextInterval;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final (icon, color, label) = switch (check.verdict) {
      AnswerVerdict.correct => (Icons.check_circle, Colors.green, 'Helyes'),
      AnswerVerdict.almost => (Icons.adjust, Colors.orange, 'Majdnem'),
      AnswerVerdict.wrong => (Icons.cancel, scheme.error, typed.isEmpty ? 'Nem tudtad' : 'Hibás'),
    };
    final answerText = typed.isEmpty ? '' : ': „$typed”';
    final next = nextInterval == null ? '' : ', újra ${formatInterval(nextInterval!)} múlva';
    return Semantics(
      liveRegion: true,
      child: Padding(
        padding: const EdgeInsets.only(bottom: 12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(icon, color: color),
                const SizedBox(width: 8),
                Expanded(child: Text('$label$answerText${check.hint != null ? ' – ${check.hint}' : ''}')),
              ],
            ),
            const SizedBox(height: 4),
            Text('Értékelés: ${gradeLabel(grade)}$next', style: Theme.of(context).textTheme.bodySmall),
          ],
        ),
      ),
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
  const _Finished({required this.answered, required this.correct, required this.outOfCards, required this.endless});

  final int answered;
  final int correct;
  final bool outOfCards;
  final bool endless;

  @override
  Widget build(BuildContext context) {
    final accuracy = answered == 0 ? 0 : (correct * 100 / answered).round();
    final title = answered == 0 ? 'Nincs esedékes kártya' : (outOfCards && !endless ? 'Mára elfogytak a kártyák' : 'Lecke vége!');
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.check_circle_outline, size: 64),
          const SizedBox(height: 16),
          Text(title, style: Theme.of(context).textTheme.headlineSmall, textAlign: TextAlign.center),
          const SizedBox(height: 8),
          if (answered > 0) Text('$answered válasz, $accuracy% helyes'),
          const SizedBox(height: 24),
          FilledButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Vissza')),
        ],
      ),
    );
  }
}
