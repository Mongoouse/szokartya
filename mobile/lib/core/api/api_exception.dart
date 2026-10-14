/// Az API-réteg hibái. A felsőbb rétegek ezek alapján döntenek: hálózati
/// hibánál offline módban folytatható a munka, 401-nél újra be kell lépni.
sealed class ApiException implements Exception {
  const ApiException(this.message);

  final String message;

  @override
  String toString() => '$runtimeType: $message';
}

/// Nincs kapcsolat / időtúllépés – a művelet később újrapróbálható.
class NetworkException extends ApiException {
  const NetworkException(super.message);
}

/// A munkamenet lejárt és nem frissíthető – újra be kell jelentkezni.
class UnauthorizedException extends ApiException {
  const UnauthorizedException([super.message = 'A munkamenet lejárt, jelentkezz be újra.']);
}

/// A szerver hibával válaszolt (4xx / 5xx).
class HttpStatusException extends ApiException {
  const HttpStatusException(this.statusCode, super.message);

  final int statusCode;

  /// 5xx és 429: átmeneti hiba, újrapróbálható.
  bool get isRetryable => statusCode >= 500 || statusCode == 429;
}
