import 'package:flutter_test/flutter_test.dart';
import 'package:szokartya/domain/article_table.dart';

void main() {
  group('névelőtáblázat cellái', () {
    test('der → einen: hímnem, tárgyeset, határozatlan névelő', () {
      final cell = articleCell(ArticleCase.accusative, ArticleType.indefinite, ArticleColumn.masculine)!;
      expect(cell.stem, 'ein');
      expect(cell.ending, 'en');
      expect(cell.text, 'einen');
    });

    test('határozott névelő minden oszlopban', () {
      String def(ArticleCase c, ArticleColumn col) => articleCell(c, ArticleType.definite, col)!.text;
      expect(def(ArticleCase.nominative, ArticleColumn.masculine), 'der');
      expect(def(ArticleCase.dative, ArticleColumn.feminine), 'der');
      expect(def(ArticleCase.genitive, ArticleColumn.neuter), 'des');
      expect(def(ArticleCase.dative, ArticleColumn.plural), 'den');
    });

    test('ein többes számban nincs; kein és a birtokos névmások igen', () {
      expect(articleCell(ArticleCase.nominative, ArticleType.indefinite, ArticleColumn.plural), isNull);
      expect(articleCell(ArticleCase.dative, ArticleType.negative, ArticleColumn.plural)!.text, 'keinen');
      expect(articleCell(ArticleCase.genitive, ArticleType.possessive, ArticleColumn.feminine, possessiveStem: 'unser')!.text, 'unserer');
      expect(articleCell(ArticleCase.nominative, ArticleType.possessive, ArticleColumn.plural, possessiveStem: 'euer')!.text, 'eure');
    });
  });

  group('ExampleArticle', () {
    test('beolvasás a szerver JSON-jából', () {
      final a = ExampleArticle.fromJson({'case': 'ACCUSATIVE', 'type': 'POSSESSIVE', 'number': 'SINGULAR', 'form': 'Meinen'})!;
      expect(a.grammaticalCase, ArticleCase.accusative);
      expect(a.type, ArticleType.possessive);
      expect(a.plural, isFalse);
      expect(a.possessiveStem, 'mein');
      expect(a.cell(ArticleCase.accusative, ArticleColumn.masculine)!.text, 'meinen');
      expect(a.column(ArticleColumn.masculine), ArticleColumn.masculine);
    });

    test('többes számban a többes oszlop; összevont alak felbontása', () {
      final a = ExampleArticle.fromJson({'case': 'DATIVE', 'type': 'DEFINITE', 'number': 'PLURAL', 'form': 'den'})!;
      expect(a.column(ArticleColumn.feminine), ArticleColumn.plural);
      final zum = ExampleArticle.fromJson({'case': 'DATIVE', 'type': 'DEFINITE', 'number': 'SINGULAR', 'form': 'Zum'})!;
      expect(zum.contraction, ('zu', 'dem'));
    });

    test('hiányzó vagy ismeretlen érték: null (nincs táblázat)', () {
      expect(ExampleArticle.fromJson(null), isNull);
      expect(ExampleArticle.fromJson({'case': 'VOCATIVE', 'type': 'DEFINITE', 'number': 'SINGULAR', 'form': 'der'}), isNull);
      expect(ExampleArticle.fromJson({'case': 'DATIVE', 'type': 'DEFINITE', 'number': 'DUAL', 'form': 'dem'}), isNull);
    });
  });
}
