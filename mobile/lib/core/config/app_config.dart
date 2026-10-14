/// Futtatási konfiguráció. Az értékek fordításkor adhatók meg:
///
/// ```sh
/// flutter run --dart-define=API_BASE_URL=https://api.szokartya.hu/api/v1
/// ```
///
/// Alapértelmezés: az Android emulátorról elérhető fejlesztői gép (10.0.2.2).
class AppConfig {
  const AppConfig({required this.apiBaseUrl, this.requestTimeout = const Duration(seconds: 20)});

  factory AppConfig.fromEnvironment() => const AppConfig(
        apiBaseUrl: String.fromEnvironment('API_BASE_URL', defaultValue: 'http://10.0.2.2:3000/api/v1'),
      );

  final String apiBaseUrl;
  final Duration requestTimeout;
}
