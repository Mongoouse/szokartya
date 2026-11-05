import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/models/study_card.dart';
import '../../domain/answer_check.dart';
import '../../providers.dart';
import '../reports/report_dialog.dart';
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
    final progress = s.goal == null ? '${s.answered}. kártya' : 'Hátra: ${s.remaining} / ${s.goal}';
    final scope = widget.args.scope;
    return scope == null ? progress : '$progress · ${scope.title}';
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
                  if (session.error != null)
                    Text(session.error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
                  if (session.phase == StudyPhase.question)
                    ..._questionControls(card, saving: session.saving)
                  else ...[
                    _ResultBanner(check: session.check!, typed: session.typed ?? '', example: card.word.example),
                    FilledButton(
                      key: const Key('nextCard'),
                      focusNode: _nextFocus,
                      autofocus: true,
                      onPressed: _controller.next,
                      child: Text(session.remaining == 0 ? 'Lecke vége' : 'Tovább'),
                    ),
                  ],
                ],
              ),
          },
        ),
      ),
    );
  }

  /// Névelő kártyán három gomb, a többin beviteli mező; mindkettő mellett „Nem tudom”.
  List<Widget> _questionControls(StudyCard card, {required bool saving}) {
    void Function()? submitting(String? value) => saving ? null : () => _submit(value);

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
                    onPressed: submitting(article),
                    child: Text(article, style: const TextStyle(fontSize: 18)),
                  ),
                ),
              ),
          ],
        ),
        const SizedBox(height: 8),
        TextButton(key: const Key('dontKnow'), onPressed: submitting(''), child: const Text('Nem tudom')),
      ];
    }
    return [
      TextField(
        key: const Key('typedAnswer'),
        controller: _answer,
        focusNode: _answerFocus,
        autofocus: true,
        autocorrect: false,
        enableSuggestions: false,
        textInputAction: TextInputAction.done,
        onSubmitted: saving ? null : (_) => _submit(),
        decoration: InputDecoration(labelText: _inputLabel(card.cardType), border: const OutlineInputBorder()),
      ),
      const SizedBox(height: 12),
      Row(
        children: [
          Expanded(
            child: OutlinedButton(key: const Key('dontKnow'), onPressed: submitting(''), child: const Text('Nem tudom')),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: FilledButton(key: const Key('checkAnswer'), onPressed: submitting(null), child: const Text('Ellenőrzés')),
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

/// A válasz kiértékelése: Helyes / Majdnem / Helytelen, a begépelt válasszal és
/// rövid magyarázattal, alatta a szó példamondata fordítással. Az automatikus
/// értékelés (osztályzat, következő ismétlés) szándékosan nem látszik – csak naplózódik.
class _ResultBanner extends StatelessWidget {
  const _ResultBanner({required this.check, required this.typed, required this.example});

  final AnswerCheck check;
  final String typed;
  final ({String sentence, String? translation})? example;

  @override
  Widget build(BuildContext context) {
    final (icon, color, label) = switch (check.verdict) {
      AnswerVerdict.correct => (Icons.check_circle, Colors.green, 'Helyes'),
      AnswerVerdict.almost => (Icons.adjust, Colors.orange, 'Majdnem'),
      AnswerVerdict.wrong => (Icons.cancel, Theme.of(context).colorScheme.error, 'Helytelen'),
    };
    final answerText = typed.isEmpty ? '' : ': „$typed”';
    final hint = check.hint == null ? '' : ' – ${check.hint}';
    final example = this.example;
    final textTheme = Theme.of(context).textTheme;
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
                Expanded(child: Text('$label$answerText$hint')),
              ],
            ),
            if (example != null) ...[
              const SizedBox(height: 6),
              Text(example.sentence, key: const Key('exampleSentence'), style: textTheme.bodyMedium?.copyWith(fontStyle: FontStyle.italic)),
              if (example.translation != null) Text(example.translation!, style: textTheme.bodySmall),
            ],
          ],
        ),
      ),
    );
  }
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
    final title = switch ((answered, outOfCards && !endless)) {
      (0, _) => 'Nincs esedékes kártya',
      (_, true) => 'Mára elfogytak a kártyák',
      _ => 'Lecke vége!',
    };
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
