import '../../core/api/api_client.dart';
import '../../core/api/token_store.dart';
import '../local/local_store.dart';
import '../models/user_settings.dart';

const profileStateKey = 'user.profile';

/// Hitelesítés: belépés, regisztráció, munkamenet visszaállítása, kilépés.
class AuthRepository {
  AuthRepository({required this._api, required this._tokens, required this._store});

  final ApiClient _api;
  final TokenStore _tokens;
  final LocalStore _store;

  Future<UserProfile> login({required String email, required String password, String? deviceId}) =>
      _authenticate('/auth/login', {'email': email, 'password': password, 'deviceId': ?deviceId});

  Future<UserProfile> register({
    required String email,
    required String password,
    String? displayName,
    String? deviceId,
  }) =>
      _authenticate('/auth/register', {
        'email': email,
        'password': password,
        if (displayName != null && displayName.isNotEmpty) 'displayName': displayName,
        'deviceId': ?deviceId,
      });

  /// Indításkor: van-e érvényesnek tűnő munkamenet. Hálózat nélkül is működik
  /// (a profil helyben gyorsítótárazott); a token érvényessége az első
  /// API-hívásnál derül ki.
  Future<UserProfile?> restoreSession() async {
    if (await _tokens.read() == null) return null;
    final cached = await _store.getState(profileStateKey);
    return cached == null ? null : UserProfile.decode(cached);
  }

  /// Kilépés: a szerveren visszavonja a munkamenetet (ha elérhető), és törli a
  /// helyi adatokat. A még fel nem töltött módosítások elvesznek – a hívó
  /// felelőssége előtte szinkronizálni (lásd AuthController.signOut).
  Future<void> logout() async {
    final tokens = await _tokens.read();
    if (tokens != null) {
      try {
        await _api.post('/auth/logout', body: {'refreshToken': tokens.refreshToken}, authenticated: false);
      } on Exception {
        // Offline kilépés: a refresh token a szerveren magától lejár.
      }
    }
    await _tokens.clear();
    await _store.wipe();
  }

  Future<UserProfile> _authenticate(String path, Json body) async {
    final json = await _api.post(path, body: body, authenticated: false);
    await _tokens.write(AuthTokens(
      accessToken: json['accessToken'] as String,
      refreshToken: json['refreshToken'] as String,
    ));
    final profile = UserProfile.fromJson(json['user'] as Json);
    // Más felhasználó helyi adatai nem keveredhetnek az újakkal.
    final previous = await _store.getState(profileStateKey);
    if (previous != null && UserProfile.decode(previous).id != profile.id) {
      await _store.wipe();
    }
    await _store.setState(profileStateKey, profile.encode());
    return profile;
  }
}
