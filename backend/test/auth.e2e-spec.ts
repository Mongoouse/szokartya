import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { AppConfigService } from '../src/config/app-config.service';
import { TokenService } from '../src/auth/token.service';
import { createTestApp, PASSWORD, registerUser, resetUserData, TestApp, uuid } from './helpers/test-app';

const API = '/api/v1';

describe('Hitelesítés (integráció)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());
  beforeEach(() => resetUserData(t.prisma));

  // ---------------------------------------------------------------------------
  describe('regisztráció', () => {
    it('létrehozza a fiókot és bejelentkezett munkamenetet ad', async () => {
      const res = await t.http
        .post(`${API}/auth/register`)
        .send({ email: '  Anna@Example.HU ', password: PASSWORD, displayName: 'Anna', timezone: 'Europe/Vienna' })
        .expect(201);

      expect(res.body).toMatchObject({
        accessTokenExpiresIn: 900,
        user: { email: 'anna@example.hu', displayName: 'Anna', timezone: 'Europe/Vienna' },
      });
      expect(res.body.refreshToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(JSON.stringify(res.body)).not.toMatch(/password|argon2/i);

      const user = await t.prisma.user.findUniqueOrThrow({ where: { email: 'anna@example.hu' } });
      expect(user.passwordHash).toMatch(/^\$argon2id\$/);
      // A refresh token csak hash-ként tárolódik.
      const stored = await t.prisma.refreshToken.findMany({ where: { userId: user.id } });
      expect(stored).toHaveLength(1);
      expect(stored[0]!.tokenHash).toBe(TokenService.hashRefreshToken(res.body.refreshToken));
    });

    it('foglalt e-mail cím (kis-/nagybetűtől függetlenül) → 409', async () => {
      await registerUser(t.http, 'bela@example.hu');
      await t.http.post(`${API}/auth/register`).send({ email: 'BELA@example.hu', password: PASSWORD }).expect(409);
    });

    it.each([
      ['rövid jelszó', { email: 'x@example.hu', password: 'rovid' }],
      ['csak szóköz jelszó', { email: 'x@example.hu', password: '            ' }],
      ['túl hosszú jelszó', { email: 'x@example.hu', password: 'a'.repeat(129) }],
      ['érvénytelen e-mail', { email: 'nem-email', password: PASSWORD }],
      ['érvénytelen időzóna', { email: 'x@example.hu', password: PASSWORD, timezone: 'Mars/Base' }],
      ['ismeretlen mező (mass assignment)', { email: 'x@example.hu', password: PASSWORD, isAdmin: true }],
    ])('validációs hiba: %s → 400', async (_label, body) => {
      await t.http.post(`${API}/auth/register`).send(body).expect(400);
      expect(await t.prisma.user.count()).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  describe('belépés', () => {
    it('helyes adatokkal tokent ad', async () => {
      const u = await registerUser(t.http);
      const res = await t.http.post(`${API}/auth/login`).send({ email: u.email, password: PASSWORD }).expect(200);
      expect(res.body.user.id).toBe(u.id);
    });

    it('hibás jelszó és nem létező fiók ugyanazt a választ adja (nincs felhasználó-felsorolás)', async () => {
      const u = await registerUser(t.http);
      const wrong = await t.http.post(`${API}/auth/login`).send({ email: u.email, password: 'rossz-jelszo-123' }).expect(401);
      const missing = await t.http.post(`${API}/auth/login`).send({ email: 'nincs@example.hu', password: 'rossz-jelszo-123' }).expect(401);
      expect(missing.body.message).toBe(wrong.body.message);
    });

    it('törölt (soft delete) fiókkal nem lehet belépni', async () => {
      const u = await registerUser(t.http);
      await t.prisma.user.update({ where: { id: u.id }, data: { deletedAt: new Date() } });
      await t.http.post(`${API}/auth/login`).send({ email: u.email, password: PASSWORD }).expect(401);
    });

    it('gyengébb paraméterekkel készült hash-t belépéskor újrahashel', async () => {
      const u = await registerUser(t.http);
      const weak = await argon2.hash(PASSWORD, { type: argon2.argon2id, memoryCost: 4096, timeCost: 1, parallelism: 1 });
      await t.prisma.user.update({ where: { id: u.id }, data: { passwordHash: weak } });

      await t.http.post(`${API}/auth/login`).send({ email: u.email, password: PASSWORD }).expect(200);
      const { passwordHash } = await t.prisma.user.findUniqueOrThrow({ where: { id: u.id } });
      expect(passwordHash).not.toBe(weak);
      expect(passwordHash).toMatch(/m=19456/);
      expect(passwordHash).toMatch(/t=2/);
      expect(passwordHash).toMatch(/p=1/);
    });
  });

  // ---------------------------------------------------------------------------
  describe('access token', () => {
    it('védett végpont token nélkül → 401', async () => {
      await t.http.get(`${API}/users/me`).expect(401);
    });

    it('érvénytelen aláírású token → 401', async () => {
      const forged = new JwtService({ secret: 'egy-masik-titok-ami-legalabb-32-karakter-hosszu' }).sign({
        sub: uuid(),
        email: 'x@example.hu',
        typ: 'access',
      });
      await t.http.get(`${API}/users/me`).set('Authorization', `Bearer ${forged}`).expect(401);
    });

    it('lejárt token → 401', async () => {
      const jwt = t.app.get(JwtService);
      // Az alkalmazás titkával aláírt, de 10 másodperce lejárt token.
      const expired = jwt.sign({ sub: uuid(), email: 'x@example.hu', typ: 'access', exp: Math.floor(Date.now() / 1000) - 10 });
      await t.http.get(`${API}/users/me`).set('Authorization', `Bearer ${expired}`).expect(401);
    });

    it('nem „access” típusú token → 401', async () => {
      const jwt = t.app.get(JwtService);
      const token = jwt.sign({ sub: uuid(), email: 'x@example.hu', typ: 'refresh' });
      await t.http.get(`${API}/users/me`).set('Authorization', `Bearer ${token}`).expect(401);
    });

    it('a refresh token nem használható access tokenként', async () => {
      const u = await registerUser(t.http);
      await t.http.get(`${API}/users/me`).set('Authorization', `Bearer ${u.refreshToken}`).expect(401);
    });

    it('érvényes tokennel a profil elérhető és módosítható', async () => {
      const u = await registerUser(t.http);
      const res = await t.http
        .patch(`${API}/users/me`)
        .set(u.auth)
        .send({ timezone: 'America/New_York', dailyNewCardsLimit: 5 })
        .expect(200);
      expect(res.body).toMatchObject({ timezone: 'America/New_York', dailyNewCardsLimit: 5 });
      await t.http.patch(`${API}/users/me`).set(u.auth).send({ timezone: 'Nincs/Ilyen' }).expect(400);
    });
  });

  // ---------------------------------------------------------------------------
  describe('refresh token rotáció', () => {
    it('új tokenpárt ad; a régit visszavonja és a családban összeköti', async () => {
      const u = await registerUser(t.http);
      const res = await t.http.post(`${API}/auth/refresh`).send({ refreshToken: u.refreshToken }).expect(200);
      expect(res.body.refreshToken).not.toBe(u.refreshToken);

      const old = await t.prisma.refreshToken.findUniqueOrThrow({
        where: { tokenHash: TokenService.hashRefreshToken(u.refreshToken) },
      });
      const fresh = await t.prisma.refreshToken.findUniqueOrThrow({
        where: { tokenHash: TokenService.hashRefreshToken(res.body.refreshToken) },
      });
      expect(old.revokedAt).not.toBeNull();
      expect(old.replacedById).toBe(fresh.id);
      expect(fresh.familyId).toBe(old.familyId);
      expect(fresh.revokedAt).toBeNull();

      await t.http.get(`${API}/users/me`).set('Authorization', `Bearer ${res.body.accessToken}`).expect(200);
    });

    it('lecserélt token újrafelhasználása → 401, és a TELJES család visszavonódik', async () => {
      const u = await registerUser(t.http);
      const rotated = await t.http.post(`${API}/auth/refresh`).send({ refreshToken: u.refreshToken }).expect(200);

      // Támadó a régi tokennel próbálkozik.
      await t.http.post(`${API}/auth/refresh`).send({ refreshToken: u.refreshToken }).expect(401);
      // A jogos kliens friss tokenje is érvénytelenné vált.
      await t.http.post(`${API}/auth/refresh`).send({ refreshToken: rotated.body.refreshToken }).expect(401);
      expect(await t.prisma.refreshToken.count({ where: { userId: u.id, revokedAt: null } })).toBe(0);
    });

    it('párhuzamos frissítés ugyanazzal a tokennel: pontosan egy sikerül', async () => {
      const u = await registerUser(t.http);
      const results = await Promise.all(
        Array.from({ length: 5 }, () => t.http.post(`${API}/auth/refresh`).send({ refreshToken: u.refreshToken })),
      );
      const ok = results.filter((r) => r.status === 200);
      expect(ok).toHaveLength(1);
      expect(results.filter((r) => r.status === 401)).toHaveLength(4);
    });

    it('lejárt refresh token → 401', async () => {
      const u = await registerUser(t.http);
      await t.prisma.refreshToken.updateMany({ where: { userId: u.id }, data: { expiresAt: new Date(Date.now() + 1) } });
      await new Promise((r) => setTimeout(r, 10));
      await t.http.post(`${API}/auth/refresh`).send({ refreshToken: u.refreshToken }).expect(401);
    });

    it('ismeretlen refresh token → 401; formailag hibás → 400', async () => {
      await t.http
        .post(`${API}/auth/refresh`)
        .send({ refreshToken: 'x'.repeat(43) })
        .expect(401);
      await t.http.post(`${API}/auth/refresh`).send({ refreshToken: 'rovid' }).expect(400);
    });

    it('törölt fiók tokenje nem frissíthető', async () => {
      const u = await registerUser(t.http);
      await t.prisma.user.update({ where: { id: u.id }, data: { deletedAt: new Date() } });
      await t.http.post(`${API}/auth/refresh`).send({ refreshToken: u.refreshToken }).expect(401);
    });
  });

  // ---------------------------------------------------------------------------
  describe('kijelentkezés', () => {
    it('az eszköz munkamenet-családját visszavonja; idempotens', async () => {
      const u = await registerUser(t.http);
      await t.http.post(`${API}/auth/logout`).send({ refreshToken: u.refreshToken }).expect(204);
      await t.http.post(`${API}/auth/logout`).send({ refreshToken: u.refreshToken }).expect(204);
      await t.http.post(`${API}/auth/refresh`).send({ refreshToken: u.refreshToken }).expect(401);
    });

    it('logout-all minden eszközt kiléptet, másik felhasználót nem érint', async () => {
      const u = await registerUser(t.http);
      const second = await t.http.post(`${API}/auth/login`).send({ email: u.email, password: PASSWORD }).expect(200);
      const other = await registerUser(t.http);

      await t.http.post(`${API}/auth/logout-all`).set(u.auth).expect(204);
      await t.http.post(`${API}/auth/refresh`).send({ refreshToken: u.refreshToken }).expect(401);
      await t.http.post(`${API}/auth/refresh`).send({ refreshToken: second.body.refreshToken }).expect(401);
      await t.http.post(`${API}/auth/refresh`).send({ refreshToken: other.refreshToken }).expect(200);
    });
  });
});

describe('Rate limit (integráció)', () => {
  let t: TestApp;

  beforeAll(async () => {
    // Ebben a példányban a rate limit be van kapcsolva.
    t = await createTestApp((b) =>
      b.overrideProvider(AppConfigService).useFactory({
        factory: (...args: ConstructorParameters<typeof AppConfigService>) => {
          const config = new AppConfigService(...args);
          Object.defineProperty(config, 'throttleEnabled', { get: () => true });
          return config;
        },
        inject: [ConfigService],
      }),
    );
  });
  afterAll(() => t.close());

  it('belépési végponton percenként 10 kérés után 429', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) {
      const res = await t.http.post(`${API}/auth/login`).send({ email: 'nincs@example.hu', password: 'rossz-jelszo-123' });
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 10).every((s) => s === 401)).toBe(true);
    expect(statuses[10]).toBe(429);
  });
});
