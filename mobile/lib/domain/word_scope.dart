import 'topic_groups.dart';

/// Egy lecke szókészlete: mely szavak kártyái kerülhetnek a sorba.
///
/// - [TopicScope]: egy témakör-csoport szavai (bármely szinten);
/// - [LevelScope]: egy CEFR szint szavai (bármely témakörben).
///
/// A tároló (SQL) és a lecke sorának összeállítása ugyanazt a szabályt
/// alkalmazza minden szókészletre: előbb a ma esedékes kártyák, aztán az új
/// kártyák, és ha ez kevés, a szókészlet még fel nem vett szavaiból annyi,
/// amennyi a lecke kitöltéséhez kell.
sealed class WordScope {
  const WordScope();

  /// Megjelenítési név (a lecke címsorában).
  String get title;
}

final class TopicScope extends WordScope {
  const TopicScope(this.group);

  final TopicGroup group;

  @override
  String get title => group.nameHu;

  @override
  bool operator ==(Object other) => other is TopicScope && other.group.id == group.id;

  @override
  int get hashCode => Object.hash(TopicScope, group.id);
}

final class LevelScope extends WordScope {
  const LevelScope(this.level);

  /// CEFR szint, pl. „A2”.
  final String level;

  @override
  String get title => '$level szint';

  @override
  bool operator ==(Object other) => other is LevelScope && other.level == level;

  @override
  int get hashCode => Object.hash(LevelScope, level);
}
