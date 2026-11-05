import 'package:flutter/material.dart';

import '../../domain/article_table.dart';

/// Kiemelő zöld (világos és sötét témában is olvasható).
Color articleHighlightColor(BuildContext context) =>
    Theme.of(context).brightness == Brightness.dark ? Colors.green.shade300 : Colors.green.shade800;

Color _highlightBackground(BuildContext context) =>
    Theme.of(context).brightness == Brightness.dark ? Colors.green.withValues(alpha: 0.25) : Colors.green.shade50;

/// A példamondat, benne a névelő (einen, zum …) zölden, vastagon kiemelve.
class HighlightedSentence extends StatelessWidget {
  const HighlightedSentence({super.key, required this.sentence, required this.form, this.style});

  final String sentence;
  final String? form;
  final TextStyle? style;

  @override
  Widget build(BuildContext context) {
    final form = this.form;
    final match = form == null ? null : _findWord(sentence, form);
    if (form == null || match == null) return Text(sentence, style: style);
    final highlight = TextStyle(fontWeight: FontWeight.bold, color: articleHighlightColor(context));
    return Text.rich(
      TextSpan(
        style: style,
        children: [
          TextSpan(text: sentence.substring(0, match)),
          TextSpan(text: form, style: highlight),
          TextSpan(text: sentence.substring(match + form.length)),
        ],
      ),
    );
  }
}

/// Az első egész szavas előfordulás kezdete (a „die” ne találjon a „dieser”-ben).
int? _findWord(String sentence, String word) {
  final pattern = RegExp('(?<![\\p{L}])${RegExp.escape(word)}(?![\\p{L}])', unicode: true);
  return pattern.firstMatch(sentence)?.start;
}

/// Névelőtáblázat a példamondat alatt: négy eset × három nem + többes szám,
/// a mondatbeli névelő fajtájának alakjaival. Zölden, vastagon kiemelve a cella,
/// amelyből a mondat névelője származik, és az oszlop fejléce (a főnév névelője,
/// pl. der) – így látszik, hogy a der-ből lett az ein**en**.
class ArticleTableView extends StatelessWidget {
  const ArticleTableView({super.key, required this.article, required this.gender, required this.lemma});

  final ExampleArticle article;

  /// A főnév nemének oszlopa; null, ha csak többes számú.
  final ArticleColumn? gender;
  final String lemma;

  @override
  Widget build(BuildContext context) {
    final column = article.column(gender);
    if (column == null) return const SizedBox.shrink();
    final theme = Theme.of(context);
    final green = articleHighlightColor(context);
    final small = theme.textTheme.bodySmall;
    final border = BorderSide(color: theme.dividerColor);

    Widget pad(Widget child, {Color? background, Key? key}) => Container(
          key: key,
          color: background,
          padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 3),
          alignment: Alignment.center,
          child: child,
        );

    final header = TableRow(
      children: [
        pad(const SizedBox.shrink()),
        for (final c in ArticleColumn.values)
          pad(
            Text(
              '${c.nameHu}\n${c.definite}',
              textAlign: TextAlign.center,
              style: c == column
                  ? small?.copyWith(fontWeight: FontWeight.bold, color: green)
                  : small?.copyWith(color: theme.colorScheme.onSurfaceVariant),
            ),
          ),
      ],
    );

    TableRow row(ArticleCase c) => TableRow(
          children: [
            pad(Text(c.abbreviation, style: small?.copyWith(fontWeight: FontWeight.w600))),
            for (final col in ArticleColumn.values) _cell(context, c, col, isTarget: c == article.grammaticalCase && col == column, pad: pad),
          ],
        );

    return Column(
      key: const Key('articleTable'),
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(_explanation(column), key: const Key('articleExplanation'), style: small),
        const SizedBox(height: 4),
        Table(
          border: TableBorder(
            top: border,
            bottom: border,
            left: border,
            right: border,
            horizontalInside: border,
            verticalInside: border,
          ),
          columnWidths: const {0: IntrinsicColumnWidth()},
          defaultVerticalAlignment: TableCellVerticalAlignment.middle,
          children: [header, for (final c in ArticleCase.values) row(c)],
        ),
      ],
    );
  }

  Widget _cell(
    BuildContext context,
    ArticleCase c,
    ArticleColumn col, {
    required bool isTarget,
    required Widget Function(Widget child, {Color? background, Key? key}) pad,
  }) {
    final small = Theme.of(context).textTheme.bodySmall;
    final form = article.cell(c, col);
    if (form == null) return pad(Text('—', style: small));
    final green = articleHighlightColor(context);
    final base = isTarget ? small?.copyWith(fontWeight: FontWeight.bold, color: green) : small;
    // A végződés (ein-en) külön kiemelve, hogy látszódjon, mi változott.
    final ending = form.ending.isEmpty ? null : (isTarget ? base : base?.copyWith(fontWeight: FontWeight.w600));
    return pad(
      Text.rich(
        TextSpan(
          style: base,
          children: [
            TextSpan(text: form.stem),
            if (ending != null) TextSpan(text: form.ending, style: ending.copyWith(decoration: isTarget ? TextDecoration.underline : null)),
          ],
        ),
      ),
      background: isTarget ? _highlightBackground(context) : null,
      key: isTarget ? const Key('articleHighlight') : null,
    );
  }

  /// Pl. „Wein: der (hímnem) → tárgyeset, határozatlan névelő: ein + en = einen”.
  String _explanation(ArticleColumn column) {
    final source = column == ArticleColumn.plural ? 'többes szám (die)' : '${column.definite} (${column.nameHu})';
    final form = article.cell(article.grammaticalCase, column);
    final contraction = article.contraction;
    final buffer = StringBuffer('$lemma: $source → ${article.grammaticalCase.nameHu}, ${article.type.nameHu}');
    if (form != null) {
      buffer.write(': ');
      buffer.write(form.ending.isEmpty ? form.text : '${form.stem} + ${form.ending} = ${form.text}');
    }
    if (contraction != null) buffer.write(' (${article.form} = ${contraction.$1} + ${contraction.$2})');
    return buffer.toString();
  }
}
