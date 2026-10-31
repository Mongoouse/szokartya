import { UserRole, WordReviewStatus } from '@prisma/client';
import { createTestApp, RegisteredUser, registerUser, resetUserData, TestApp, uuid, wordId } from './helpers/test-app';

const API = '/api/v1';

interface PullWord {
  id: string;
  version: number;
  deletedAt: string | null;
  reviewStatus: string | null;
  translations: { text: string; isPrimary: boolean }[];
}

/**
 * Hibabejelentés (REST és offline push) és adminisztráció: szerepkör-ellenőrzés,
 * bejelentések kezelése, szavak jóváhagyása / elutasítása / javítása, és ezek
 * eljutása a felhasználók eszközeire a szinkronnal.
 */
describe('Hibabejelentés és adminisztráció (integráció)', () => {
  let t: TestApp;
  let user: RegisteredUser;
  let admin: RegisteredUser;
  // A tesztek a központi szótár néhány szavát módosítják – minden teszt után visszaállítjuk őket.
  const LEMMAS = ['Student', 'Angst', 'Leute'];
  let originalTranslations: Map<string, { text: string; isPrimary: boolean; sortOrder: number }[]>;

  beforeAll(async () => {
    t = await createTestApp();
    originalTranslations = new Map();
    for (const lemma of LEMMAS) {
      const id = await wordId(t.prisma, lemma);
      const rows = await t.prisma.translation.findMany({ where: { wordId: id, deletedAt: null }, orderBy: { sortOrder: 'asc' } });
      originalTranslations.set(
        id,
        rows.map((r) => ({ text: r.text, isPrimary: r.isPrimary, sortOrder: r.sortOrder })),
      );
    }
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await resetUserData(t.prisma);
    user = await registerUser(t.http);
    admin = await registerUser(t.http);
    await t.prisma.user.update({ where: { id: admin.id }, data: { role: UserRole.ADMIN } });
  });
  afterEach(async () => {
    for (const [id, rows] of originalTranslations) {
      await t.prisma.translation.deleteMany({ where: { wordId: id } });
      await t.prisma.translation.createMany({ data: rows.map((r) => ({ wordId: id, language: 'hu', ...r })) });
      await t.prisma.word.update({
        where: { id },
        data: { reviewStatus: WordReviewStatus.UNREVIEWED, reviewedAt: null, reviewedById: null },
      });
    }
  });

  const push = (body: Record<string, unknown>, who: RegisteredUser = user) =>
    t.http
      .post(`${API}/sync/push`)
      .set(who.auth)
      .send({ clientTime: new Date().toISOString(), ...body });

  async function pull(who: RegisteredUser, cursor?: string): Promise<{ words: PullWord[]; cursor: string }> {
    const words: PullWord[] = [];
    for (let page = 0; page < 50; page++) {
      const res = await t.http
        .get(`${API}/sync/pull`)
        .set(who.auth)
        .query({ ...(cursor ? { cursor } : {}), limit: 1000 })
        .expect(200);
      const body = res.body as { words: PullWord[]; cursor: string; hasMore: boolean };
      words.push(...body.words);
      cursor = body.cursor;
      if (!body.hasMore) break;
    }
    return { words, cursor: cursor! };
  }

  // ---------------------------------------------------------------------------
  describe('hibabejelentés', () => {
    it('REST: létrehozás, a saját listában megjelenik nyitott állapotban', async () => {
      const student = await wordId(t.prisma, 'Student');
      const res = await t.http
        .post(`${API}/reports`)
        .set(user.auth)
        .send({ wordId: student, cardType: 'RECOGNITION', category: 'TRANSLATION', message: '  Rossz a jelentés.  ' })
        .expect(201);
      expect(res.body).toMatchObject({ wordId: student, status: 'OPEN', category: 'TRANSLATION', message: 'Rossz a jelentés.' });

      const mine = await t.http.get(`${API}/reports/mine`).set(user.auth).expect(200);
      expect(mine.body).toEqual([expect.objectContaining({ id: res.body.id, word: 'Student', status: 'OPEN', adminNote: null })]);
    });

    it('REST: ismeretlen szó → 404, üres üzenet → 400', async () => {
      await t.http.post(`${API}/reports`).set(user.auth).send({ wordId: uuid(), message: 'x' }).expect(404);
      const student = await wordId(t.prisma, 'Student');
      await t.http.post(`${API}/reports`).set(user.auth).send({ wordId: student, message: '   ' }).expect(400);
    });

    it('push: offline bejelentés idempotensen töltődik fel, a kliens ideje megmarad', async () => {
      const student = await wordId(t.prisma, 'Student');
      const createdAt = new Date(Date.now() - 3_600_000).toISOString();
      const report = { id: uuid(), wordId: student, category: 'SPELLING', message: 'Elírás', createdAt };

      const first = await push({ reports: [report] }).expect(200);
      expect(first.body.reports).toEqual([{ reportId: report.id, status: 'created' }]);
      const again = await push({ reports: [report] }).expect(200);
      expect(again.body.reports).toEqual([{ reportId: report.id, status: 'exists' }]);

      const stored = await t.prisma.wordReport.findUniqueOrThrow({ where: { id: report.id } });
      expect(stored.createdAt.toISOString()).toBe(createdAt);
      expect(stored.userId).toBe(user.id);
    });

    it('push: azonosító nélkül, idegen azonosítóval vagy ismeretlen szóra elutasítva', async () => {
      const student = await wordId(t.prisma, 'Student');
      const foreignId = uuid();
      await push({ reports: [{ id: foreignId, wordId: student, message: 'más' }] }, admin).expect(200);

      const res = await push({
        reports: [
          { wordId: student, message: 'nincs id' },
          { id: foreignId, wordId: student, message: 'ütközés' },
          { id: uuid(), wordId: uuid(), message: 'ismeretlen' },
        ],
      }).expect(200);
      expect(res.body.reports.map((r: { reason: string }) => r.reason)).toEqual(['id_required', 'id_conflict', 'unknown_word']);
      expect(await t.prisma.wordReport.count({ where: { userId: user.id } })).toBe(0);
    });

    it('a régi kliens (reports mező nélkül) push-a továbbra is működik', async () => {
      const res = await push({ enrollments: [], cardChanges: [], reviews: [] }).expect(200);
      expect(res.body.reports).toEqual([]);
    });

    it('az adatexport tartalmazza a bejelentéseket', async () => {
      const student = await wordId(t.prisma, 'Student');
      await t.http.post(`${API}/reports`).set(user.auth).send({ wordId: student, message: 'export' }).expect(201);
      const res = await t.http.get(`${API}/users/me/export`).set(user.auth).expect(200);
      expect(res.body.reports).toEqual([expect.objectContaining({ word: 'Student', message: 'export' })]);
    });
  });

  // ---------------------------------------------------------------------------
  describe('jogosultság', () => {
    it('admin végpont normál felhasználónak 403, adminnak 200; a profil mutatja a szerepkört', async () => {
      await t.http.get(`${API}/admin/summary`).set(user.auth).expect(403);
      await t.http.get(`${API}/admin/summary`).expect(401);
      await t.http.get(`${API}/admin/summary`).set(admin.auth).expect(200);

      expect((await t.http.get(`${API}/users/me`).set(user.auth).expect(200)).body.role).toBe('USER');
      expect((await t.http.get(`${API}/users/me`).set(admin.auth).expect(200)).body.role).toBe('ADMIN');
    });

    it('a jogosultság visszavonása azonnal érvényes (nem kell új token)', async () => {
      await t.prisma.user.update({ where: { id: admin.id }, data: { role: UserRole.USER } });
      await t.http.get(`${API}/admin/summary`).set(admin.auth).expect(403);
    });
  });

  // ---------------------------------------------------------------------------
  describe('bejelentések kezelése', () => {
    it('lista → lezárás megjegyzéssel → a bejelentő látja; az összesítés számol', async () => {
      const student = await wordId(t.prisma, 'Student');
      const created = await t.http
        .post(`${API}/reports`)
        .set(user.auth)
        .send({ wordId: student, category: 'TRANSLATION', message: 'hibás' })
        .expect(201);

      const open = await t.http.get(`${API}/admin/reports`).set(admin.auth).query({ status: 'OPEN' }).expect(200);
      expect(open.body.total).toBe(1);
      expect(open.body.items[0]).toMatchObject({
        id: created.body.id,
        reporter: { email: user.email },
        word: { lemma: 'Student', reviewStatus: 'UNREVIEWED', openReports: 1 },
      });

      const resolved = await t.http
        .patch(`${API}/admin/reports/${created.body.id}`)
        .set(admin.auth)
        .send({ status: 'RESOLVED', adminNote: 'Javítva, köszönjük!' })
        .expect(200);
      expect(resolved.body).toMatchObject({ status: 'RESOLVED', adminNote: 'Javítva, köszönjük!', resolvedBy: admin.email });
      expect(resolved.body.resolvedAt).not.toBeNull();

      const mine = await t.http.get(`${API}/reports/mine`).set(user.auth).expect(200);
      expect(mine.body[0]).toMatchObject({ status: 'RESOLVED', adminNote: 'Javítva, köszönjük!' });

      const summary = await t.http.get(`${API}/admin/summary`).set(admin.auth).expect(200);
      expect(summary.body.reports).toEqual({ OPEN: 0, RESOLVED: 1, DISMISSED: 0 });
      expect(summary.body.reportsByCategory).toMatchObject({ TRANSLATION: 1 });
      expect(summary.body.avgResolutionHours).toEqual(expect.any(Number));

      // Újranyitás: a lezárási adatok törlődnek (CHECK: OPEN ⇔ resolved_at IS NULL).
      const reopened = await t.http.patch(`${API}/admin/reports/${created.body.id}`).set(admin.auth).send({ status: 'OPEN' }).expect(200);
      expect(reopened.body).toMatchObject({ status: 'OPEN', resolvedAt: null, resolvedBy: null });
    });

    it('nem létező bejelentés → 404', async () => {
      await t.http.patch(`${API}/admin/reports/${uuid()}`).set(admin.auth).send({ status: 'DISMISSED' }).expect(404);
    });
  });

  // ---------------------------------------------------------------------------
  describe('szavak ellenőrzése', () => {
    it('jóváhagyás: státusz, ellenőrző, és a szűrt sor', async () => {
      const angst = await wordId(t.prisma, 'Angst');
      const res = await t.http.patch(`${API}/admin/words/${angst}`).set(admin.auth).send({ reviewStatus: 'VERIFIED' }).expect(200);
      expect(res.body).toMatchObject({ reviewStatus: 'VERIFIED', reviewedBy: admin.email });

      const verified = await t.http.get(`${API}/admin/words`).set(admin.auth).query({ status: 'VERIFIED', q: 'Angst' }).expect(200);
      expect(verified.body.items.map((w: { lemma: string }) => w.lemma)).toEqual(['Angst']);
      const queue = await t.http.get(`${API}/admin/words`).set(admin.auth).query({ status: 'UNREVIEWED', q: 'Angst' }).expect(200);
      expect(queue.body.total).toBe(0);
    });

    it('jelentés javítása: ellenőrzöttnek jelöli, és a felhasználó eszközére leszinkronizálódik', async () => {
      const student = await wordId(t.prisma, 'Student');
      const before = await pull(user);
      const old = before.words.find((w) => w.id === student)!;

      const res = await t.http
        .patch(`${API}/admin/words/${student}`)
        .set(admin.auth)
        .send({ translations: ['egyetemi hallgató', 'diák'], expectedVersion: old.version })
        .expect(200);
      expect(res.body.reviewStatus).toBe('VERIFIED');
      expect(res.body.translations).toEqual([
        expect.objectContaining({ text: 'egyetemi hallgató', isPrimary: true }),
        expect.objectContaining({ text: 'diák', isPrimary: false }),
      ]);

      // Inkrementális pull az előző kurzortól: a javított szó új verzióval érkezik.
      const after = await pull(user, before.cursor);
      const fixed = after.words.find((w) => w.id === student)!;
      expect(fixed.version).toBeGreaterThan(old.version);
      expect(fixed.reviewStatus).toBe('VERIFIED');
      expect(fixed.translations.map((tr) => tr.text)).toEqual(['egyetemi hallgató', 'diák']);
    });

    it('elavult verzióval küldött módosítás → 409', async () => {
      const student = await wordId(t.prisma, 'Student');
      const { version } = await t.prisma.word.findUniqueOrThrow({ where: { id: student } });
      await t.http.patch(`${API}/admin/words/${student}`).set(admin.auth).send({ reviewStatus: 'VERIFIED' }).expect(200);
      await t.http
        .patch(`${API}/admin/words/${student}`)
        .set(admin.auth)
        .send({ reviewStatus: 'REJECTED', expectedVersion: version })
        .expect(409);
    });

    it('elutasítás: a szó eltűnik a felhasználónál (tombstone, kereső, felvétel, napi sor), visszaállítva visszajön', async () => {
      const leute = await wordId(t.prisma, 'Leute');
      await t.http
        .post(`${API}/study/cards`)
        .set(user.auth)
        .send({ wordIds: [leute], cardTypes: ['RECOGNITION'] })
        .expect(200);
      const before = await pull(user);
      let queue = (await t.http.get(`${API}/study/queue`).set(user.auth).expect(200)).body;
      expect(queue.newCards.map((c: { word: { lemma: string } }) => c.word.lemma)).toContain('Leute');

      await t.http.patch(`${API}/admin/words/${leute}`).set(admin.auth).send({ reviewStatus: 'REJECTED' }).expect(200);

      const after = await pull(user, before.cursor);
      expect(after.words.find((w) => w.id === leute)).toMatchObject({ deletedAt: expect.any(String) });
      await t.http.get(`${API}/words/${leute}`).set(user.auth).expect(404);
      queue = (await t.http.get(`${API}/study/queue`).set(user.auth).expect(200)).body;
      expect(queue.newCards.map((c: { word: { lemma: string } }) => c.word.lemma)).not.toContain('Leute');
      const enroll = await push({ enrollments: [{ progressId: uuid(), wordId: leute, cardType: 'PRODUCTION' }] }).expect(200);
      expect(enroll.body.enrollments[0]).toMatchObject({ status: 'rejected', reason: 'unknown_word' });
      await t.http.post(`${API}/reports`).set(user.auth).send({ wordId: leute, message: 'x' }).expect(404);

      // Az admin továbbra is látja és visszaállíthatja; a tanulási előzmény megmaradt.
      await t.http.patch(`${API}/admin/words/${leute}`).set(admin.auth).send({ reviewStatus: 'VERIFIED' }).expect(200);
      const restored = await pull(user, after.cursor);
      expect(restored.words.find((w) => w.id === leute)).toMatchObject({ deletedAt: null, reviewStatus: 'VERIFIED' });
      queue = (await t.http.get(`${API}/study/queue`).set(user.auth).expect(200)).body;
      expect(queue.newCards.map((c: { word: { lemma: string } }) => c.word.lemma)).toContain('Leute');
    });

    it('saját szó nem ellenőrizhető admin felületen (404), és a reviewStatus-a null', async () => {
      const id = uuid();
      await t.http
        .post(`${API}/words`)
        .set(user.auth)
        .send({ id, lemma: 'Testwort', partOfSpeech: 'OTHER', translations: ['tesztszó'] })
        .expect(201);
      await t.http.patch(`${API}/admin/words/${id}`).set(admin.auth).send({ reviewStatus: 'REJECTED' }).expect(404);
      const word = await t.http.get(`${API}/words/${id}`).set(user.auth).expect(200);
      expect(word.body.reviewStatus).toBeNull();
    });

    it('üres módosítás → 400, ismétlődő jelentés → 400', async () => {
      const student = await wordId(t.prisma, 'Student');
      await t.http.patch(`${API}/admin/words/${student}`).set(admin.auth).send({}).expect(400);
      await t.http
        .patch(`${API}/admin/words/${student}`)
        .set(admin.auth)
        .send({ translations: ['diák', ' Diák'] })
        .expect(400);
    });
  });
});
