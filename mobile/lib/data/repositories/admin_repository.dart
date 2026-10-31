import '../../core/api/api_client.dart';
import '../models/word.dart';

/// Egy központi szó az admin nézetben: a teljes adatlap + ellenőrzési adatok.
class AdminWord {
  AdminWord(this.json) : word = Word.fromJson(json);

  final Json json;
  final Word word;

  /// UNREVIEWED / VERIFIED / REJECTED.
  String get reviewStatus => json['reviewStatus'] as String;
  String? get reviewedBy => json['reviewedBy'] as String?;
  int get openReports => (json['openReports'] as num?)?.toInt() ?? 0;
  int get version => (json['version'] as num).toInt();
}

class AdminReport {
  AdminReport(this.json) : word = AdminWord((json['word'] as Map).cast<String, dynamic>());

  final Json json;
  final AdminWord word;

  String get id => json['id'] as String;
  String get category => json['category'] as String;
  String get message => json['message'] as String;
  String get status => json['status'] as String;
  String? get cardType => json['cardType'] as String?;
  String? get adminNote => json['adminNote'] as String?;
  String get reporterEmail => ((json['reporter'] as Map?)?['email'] as String?) ?? '';
  DateTime get receivedAt => DateTime.parse(json['receivedAt'] as String);
}

class AdminSummary {
  const AdminSummary({required this.words, required this.reports, required this.avgResolutionHours});

  factory AdminSummary.fromJson(Json json) => AdminSummary(
        words: _counts(json['words']),
        reports: _counts(json['reports']),
        avgResolutionHours: (json['avgResolutionHours'] as num?)?.toDouble(),
      );

  final Map<String, int> words;
  final Map<String, int> reports;
  final double? avgResolutionHours;

  int get unreviewed => words['UNREVIEWED'] ?? 0;
  int get verified => words['VERIFIED'] ?? 0;
  int get rejected => words['REJECTED'] ?? 0;
  int get openReports => reports['OPEN'] ?? 0;

  static Map<String, int> _counts(Object? v) =>
      ((v as Map?) ?? const {}).map((k, n) => MapEntry(k as String, (n as num).toInt()));
}

/// Az admin végpontok (`/admin/*`) kliense. Csak online működik: az ellenőrzés
/// a központi adatbázist módosítja, amit a felhasználók a szinkronnal kapnak meg.
class AdminRepository {
  AdminRepository({required this._api});

  final ApiClient _api;

  Future<AdminSummary> summary() async => AdminSummary.fromJson(await _api.get('/admin/summary'));

  Future<({List<AdminWord> items, int total})> words({
    String? status,
    String query = '',
    bool hasOpenReports = false,
    int limit = 50,
    int offset = 0,
  }) async {
    final json = await _api.get('/admin/words', query: {
      'status': ?status,
      if (query.trim().isNotEmpty) 'q': query.trim(),
      if (hasOpenReports) 'hasOpenReports': 'true',
      'limit': '$limit',
      'offset': '$offset',
    });
    return (
      items: (json['items'] as List).cast<Json>().map(AdminWord.new).toList(),
      total: (json['total'] as num).toInt(),
    );
  }

  /// Státusz és/vagy a magyar jelentések teljes listája. Az [expectedVersion]
  /// védi a párhuzamos módosítást (409 → újra kell tölteni).
  Future<AdminWord> updateWord(String id, {String? reviewStatus, List<String>? translations, int? expectedVersion}) async =>
      AdminWord(await _api.patch('/admin/words/$id', body: {
        'reviewStatus': ?reviewStatus,
        'translations': ?translations,
        'expectedVersion': ?expectedVersion,
      }));

  Future<({List<AdminReport> items, int total})> reports({String? status = 'OPEN', int limit = 50, int offset = 0}) async {
    final json = await _api.get('/admin/reports', query: {'status': ?status, 'limit': '$limit', 'offset': '$offset'});
    return (
      items: (json['items'] as List).cast<Json>().map(AdminReport.new).toList(),
      total: (json['total'] as num).toInt(),
    );
  }

  Future<AdminReport> updateReport(String id, {required String status, String? adminNote}) async =>
      AdminReport(await _api.patch('/admin/reports/$id', body: {
        'status': status,
        if (adminNote != null && adminNote.trim().isNotEmpty) 'adminNote': adminNote.trim(),
      }));
}
