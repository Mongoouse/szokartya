import 'package:flutter/material.dart';

import '../../data/models/study_card.dart';
import '../../data/models/word.dart';
import '../../domain/card_answer.dart';
import 'article_table_view.dart';

/// Egy kártya elő- vagy hátlapja a kártyatípus szerint.
///
/// - RECOGNITION: német → magyar
/// - PRODUCTION:  magyar → német
/// - GENDER:      „___ Tisch” → der / die / das
/// - PLURAL:      „der Tisch” → die Tische
/// - VERB_FORMS:  „fahren” → fährt – fuhr – ist gefahren
/// - VALENCY:     „warten ___” → warten auf + Akk.
class FlashcardView extends StatelessWidget {
  const FlashcardView({
    super.key,
    required this.card,
    required this.showAnswer,
    this.onSpeak,
    this.showExample = true,
    this.dense = false,
  });

  final StudyCard card;
  final bool showAnswer;

  /// A példamondat a hátlapon. Fekvő elrendezésben false: ott a kiértékelés
  /// alatt, a kártyán kívül jelenik meg ([ExampleSentenceView]).
  final bool showExample;

  /// Tömörebb kártya (fekvő elrendezés, alacsony kijelző): kisebb térközök, a
  /// kiejtés gomb a kérdés címkéje mellett, hogy alatta a kiértékelés és a
  /// példamondat görgetés nélkül is látsszon.
  final bool dense;

  /// A német alak felolvasása; null = nincs kiejtés gomb.
  final VoidCallback? onSpeak;

  /// A kiejtés gomb csak a válasz után látszik: az előlapon a felhasználó
  /// gépelve válaszol, a hangszóró ne tűnjön válaszadási lehetőségnek.
  bool get _speakVisible => showAnswer;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final word = card.word;
    return Card(
      elevation: 2,
      child: Padding(
        padding: EdgeInsets.all(dense ? 12 : 24),
        child: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (dense)
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Text(_typeLabel, style: theme.textTheme.labelMedium),
                    if (onSpeak != null && _speakVisible)
                      IconButton(
                        icon: const Icon(Icons.volume_up),
                        tooltip: 'Kiejtés',
                        visualDensity: VisualDensity.compact,
                        onPressed: onSpeak,
                      )
                    else
                      const SizedBox(height: 40),
                  ],
                )
              else ...[
                Text(_typeLabel, style: theme.textTheme.labelMedium, textAlign: TextAlign.center),
                if (onSpeak != null && _speakVisible)
                  Align(
                    child: IconButton(
                      icon: const Icon(Icons.volume_up),
                      tooltip: 'Kiejtés',
                      onPressed: onSpeak,
                    ),
                  )
                else
                  const SizedBox(height: 16),
              ],
              Text(
                _prompt(word),
                style: dense ? theme.textTheme.headlineSmall : theme.textTheme.headlineMedium,
                textAlign: TextAlign.center,
              ),
              if (card.cardType == CardType.recognition && word.ipa != null) ...[
                const SizedBox(height: 4),
                Text('[${word.ipa}]', style: theme.textTheme.bodyMedium, textAlign: TextAlign.center),
              ],
              if (showAnswer) ...[
                Divider(height: dense ? 16 : 32),
                Text(
                  expectedAnswer(card),
                  style: (dense ? theme.textTheme.titleLarge : theme.textTheme.headlineSmall)
                      ?.copyWith(color: theme.colorScheme.primary),
                  textAlign: TextAlign.center,
                ),
                SizedBox(height: dense ? 4 : 16),
                ..._grammar(word, theme),
              ],
            ],
          ),
        ),
      ),
    );
  }

  String get _typeLabel => switch (card.cardType) {
        CardType.recognition => 'Mit jelent?',
        CardType.production => 'Hogy mondod németül?',
        CardType.gender => 'Melyik névelő?',
        CardType.plural => 'Mi a többes száma?',
        CardType.verbForms => 'Mik az alapalakjai?',
        CardType.valency => 'Milyen vonzata van?',
      };

  String _prompt(Word w) => switch (card.cardType) {
        CardType.recognition || CardType.plural || CardType.verbForms => w.display,
        CardType.production => w.primaryTranslation,
        CardType.gender => '___ ${w.lemma}\n(${w.primaryTranslation})',
        CardType.valency => '${w.display} ___',
      };


  List<Widget> _grammar(Word w, ThemeData theme) {
    final type = card.cardType;
    final lines = <String>[
      if (type == CardType.gender) w.display,
      if (type != CardType.recognition && type != CardType.production && type != CardType.gender) w.primaryTranslation,
      if (type != CardType.verbForms && w.verbForms != null) w.verbForms!,
      if (w.comparison != null) w.comparison!,
      for (final v in w.valencies)
        if (type != CardType.valency || v.meaning != null)
          type == CardType.valency ? '${v.pattern} – ${v.meaning}' : '${v.pattern}${v.meaning != null ? ' – ${v.meaning}' : ''}',
    ];
    final example = w.example;
    final style = theme.textTheme.bodyLarge;
    return [
      for (final line in lines) Text(line, style: style, textAlign: TextAlign.center),
      // A példamondat (a névelő kiemelve) a többes szám sora helyén; a névelőtáblázat
      // a kártya alatt, a kiértékelésnél látszik (study_screen).
      if (example != null && showExample) ...[
        const SizedBox(height: 12),
        ExampleSentenceView(example: example),
      ],
      if (type != CardType.plural && w.pluralForm != null && w.article != null) ...[
        SizedBox(height: dense ? 4 : 12),
        Text('Többes szám: die ${w.pluralForm}', style: theme.textTheme.bodyMedium, textAlign: TextAlign.center),
      ],
    ];
  }
}

/// A példamondat (a névelő kiemelve) és a fordítása, középre igazítva.
class ExampleSentenceView extends StatelessWidget {
  const ExampleSentenceView({super.key, required this.example});

  final Example example;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        HighlightedSentence(
          key: const Key('exampleSentence'),
          sentence: example.sentence,
          form: example.article?.form,
          style: theme.textTheme.bodyLarge?.copyWith(fontStyle: FontStyle.italic),
          textAlign: TextAlign.center,
        ),
        if (example.translation != null)
          Text(example.translation!, style: theme.textTheme.bodyMedium, textAlign: TextAlign.center),
      ],
    );
  }
}
