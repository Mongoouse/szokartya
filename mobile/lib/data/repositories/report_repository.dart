import 'package:uuid/uuid.dart';

import '../../core/api/api_client.dart';
import '../../core/time/clock.dart';
import '../local/local_store.dart';
import '../models/study_card.dart';

/// A hibabejelentés típusa (a szerver `ReportCategory` enumja).
enum ReportCategory {
  translation('TRANSLATION', 'Rossz jelentés'),
  grammar('GRAMMAR', 'Nyelvtan (névelő, alak, vonzat)'),
  spelling('SPELLING', 'Elírás'),
  other('OTHER', 'Egyéb');

  const ReportCategory(this.wire, this.label);

  final String wire;
  final String label;

  static ReportCategory parse(String v) => values.firstWhere((c) => c.wire == v, orElse: () => other);
}

/// Egy saját bejelentés állapota, ahogy a szerver visszaadja (`GET /reports/mine`).
class MyReport {
  const MyReport({
    required this.id,
    required this.word,
    required this.category,
    required this.message,
    required this.status,
    required this.createdAt,
    this.adminNote,
  });

  factory MyReport.fromJson(Json json) => MyReport(
        id: json['id'] as String,
        word: json['word'] as String? ?? '',
        category: ReportCategory.parse(json['category'] as String? ?? 'OTHER'),
        message: json['message'] as String,
        status: json['status'] as String,
        createdAt: DateTime.parse(json['createdAt'] as String),
        adminNote: json['adminNote'] as String?,
      );

  final String id;
  final String word;
  final ReportCategory category;
  final String message;

  /// OPEN / RESOLVED / DISMISSED.
  final String status;
  final DateTime createdAt;
  final String? adminNote;

  String get statusLabel => switch (status) {
        'RESOLVED' => 'Javítva',
        'DISMISSED' => 'Nem hiba',
        _ => 'Feldolgozás alatt',
      };
}

/// Felhasználói hibabejelentések: rögzítés offline (kimenő sorba), a saját
/// bejelentések állapotának lekérése online.
class ReportRepository {
  ReportRepository({required this._store, required this._api, required this._clock});

  final LocalStore _store;
  final ApiClient _api;
  final Clock _clock;

  static const maxMessageLength = 1000;

  /// A bejelentés helyben rögzül, és a következő szinkronnal kerül fel
  /// (nincs hálózat → nem vész el). @returns a bejelentés azonosítója.
  Future<String> report({
    required String wordId,
    required ReportCategory category,
    required String message,
    CardType? cardType,
  }) async {
    final text = message.trim();
    if (text.isEmpty) throw ArgumentError.value(message, 'message', 'üres');
    if (text.length > maxMessageLength) throw ArgumentError.value(message, 'message', 'túl hosszú');
    final id = const Uuid().v4();
    await _store.recordReport(
      id: id,
      wordId: wordId,
      cardType: cardType,
      category: category.wire,
      message: text,
      now: _clock.now(),
    );
    return id;
  }

  /// A saját, már feltöltött bejelentések (online).
  Future<List<MyReport>> mine() async {
    final json = await _api.getList('/reports/mine');
    return json.map(MyReport.fromJson).toList();
  }
}
