import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;

import '../config/app_config.dart';
import 'api_exception.dart';
import 'token_store.dart';

typedef Json = Map<String, dynamic>;

/// Alacsony szintű REST kliens.
///
/// Felelősségek:
///  - JSON kódolás / dekódolás, egységes hibatípusok ([ApiException]);
///  - Bearer token csatolása;
///  - 401 esetén egyszeri, automatikus tokenfrissítés és a kérés megismétlése.
///    Párhuzamos 401-ek egyetlen frissítésen osztoznak (single-flight), mert a
///    szerver refresh token rotációt használ: két egyidejű frissítés közül a
///    második újrafelhasználásnak minősülne, és kiléptetné a felhasználót.
class ApiClient {
  ApiClient({
    required this._config,
    required TokenStore tokenStore,
    http.Client? httpClient,
    this.onSessionExpired,
  })  : _tokens = tokenStore,
        _http = httpClient ?? http.Client();

  final AppConfig _config;
  final TokenStore _tokens;
  final http.Client _http;

  /// Akkor hívódik, ha a munkamenet nem frissíthető (a UI kiléptet).
  void Function()? onSessionExpired;

  Future<AuthTokens?>? _refreshInFlight;

  Future<Json> get(String path, {Map<String, String>? query}) => _send('GET', path, query: query);

  Future<Json> post(String path, {Object? body, bool authenticated = true}) =>
      _send('POST', path, body: body, authenticated: authenticated);

  Future<Json> patch(String path, {Object? body}) => _send('PATCH', path, body: body);

  Future<Json> delete(String path, {Object? body}) => _send('DELETE', path, body: body);

  Future<Json> _send(
    String method,
    String path, {
    Object? body,
    Map<String, String>? query,
    bool authenticated = true,
  }) async {
    var tokens = authenticated ? await _tokens.read() : null;
    if (authenticated && tokens == null) {
      throw const UnauthorizedException();
    }

    var response = await _raw(method, path, body: body, query: query, accessToken: tokens?.accessToken);
    if (authenticated && response.statusCode == HttpStatus.unauthorized) {
      tokens = await _refreshTokens(tokens!);
      if (tokens == null) {
        onSessionExpired?.call();
        throw const UnauthorizedException();
      }
      response = await _raw(method, path, body: body, query: query, accessToken: tokens.accessToken);
    }
    return _decode(response);
  }

  Future<http.Response> _raw(
    String method,
    String path, {
    Object? body,
    Map<String, String>? query,
    String? accessToken,
  }) async {
    final uri = Uri.parse('${_config.apiBaseUrl}$path').replace(queryParameters: query);
    final request = http.Request(method, uri)
      ..headers['accept'] = 'application/json'
      ..headers['content-type'] = 'application/json; charset=utf-8';
    if (accessToken != null) {
      request.headers['authorization'] = 'Bearer $accessToken';
    }
    if (body != null) {
      request.body = jsonEncode(body);
    }
    try {
      final streamed = await _http.send(request).timeout(_config.requestTimeout);
      return await http.Response.fromStream(streamed);
    } on TimeoutException {
      throw const NetworkException('Időtúllépés – ellenőrizd a kapcsolatot.');
    } on SocketException catch (e) {
      throw NetworkException('Nincs hálózati kapcsolat (${e.message}).');
    } on http.ClientException catch (e) {
      throw NetworkException(e.message);
    }
  }

  /// Single-flight tokenfrissítés. @returns az új tokenek, vagy null, ha a
  /// munkamenet véglegesen lejárt.
  Future<AuthTokens?> _refreshTokens(AuthTokens stale) {
    return _refreshInFlight ??= () async {
      try {
        // Ha közben egy másik kérés már frissített, azt használjuk.
        final current = await _tokens.read();
        if (current != null && current.accessToken != stale.accessToken) {
          return current;
        }
        final response = await _raw('POST', '/auth/refresh', body: {'refreshToken': stale.refreshToken});
        if (response.statusCode != HttpStatus.ok) {
          await _tokens.clear();
          return null;
        }
        final json = _decode(response);
        final fresh = AuthTokens(
          accessToken: json['accessToken'] as String,
          refreshToken: json['refreshToken'] as String,
        );
        await _tokens.write(fresh);
        return fresh;
      } finally {
        _refreshInFlight = null;
      }
    }();
  }

  Json _decode(http.Response response) {
    final text = utf8.decode(response.bodyBytes);
    final Object? decoded = text.isEmpty ? null : _tryJson(text);
    if (response.statusCode >= 200 && response.statusCode < 300) {
      return decoded is Json ? decoded : <String, dynamic>{};
    }
    if (response.statusCode == HttpStatus.unauthorized) {
      throw UnauthorizedException(_message(decoded) ?? 'Nincs jogosultság.');
    }
    throw HttpStatusException(response.statusCode, _message(decoded) ?? 'HTTP ${response.statusCode}');
  }

  static Object? _tryJson(String text) {
    try {
      return jsonDecode(text);
    } on FormatException {
      return null;
    }
  }

  /// A NestJS hibaválasz `message` mezője szöveg vagy szöveglista lehet.
  static String? _message(Object? body) {
    if (body is! Json) return null;
    final message = body['message'];
    if (message is String) return message;
    if (message is List) return message.whereType<String>().join('\n');
    return null;
  }

  void close() => _http.close();
}
