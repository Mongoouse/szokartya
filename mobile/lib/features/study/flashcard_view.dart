import 'package:flutter/material.dart';

import '../../data/models/study_card.dart';
import '../../data/models/word.dart';

/// Egy kártya elő- vagy hátlapja a kártyatípus szerint.
///
/// - RECOGNITION: német → magyar
/// - PRODUCTION:  magyar → német
/// - GENDER:      „___ Tisch” → der / die / das
/// - PLURAL:      „der Tisch” → die Tische
/// - VERB_FORMS:  „fahren” → fährt – fuhr – ist gefahren
/// - VALENCY:     „warten ___” → warten auf + Akk.
class FlashcardView extends StatelessWidget {
  const FlashcardView({super.key, required this.card, required this.showAnswer, this.onSpeak});

  final StudyCard card;
  final bool showAnswer;

  /// A német alak felolvasása; null = nincs kiejtés gomb.
  final VoidCallback? onSpeak;

  /// A német alak látható-e (a felidézés kártyán csak a hátlapon).
  bool get _germanVisible => showAnswer || card.cardType != CardType.production;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final word = card.word;
    return Card(
      elevation: 2,
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(_typeLabel, style: theme.textTheme.labelMedium, textAlign: TextAlign.center),
              if (onSpeak != null && _germanVisible)
                Align(
                  child: IconButton(
                    icon: const Icon(Icons.volume_up),
                    tooltip: 'Kiejtés',
                    onPressed: onSpeak,
                  ),
                )
              else
                const SizedBox(height: 16),
              Text(_prompt(word), style: theme.textTheme.headlineMedium, textAlign: TextAlign.center),
              if (card.cardType == CardType.recognition && word.ipa != null) ...[
                const SizedBox(height: 4),
                Text('[${word.ipa}]', style: theme.textTheme.bodyMedium, textAlign: TextAlign.center),
              ],
              if (showAnswer) ...[
                const Divider(height: 32),
                Text(
                  _answer(word),
                  style: theme.textTheme.headlineSmall?.copyWith(color: theme.colorScheme.primary),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 16),
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
        CardType.gender => '___ ${w.lemma}',
        CardType.valency => '${w.display} ___',
      };

  String _answer(Word w) => switch (card.cardType) {
        CardType.recognition => w.translations.join(', '),
        CardType.production || CardType.gender => w.display,
        CardType.plural => w.pluralDisplay ?? '—',
        CardType.verbForms => w.verbForms ?? '—',
        CardType.valency => w.valencies.map((v) => v.pattern).join('\n'),
      };

  List<Widget> _grammar(Word w, ThemeData theme) {
    final type = card.cardType;
    final lines = <String>[
      if (type != CardType.recognition && type != CardType.production) w.primaryTranslation,
      if (type != CardType.plural && w.pluralForm != null && w.article != null) 'Többes szám: die ${w.pluralForm}',
      if (type != CardType.verbForms && w.verbForms != null) w.verbForms!,
      if (w.comparison != null) w.comparison!,
      for (final v in w.valencies)
        if (type != CardType.valency || v.meaning != null)
          type == CardType.valency ? '${v.pattern} – ${v.meaning}' : '${v.pattern}${v.meaning != null ? ' – ${v.meaning}' : ''}',
    ];
    final example = w.valencies.map((v) => v.example).whereType<String>().followedBy(w.examples.map((e) => e.sentence));
    return [
      for (final line in lines) Text(line, style: theme.textTheme.bodyLarge, textAlign: TextAlign.center),
      if (example.isNotEmpty) ...[
        const SizedBox(height: 12),
        Text(
          example.first,
          style: theme.textTheme.bodyMedium?.copyWith(fontStyle: FontStyle.italic),
          textAlign: TextAlign.center,
        ),
      ],
    ];
  }
}
