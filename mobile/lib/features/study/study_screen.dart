import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/models/study_card.dart';
import '../../data/models/word.dart';
import '../../domain/answer_check.dart';
import '../../providers.dart';
import '../reports/report_dialog.dart';
import 'article_table_view.dart';
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
          // Fekvő telefonon a függőleges hely szűkös: kisebb felső/alsó margó.
          padding: MediaQuery.orientationOf(context) == Orientation.landscape
              ? const EdgeInsets.fromLTRB(16, 8, 16, 8)
              : const EdgeInsets.all(16),
          child: switch (session.phase) {
            StudyPhase.loading => const Center(child: CircularProgressIndicator()),
            StudyPhase.error => Center(child: Text(session.error ?? 'Ismeretlen hiba')),
            StudyPhase.finished => _Finished(
                answered: session.answered,
                correct: session.correct,
                outOfCards: session.outOfCards,
                endless: session.goal == null,
              ),
            StudyPhase.question || StudyPhase.answer => LayoutBuilder(
                builder: (context, constraints) => isLandscapeLayout(constraints)
                    ? _landscape(session, card!, constraints.maxWidth)
                    : _portrait(session, card!),
              ),
          },
        ),
      ),
    );
  }

  /// Fekvő elrendezés: széles és alacsony terület (elforgatott telefon, böngésző).
  static bool isLandscapeLayout(BoxConstraints c) => c.maxWidth > c.maxHeight && c.maxWidth >= 560;

  Widget? _progress(StudySessionState session) => session.goal == null
      ? null
      : Padding(
          padding: const EdgeInsets.only(bottom: 8),
          child: LinearProgressIndicator(value: session.answered / session.goal!),
        );

  Widget _flashcard(StudySessionState session, StudyCard card, {bool landscape = false}) => AnimatedSwitcher(
        duration: const Duration(milliseconds: 200),
        child: FlashcardView(
          key: ValueKey('${card.id}-${session.answered}-${session.phase}'),
          card: card,
          showAnswer: session.phase == StudyPhase.answer,
          showExample: !landscape,
          dense: landscape,
          onSpeak: () => ref.read(speakerProvider).speak(card.word.display),
        ),
      );

  List<Widget> _errorText(StudySessionState session) => [
        if (session.error != null)
          Text(session.error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
      ];

  Widget _nextButton(StudySessionState session) => FilledButton(
        key: const Key('nextCard'),
        focusNode: _nextFocus,
        autofocus: true,
        onPressed: _controller.next,
        child: Text(session.remaining == 0 ? 'Lecke vége' : 'Tovább'),
      );

  /// Álló elrendezés: a kártya, alatta közvetlenül az értékelés és a
  /// névelőtáblázat; kis kijelzőn együtt görgethető, a gombok lent maradnak.
  Widget _portrait(StudySessionState session, StudyCard card) {
    final progress = _progress(session);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        ?progress,
        Expanded(
          child: SingleChildScrollView(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                _flashcard(session, card),
                if (session.phase == StudyPhase.answer) ...[
                  const SizedBox(height: 12),
                  _ResultBanner(check: session.check!, typed: session.typed ?? '', word: card.word),
                ],
              ],
            ),
          ),
        ),
        const SizedBox(height: 12),
        ..._errorText(session),
        if (session.phase == StudyPhase.question)
          ..._questionControls(card, saving: session.saving)
        else
          _nextButton(session),
      ],
    );
  }

  /// Fekvő elrendezés.
  ///  - Kérdés: balra a kártya, mellette jobbra a válaszadás (mező / gombok).
  ///  - Válasz: balra a kártya, alatta a Helyes/Helytelen jelzés, alatta a
  ///    példamondat; jobbra a tömör névelőtáblázat (csak olyan széles, hogy a
  ///    cellákban ne legyen sortörés), alatta a Tovább gomb.
  Widget _landscape(StudySessionState session, StudyCard card, double width) {
    final progress = _progress(session);
    final answer = session.phase == StudyPhase.answer;
    final word = card.word;
    final example = word.example;
    final article = example?.article;

    final left = SingleChildScrollView(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _flashcard(session, card, landscape: true),
          if (answer) ...[
            const SizedBox(height: 8),
            _ResultBanner(check: session.check!, typed: session.typed ?? '', word: word, showTable: false),
            if (example != null) ExampleSentenceView(example: example),
          ],
        ],
      ),
    );

    final Widget right = answer
        ? ConstrainedBox(
            key: const Key('landscapeAnswerPanel'),
            constraints: BoxConstraints(minWidth: 200, maxWidth: width * 0.45),
            child: IntrinsicWidth(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Expanded(
                    child: SingleChildScrollView(
                      child: article == null
                          ? const SizedBox.shrink()
                          : ArticleTableView(
                              article: article,
                              gender: word.genderColumn,
                              lemma: word.lemma,
                              compact: true,
                            ),
                    ),
                  ),
                  const SizedBox(height: 12),
                  ..._errorText(session),
                  _nextButton(session),
                ],
              ),
            ),
          )
        : SizedBox(
            key: const Key('landscapeQuestionPanel'),
            width: width * 0.4,
            child: Center(
              child: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [..._errorText(session), ..._questionControls(card, saving: session.saving)],
                ),
              ),
            ),
          );

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        ?progress,
        Expanded(
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Expanded(child: left),
              const SizedBox(width: 16),
              right,
            ],
          ),
        ),
      ],
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
/// rövid magyarázattal; főnévnél alatta a névelőtáblázat (a példamondat a kártyán
/// van). Az automatikus értékelés (osztályzat, következő ismétlés) szándékosan
/// nem látszik – csak naplózódik.
class _ResultBanner extends StatelessWidget {
  const _ResultBanner({required this.check, required this.typed, required this.word, this.showTable = true});

  final AnswerCheck check;
  final String typed;
  final Word word;

  /// Fekvő elrendezésben a táblázat külön, jobb oldali oszlopban van.
  final bool showTable;

  @override
  Widget build(BuildContext context) {
    final (icon, color, label) = switch (check.verdict) {
      AnswerVerdict.correct => (Icons.check_circle, Colors.green, 'Helyes'),
      AnswerVerdict.almost => (Icons.adjust, Colors.orange, 'Majdnem'),
      AnswerVerdict.wrong => (Icons.cancel, Theme.of(context).colorScheme.error, 'Helytelen'),
    };
    final answerText = typed.isEmpty ? '' : ': „$typed”';
    final hint = check.hint == null ? '' : ' – ${check.hint}';
    final article = showTable ? word.example?.article : null;
    return Semantics(
      liveRegion: true,
      child: Padding(
        padding: EdgeInsets.only(bottom: showTable ? 12 : 4),
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
            // Főnévnél: honnan jön a kártyán lévő példamondat névelője (der → einen).
            if (article != null) ...[
              const SizedBox(height: 8),
              ArticleTableView(article: article, gender: word.genderColumn, lemma: word.lemma),
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
