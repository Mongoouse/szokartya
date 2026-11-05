import { ConfigService } from '@nestjs/config';
import { AppConfigService } from '../src/config/app-config.service';
import { createTestApp, TestApp } from './helpers/test-app';

const API = '/api/v1';
const WEB_ORIGIN = 'http://localhost:8080';

/**
 * A böngészős (Flutter web) kliens más originről (pl. localhost:8080) hívja az
 * API-t, ezért a böngésző CORS-engedélyt kér. Csak a CORS_ORIGINS-ben felsorolt
 * originek kapnak engedélyt.
 */
describe('CORS a webes klienshez (integráció)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp((b) =>
      b.overrideProvider(AppConfigService).useFactory({
        factory: (...args: ConstructorParameters<typeof AppConfigService>) => {
          const config = new AppConfigService(...args);
          Object.defineProperty(config, 'corsOrigins', { get: () => [WEB_ORIGIN] });
          return config;
        },
        inject: [ConfigService],
      }),
    );
  });
  afterAll(() => t.close());

  it('előzetes (preflight) kérés: az engedélyezett origin megkapja az Authorization fejlécet', async () => {
    const res = await t.http
      .options(`${API}/sync/pull`)
      .set('Origin', WEB_ORIGIN)
      .set('Access-Control-Request-Method', 'GET')
      .set('Access-Control-Request-Headers', 'authorization,content-type')
      .expect(204);
    expect(res.headers['access-control-allow-origin']).toBe(WEB_ORIGIN);
    expect(res.headers['access-control-allow-headers']).toMatch(/authorization/i);
  });

  it('egyszerű kérés: engedélyezett originre CORS fejléc, idegenre nincs', async () => {
    const ok = await t.http.get(`${API}/health`).set('Origin', WEB_ORIGIN).expect(200);
    expect(ok.headers['access-control-allow-origin']).toBe(WEB_ORIGIN);

    const foreign = await t.http.get(`${API}/health`).set('Origin', 'https://gonosz.example').expect(200);
    expect(foreign.headers['access-control-allow-origin']).toBeUndefined();
  });
});
