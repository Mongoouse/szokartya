import 'dart:convert';

import '../../core/api/api_client.dart';
import '../local/local_store.dart';
import '../models/user_settings.dart';
import 'auth_repository.dart';

/// A szerveroldali felhasználói beállítások módosítása és az adatexport.
class SettingsRepository {
  SettingsRepository({required this._api, required this._store});

  final ApiClient _api;
  final LocalStore _store;

  /// `PATCH /users/me` – csak a megadott mezők változnak.
  ///
  /// Ha a szinkronizált katalógusszintek változnak, a pull-kurzor törlődik:
  /// a következő szinkron a teljes (új szűrésű) katalógust hozza le.
  /// @returns a frissített profil és hogy kell-e teljes újraszinkron.
  Future<({UserProfile profile, bool resyncNeeded})> update({
    required UserProfile current,
    String? displayName,
    String? timezone,
    int? dailyNewCardsLimit,
    int? dailyReviewLimit,
    double? targetRetention,
    List<String>? catalogLevels,
  }) async {
    final json = await _api.patch('/users/me', body: {
      'displayName': ?displayName,
      'timezone': ?timezone,
      'dailyNewCardsLimit': ?dailyNewCardsLimit,
      'dailyReviewLimit': ?dailyReviewLimit,
      'targetRetention': ?targetRetention,
      'catalogLevels': ?catalogLevels,
    });
    final profile = UserProfile.fromJson(json);
    await _store.setState(profileStateKey, profile.encode());
    final resyncNeeded = catalogLevels != null && !_sameSet(catalogLevels, current.catalogLevels);
    if (resyncNeeded) await _store.resetSyncCursor();
    return (profile: profile, resyncNeeded: resyncNeeded);
  }

  /// A felhasználó összes adata JSON-ként (GDPR adathordozhatóság).
  Future<String> exportJson() async {
    final json = await _api.get('/users/me/export');
    return const JsonEncoder.withIndent('  ').convert(json);
  }

  static bool _sameSet(List<String> a, List<String> b) => a.toSet().containsAll(b) && b.toSet().containsAll(a);
}
