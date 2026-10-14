import 'dart:async';
import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:szokartya/core/api/api_client.dart';
import 'package:szokartya/core/api/api_exception.dart';
import 'package:szokartya/core/api/token_store.dart';
import 'package:szokartya/core/config/app_config.dart';

const config = AppConfig(apiBaseUrl: 'https://api.test/api/v1', requestTimeout: Duration(milliseconds: 200));

http.Response json(Object body, [int status = 200]) =>
    http.Response(jsonEncode(body), status, headers: {'content-type': 'application/json; charset=utf-8'});

void main() {
  late InMemoryTokenStore tokens;

  setUp(() async {
    tokens = InMemoryTokenStore();
    await tokens.write(const AuthTokens(accessToken: 'access-1', refreshToken: 'refresh-1'));
  });

  test('Bearer tokent csatol, JSON-t (UTF-8) dekódol', () async {
    final client = ApiClient(
      config: config,
      tokenStore: tokens,
      httpClient: MockClient((req) async {
        expect(req.headers['authorization'], 'Bearer access-1');
        expect(req.url.toString(), 'https://api.test/api/v1/users/me');
        return json({'displayName': 'Árvíztűrő'});
      }),
    );
    expect((await client.get('/users/me'))['displayName'], 'Árvíztűrő');
  });

  test('401 → tokenfrissítés, majd a kérés megismétlése az új tokennel', () async {
    final calls = <String>[];
    final client = ApiClient(
      config: config,
      tokenStore: tokens,
      httpClient: MockClient((req) async {
        calls.add('${req.url.path} ${req.headers['authorization'] ?? '-'}');
        if (req.url.path.endsWith('/auth/refresh')) {
          expect(jsonDecode(req.body), {'refreshToken': 'refresh-1'});
          return json({'accessToken': 'access-2', 'refreshToken': 'refresh-2'});
        }
        return req.headers['authorization'] == 'Bearer access-2' ? json({'ok': true}) : json({'message': 'lejárt'}, 401);
      }),
    );

    expect((await client.get('/users/me'))['ok'], isTrue);
    expect(calls, [
      '/api/v1/users/me Bearer access-1',
      '/api/v1/auth/refresh -',
      '/api/v1/users/me Bearer access-2',
    ]);
    expect((await tokens.read())!.refreshToken, 'refresh-2');
  });

  test('párhuzamos 401-ek egyetlen frissítésen osztoznak (rotáció miatt kötelező)', () async {
    var refreshCalls = 0;
    final refreshGate = Completer<void>();
    final client = ApiClient(
      config: config,
      tokenStore: tokens,
      httpClient: MockClient((req) async {
        if (req.url.path.endsWith('/auth/refresh')) {
          refreshCalls++;
          await refreshGate.future;
          return json({'accessToken': 'access-2', 'refreshToken': 'refresh-2'});
        }
        return req.headers['authorization'] == 'Bearer access-2' ? json({'ok': true}) : json({}, 401);
      }),
    );

    final requests = List.generate(5, (_) => client.get('/study/queue'));
    await Future<void>.delayed(const Duration(milliseconds: 20));
    refreshGate.complete();
    final results = await Future.wait(requests);
    expect(results.every((r) => r['ok'] == true), isTrue);
    expect(refreshCalls, 1);
  });

  test('sikertelen frissítés: tokenek törlése, kiléptetés jelzése, UnauthorizedException', () async {
    var expired = false;
    final client = ApiClient(
      config: config,
      tokenStore: tokens,
      onSessionExpired: () => expired = true,
      httpClient: MockClient((req) async => json({'message': 'Érvénytelen'}, 401)),
    );
    await expectLater(client.get('/users/me'), throwsA(isA<UnauthorizedException>()));
    expect(expired, isTrue);
    expect(await tokens.read(), isNull);
  });

  test('token nélkül hitelesített hívás el sem indul', () async {
    await tokens.clear();
    var called = false;
    final client = ApiClient(config: config, tokenStore: tokens, httpClient: MockClient((_) async {
      called = true;
      return json({});
    }));
    await expectLater(client.get('/users/me'), throwsA(isA<UnauthorizedException>()));
    expect(called, isFalse);
  });

  test('hibaválaszok: üzenet (szöveg vagy lista) és újrapróbálhatóság', () async {
    final client = ApiClient(
      config: config,
      tokenStore: tokens,
      httpClient: MockClient((req) async => switch (req.url.path) {
            '/api/v1/a' => json({'message': ['email: hibás', 'password: rövid']}, 400),
            '/api/v1/b' => json({'message': 'Belső hiba'}, 503),
            _ => http.Response('nem JSON', 409),
          }),
    );
    await expectLater(
      client.post('/a', authenticated: false),
      throwsA(isA<HttpStatusException>()
          .having((e) => e.message, 'message', 'email: hibás\npassword: rövid')
          .having((e) => e.isRetryable, 'retryable', isFalse)),
    );
    await expectLater(client.get('/b'), throwsA(isA<HttpStatusException>().having((e) => e.isRetryable, 'retryable', isTrue)));
    await expectLater(client.get('/c'), throwsA(isA<HttpStatusException>().having((e) => e.statusCode, 'status', 409)));
  });

  test('hálózati hiba és időtúllépés → NetworkException', () async {
    final failing = ApiClient(config: config, tokenStore: tokens, httpClient: MockClient((_) => throw http.ClientException('nincs net')));
    await expectLater(failing.get('/x'), throwsA(isA<NetworkException>()));

    final slow = ApiClient(
      config: config,
      tokenStore: tokens,
      httpClient: MockClient((_) async {
        await Future<void>.delayed(const Duration(seconds: 1));
        return json({});
      }),
    );
    await expectLater(slow.get('/x'), throwsA(isA<NetworkException>()));
  });
}
