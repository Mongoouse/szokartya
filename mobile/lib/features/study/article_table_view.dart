import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';

import '../../domain/article_table.dart';

/// Kiemelő zöld (világos és sötét témában is olvasható).
Color articleHighlightColor(BuildContext context) =>
    Theme.of(context).brightness == Brightness.dark ? Colors.green.shade300 : Colors.green.shade800;

/// A kiemelt sor és oszlop lágy háttere.
Color _softBackground(BuildContext context) =>
    Theme.of(context).brightness == Brightness.dark ? Colors.green.withValues(alpha: 0.14) : Colors.green.shade50;

/// A sor és az oszlop metszete: erősebb zöld.
Color _strongBackground(BuildContext context) =>
    Theme.of(context).brightness == Brightness.dark ? Colors.green.withValues(alpha: 0.4) : Colors.green.shade200;

/// A példamondat, benne a névelő (einen, zum …) zölden, vastagon kiemelve.
class HighlightedSentence extends StatelessWidget {
  const HighlightedSentence({super.key, required this.sentence, required this.form, this.style, this.textAlign});

  final String sentence;
  final String? form;
  final TextStyle? style;
  final TextAlign? textAlign;

  @override
  Widget build(BuildContext context) {
    final form = this.form;
    final match = form == null ? null : _findWord(sentence, form);
    if (form == null || match == null) return Text(sentence, style: style, textAlign: textAlign);
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
      textAlign: textAlign,
    );
  }
}

/// Az első egész szavas előfordulás kezdete (a „die” ne találjon a „dieser”-ben).
int? _findWord(String sentence, String word) {
  final pattern = RegExp('(?<![\\p{L}])${RegExp.escape(word)}(?![\\p{L}])', unicode: true);
  return pattern.firstMatch(sentence)?.start;
}

/// Névelőtáblázat: négy eset × három nem + többes szám, a mondatbeli névelő
/// fajtájának alakjaival (der/ein/kein/mein …).
///
/// Kiemelés: a főnév nemének oszlopa és a mondat esetének sora lágy zöld
/// hátteret kap, a metszetük erősebb zöldet; a metszet alakja vastag zöld, a
/// megváltozott végződés (ein**en**) feketével, egyszeresen aláhúzva.
class ArticleTableView extends StatelessWidget {
  const ArticleTableView({
    super.key,
    required this.article,
    required this.gender,
    required this.lemma,
    this.compact = false,
  });

  final ExampleArticle article;

  /// Tömör (fekvő elrendezésű) változat: minden oszlop csak olyan széles, mint
  /// a tartalma, így a cellákban nincs sortörés, és a táblázat a lehető
  /// legkeskenyebb. A magyarázó szöveg nem szélesíti, hanem a táblázat
  /// szélességéhez tördelődik; ha a hely kevés, a táblázat arányosan kicsinyedik.
  final bool compact;

  /// A főnév nemének oszlopa; null, ha csak többes számú.
  final ArticleColumn? gender;
  final String lemma;

  @override
  Widget build(BuildContext context) {
    final column = article.column(gender);
    if (column == null) return const SizedBox.shrink();
    final theme = Theme.of(context);
    final small = theme.textTheme.bodySmall;
    final border = BorderSide(color: theme.dividerColor);
    final soft = _softBackground(context);

    // A cella a sor teljes magasságát kitölti, így a háttér egybefüggő sávot ad.
    Widget box(Widget child, {Color? background, Key? key}) => TableCell(
          verticalAlignment: TableCellVerticalAlignment.intrinsicHeight,
          child: Container(
            key: key,
            color: background,
            padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 4),
            alignment: Alignment.center,
            child: child,
          ),
        );

    final header = TableRow(
      children: [
        box(const SizedBox.shrink()),
        for (final c in ArticleColumn.values)
          box(
            Text(c.nameHu, textAlign: TextAlign.center, style: small?.copyWith(fontWeight: FontWeight.w600)),
            background: c == column ? soft : null,
          ),
      ],
    );

    TableRow row(ArticleCase c) {
      final inRow = c == article.grammaticalCase;
      return TableRow(
        children: [
          box(
            Text(c.label, style: small?.copyWith(fontWeight: FontWeight.w600)),
            background: inRow ? soft : null,
          ),
          for (final col in ArticleColumn.values)
            _cell(context, c, col, row: inRow, column: col == column, box: box),
        ],
      );
    }

    final contraction = article.contraction;
    return Column(
      key: const Key('articleTable'),
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _widthNeutral(Text(_explanation(column), key: const Key('articleExplanation'), style: small)),
        // Összevont alak (am, zum, ins …): az elöljáró vonzata is látszik.
        if (contraction != null)
          _widthNeutral(Text.rich(
            TextSpan(
              style: small,
              children: [
                const TextSpan(text: 'Rendhagyó: ', style: TextStyle(fontWeight: FontWeight.bold)),
                TextSpan(
                  text: '${article.form} = ${contraction.$1} + ${contraction.$2}, '
                      'vonzat: ${contraction.$1} + ${article.grammaticalCase.abbreviation}',
                ),
              ],
            ),
            key: const Key('articleIrregular'),
          )),
        const SizedBox(height: 4),
        _fit(Table(
          border: TableBorder(
            top: border,
            bottom: border,
            left: border,
            right: border,
            horizontalInside: border,
            verticalInside: border,
          ),
          columnWidths: const {0: IntrinsicColumnWidth()},
          defaultColumnWidth: compact ? const IntrinsicColumnWidth() : const FlexColumnWidth(),
          defaultVerticalAlignment: TableCellVerticalAlignment.middle,
          children: [header, for (final c in ArticleCase.values) row(c)],
        )),
      ],
    );
  }

  Widget _widthNeutral(Widget child) => compact ? _NoIntrinsicWidth(child: child) : child;

  Widget _fit(Widget table) =>
      compact ? FittedBox(fit: BoxFit.scaleDown, alignment: Alignment.topLeft, child: table) : table;

  Widget _cell(
    BuildContext context,
    ArticleCase c,
    ArticleColumn col, {
    required bool row,
    required bool column,
    required Widget Function(Widget child, {Color? background, Key? key}) box,
  }) {
    final small = Theme.of(context).textTheme.bodySmall;
    final target = row && column;
    final background = target ? _strongBackground(context) : (row || column ? _softBackground(context) : null);
    final form = article.cell(c, col);
    if (form == null) return box(Text('—', style: small), background: background);
    if (!target) return box(Text(form.text, style: small), background: background);
    final bold = small?.copyWith(fontWeight: FontWeight.bold, color: articleHighlightColor(context));
    final ending = small?.copyWith(
      fontWeight: FontWeight.bold,
      color: articleHighlightColor(context),
      decoration: TextDecoration.underline,
      decorationColor: Colors.black,
    );
    return box(
      Text.rich(
        TextSpan(
          style: bold,
          children: [
            TextSpan(text: form.stem),
            if (form.ending.isNotEmpty) TextSpan(text: form.ending, style: ending),
          ],
        ),
      ),
      background: background,
      key: const Key('articleHighlight'),
    );
  }

  /// Pl. „Wein: der (hímnem) → tárgyeset, határozatlan névelő: ein + en = einen”.
  String _explanation(ArticleColumn column) {
    final source = column == ArticleColumn.plural ? 'többes szám (die)' : '${column.definite} (${column.nameHu})';
    final form = article.cell(article.grammaticalCase, column);
    final buffer = StringBuffer('$lemma: $source → ${article.grammaticalCase.nameHu}, ${article.type.nameHu}');
    if (form != null) {
      buffer.write(': ');
      buffer.write(form.ending.isEmpty ? form.text : '${form.stem} + ${form.ending} = ${form.text}');
    }
    return buffer.toString();
  }
}

/// A gyermek tördelhető szövegét kizárja a szélességszámításból (intrinsic
/// width = 0): a tömör táblázat szélességét így csak maga a táblázat adja meg.
class _NoIntrinsicWidth extends SingleChildRenderObjectWidget {
  const _NoIntrinsicWidth({required Widget super.child});

  @override
  RenderObject createRenderObject(BuildContext context) => _RenderNoIntrinsicWidth();
}

class _RenderNoIntrinsicWidth extends RenderProxyBox {
  @override
  double computeMinIntrinsicWidth(double height) => 0;

  @override
  double computeMaxIntrinsicWidth(double height) => 0;
}
