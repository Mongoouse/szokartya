import 'package:flutter/foundation.dart' show kIsWeb;

/// Futtatási konfiguráció. Az értékek fordításkor adhatók meg:
///
/// ```sh
/// flutter run --dart-define=API_BASE_URL=https://api.szokartya.hu/api/v1
/// ```
///
/// Alapértelmezés:
///  - mobilon az Android emulátorról elérhető fejlesztői gép (10.0.2.2);
///  - böngészőben ugyanaz a gép (localhost) – a backend CORS_ORIGINS
///    beállításában ennek a webes originnek (pl. http://localhost:8080) kell szerepelnie.
class AppConfig {
  const AppConfig({required this.apiBaseUrl, this.requestTimeout = const Duration(seconds: 20)});

  factory AppConfig.fromEnvironment() {
    const defined = String.fromEnvironment('API_BASE_URL');
    return AppConfig(apiBaseUrl: defined.isNotEmpty ? defined : (kIsWeb ? webDefaultApiUrl : mobileDefaultApiUrl));
  }

  static const mobileDefaultApiUrl = 'http://10.0.2.2:3000/api/v1';
  static const webDefaultApiUrl = 'http://localhost:3000/api/v1';

  final String apiBaseUrl;
  final Duration requestTimeout;
}
