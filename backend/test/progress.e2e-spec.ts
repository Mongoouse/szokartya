import { CardState } from '@prisma/client';
import { Grade, initialCardState, scheduleReview } from '../src/repetition/scheduler/sm2-scheduler';
import { createTestApp, RegisteredUser, registerUser, resetUserData, TestApp, uuid, wordId } from './helpers/test-app';

const API = '/api/v1';
const MIN = 60_000;
const DAY = 86_400_000;

describe('Tanulási haladás (integráció)', () => {
  let t: TestApp;
  let user: RegisteredUser;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await resetUserData(t.prisma);
    user = await registerUser(t.http);
  });

  async function enroll(lemmas: string[], cardTypes = ['RECOGNITION']) {
    const wordIds = await Promise.all(lemmas.map((l) => wordId(t.prisma, l)));
    const res = await t.http.post(`${API}/study/cards`).set(user.auth).send({ wordIds, cardTypes }).expect(200);
    return res.body as { created: number; restored: number; unknownWordIds: string[] };
  }

  async function cardId(lemma: string, cardType = 'RECOGNITION') {
    const w = await wordId(t.prisma, lemma);
    const p = await t.prisma.userProgress.findFirstOrThrow({ where: { userId: user.id, wordId: w, cardType: cardType as never } });
    return p.id;
  }

  const submit = (progressId: string, body: Record<string, unknown>) =>
    t.http.post(`${API}/study/cards/${progressId}/reviews`).set(user.auth).send({ reviewId: uuid(), responseTimeMs: 2000, ...body });

  // ---------------------------------------------------------------------------
  describe('kártyafelvétel', () => {
    it('létrehozza a kártyákat; névelőkártya csak nemmel rendelkező főnévhez', async () => {
      const result = await enroll(['Tisch', 'warten', 'Leute'], ['RECOGNITION', 'GENDER']);
      // Tisch: 2, warten: 1 (ige → nincs GENDER), Leute: 1 (csak többes szám → nincs nem)
      expect(result).toEqual({ created: 4, restored: 0, unknownWordIds: [] });
    });

    it('idempotens, és jelzi az ismeretlen szavakat', async () => {
      await enroll(['Tisch']);
      const unknown = uuid();
      const res = await t.http
        .post(`${API}/study/cards`)
        .set(user.auth)
        .send({ wordIds: [await wordId(t.prisma, 'Tisch'), unknown] })
        .expect(200);
      expect(res.body).toMatchObject({ unknownWordIds: [unknown] });
      expect(await t.prisma.userProgress.count({ where: { userId: user.id } })).toBe(2); // RECOGNITION + PRODUCTION
    });

    it('törölt kártyát visszaállít az előzményekkel együtt', async () => {
      await enroll(['Tisch']);
      const id = await cardId('Tisch');
      await submit(id, { grade: 4 }).expect(200);
      await t.prisma.userProgress.update({ where: { id }, data: { deletedAt: new Date() } });

      expect(await enroll(['Tisch'])).toMatchObject({ created: 0, restored: 1 });
      const restored = await t.prisma.userProgress.findUniqueOrThrow({ where: { id } });
      expect(restored).toMatchObject({ deletedAt: null, totalReviews: 1 });
    });
  });

  // ---------------------------------------------------------------------------
  describe('értékelés', () => {
    it('menti az új állapotot és a naplót, a verziót lépteti', async () => {
      await enroll(['Tisch']);
      const id = await cardId('Tisch');
      const reviewId = uuid();

      const res = await submit(id, { reviewId, grade: 4 }).expect(200);
      expect(res.body).toMatchObject({ reviewId, duplicate: false, effectiveGrade: 4 });
      expect(res.body.card.scheduling).toMatchObject({ state: 'LEARNING', totalReviews: 1, version: 2 });

      const p = await t.prisma.userProgress.findUniqueOrThrow({ where: { id } });
      expect(p).toMatchObject({ state: CardState.LEARNING, learningStep: 1, totalReviews: 1, correctReviews: 1, version: 2 });
      const log = await t.prisma.reviewLog.findUniqueOrThrow({ where: { id: reviewId } });
      expect(log).toMatchObject({
        userId: user.id,
        progressId: id,
        grade: 4,
        stateBefore: CardState.NEW,
        stateAfter: CardState.LEARNING,
        intervalDaysBefore: 0,
        intervalDaysAfter: 0,
      });
      expect(log.scheduledNextReviewAt).toEqual(p.nextReviewAt);
    });

    it('egy teljes sorozat után a szerver állapota megegyezik a tiszta ütemező eredményével', async () => {
      await enroll(['Tisch']);
      const id = await cardId('Tisch');
      const start = Date.now() - 60 * DAY;
      const steps: [Grade, number][] = [
        [4, start],
        [4, start + 10 * MIN],
        [4, start + DAY + 10 * MIN],
        [5, start + 7 * DAY + 10 * MIN],
        [1, start + 30 * DAY],
        [4, start + 30 * DAY + 10 * MIN],
        [3, start + 45 * DAY],
      ];

      let expected = initialCardState();
      for (const [grade, at] of steps) {
        await submit(id, { grade, reviewedAt: new Date(at).toISOString() }).expect(200);
        expected = scheduleReview(expected, { grade, responseTimeMs: 2000, reviewedAt: new Date(at) }).card;
      }

      const p = await t.prisma.userProgress.findUniqueOrThrow({ where: { id } });
      expect({
        state: p.state,
        easeFactor: p.easeFactor.toNumber(),
        intervalDays: p.intervalDays,
        repetitions: p.repetitions,
        lapses: p.lapses,
        totalReviews: p.totalReviews,
        nextReviewAt: p.nextReviewAt,
      }).toEqual({
        state: expected.state,
        easeFactor: expected.easeFactor,
        intervalDays: expected.intervalDays,
        repetitions: expected.repetitions,
        lapses: expected.lapses,
        totalReviews: expected.totalReviews,
        nextReviewAt: expected.nextReviewAt,
      });
      expect(await t.prisma.reviewLog.count({ where: { progressId: id } })).toBe(steps.length);
    });

    it('idempotens: ugyanaz a reviewId másodszor nem számít újra', async () => {
      await enroll(['Tisch']);
      const id = await cardId('Tisch');
      const reviewId = uuid();
      await submit(id, { reviewId, grade: 4 }).expect(200);
      const again = await submit(id, { reviewId, grade: 1 }).expect(200);

      expect(again.body).toMatchObject({ duplicate: true, effectiveGrade: 4 });
      expect(await t.prisma.reviewLog.count({ where: { progressId: id } })).toBe(1);
      expect(await t.prisma.userProgress.findUniqueOrThrow({ where: { id } })).toMatchObject({ totalReviews: 1, version: 2 });
    });

    it('másik kártyához tartozó reviewId → 409, és egyik kártya sem változik', async () => {
      await enroll(['Tisch', 'warten']);
      const a = await cardId('Tisch');
      const b = await cardId('warten');
      const reviewId = uuid();
      await submit(a, { reviewId, grade: 4 }).expect(200);
      await submit(b, { reviewId, grade: 4 }).expect(409);
      expect(await t.prisma.userProgress.findUniqueOrThrow({ where: { id: b } })).toMatchObject({ totalReviews: 0, version: 1 });
    });

    it('párhuzamos értékelések egy kártyán sorosan futnak – nincs elveszett frissítés', async () => {
      await enroll(['Tisch']);
      const id = await cardId('Tisch');
      const results = await Promise.all(Array.from({ length: 10 }, () => submit(id, { grade: 4 })));
      expect(results.map((r) => r.status)).toEqual(Array(10).fill(200));

      const p = await t.prisma.userProgress.findUniqueOrThrow({ where: { id } });
      expect(p).toMatchObject({ totalReviews: 10, correctReviews: 10, version: 11 });
      expect(await t.prisma.reviewLog.count({ where: { progressId: id } })).toBe(10);
    });

    it('párhuzamos ismételt küldés ugyanazzal a reviewId-vel: pontosan egy alkalmazódik', async () => {
      await enroll(['Tisch']);
      const id = await cardId('Tisch');
      const reviewId = uuid();
      const results = await Promise.all(Array.from({ length: 5 }, () => submit(id, { reviewId, grade: 4 })));
      expect(results.map((r) => r.status)).toEqual(Array(5).fill(200));
      expect(results.filter((r) => r.body.duplicate === false)).toHaveLength(1);
      expect(await t.prisma.reviewLog.count({ where: { progressId: id } })).toBe(1);
    });

    it('atomikus: ha a napló írása elbukik, a kártya állapota sem változik', async () => {
      await enroll(['Tisch']);
      const id = await cardId('Tisch');
      await t.prisma.$executeRawUnsafe(`
        CREATE OR REPLACE FUNCTION test_fail_insert() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN RAISE EXCEPTION 'szimulált naplóhiba'; END; $$`);
      await t.prisma.$executeRawUnsafe(
        'CREATE TRIGGER test_fail BEFORE INSERT ON review_logs FOR EACH ROW EXECUTE FUNCTION test_fail_insert()',
      );
      try {
        await submit(id, { grade: 4 }).expect(500);
      } finally {
        await t.prisma.$executeRawUnsafe('DROP TRIGGER test_fail ON review_logs');
        await t.prisma.$executeRawUnsafe('DROP FUNCTION test_fail_insert()');
      }
      expect(await t.prisma.userProgress.findUniqueOrThrow({ where: { id } })).toMatchObject({
        state: CardState.NEW,
        totalReviews: 0,
        version: 1,
      });
      expect(await t.prisma.reviewLog.count({ where: { progressId: id } })).toBe(0);
    });

    it('időbélyeg-normalizálás: jövőbeli kliensidő → szerveridő; az előzőnél korábbi → az előző ideje', async () => {
      await enroll(['Tisch']);
      const id = await cardId('Tisch');
      const before = Date.now();
      const future = await submit(id, { grade: 4, reviewedAt: new Date(Date.now() + 2 * DAY).toISOString() }).expect(200);
      const last = new Date(future.body.card.scheduling.lastReviewedAt as string).getTime();
      expect(last).toBeGreaterThanOrEqual(before);
      expect(last).toBeLessThanOrEqual(Date.now());

      const past = await submit(id, { grade: 4, reviewedAt: new Date(before - 10 * DAY).toISOString() }).expect(200);
      expect(new Date(past.body.card.scheduling.lastReviewedAt as string).getTime()).toBe(last);
    });

    it('felfüggesztett kártya nem értékelhető; visszaállítás után igen', async () => {
      await enroll(['Tisch']);
      const id = await cardId('Tisch');
      await t.http.patch(`${API}/study/cards/${id}`).set(user.auth).send({ isSuspended: true }).expect(200);
      await submit(id, { grade: 4 }).expect(409);
      await t.http.patch(`${API}/study/cards/${id}`).set(user.auth).send({ isSuspended: false }).expect(200);
      await submit(id, { grade: 4 }).expect(200);
    });

    it.each([
      ['minőség 6', { grade: 6 }],
      ['negatív minőség', { grade: -1 }],
      ['tört minőség', { grade: 3.5 }],
      ['negatív reakcióidő', { grade: 4, responseTimeMs: -1 }],
      ['érvénytelen reviewId', { grade: 4, reviewId: 'nem-uuid' }],
    ])('validáció: %s → 400', async (_label, body) => {
      await enroll(['Tisch']);
      await submit(await cardId('Tisch'), body).expect(400);
    });

    it('nem létező kártya → 404; érvénytelen azonosító → 400', async () => {
      await submit(uuid(), { grade: 4 }).expect(404);
      await submit('nem-uuid', { grade: 4 }).expect(400);
    });
  });

  // ---------------------------------------------------------------------------
  describe('napi sor és keretek', () => {
    it('az új kártyák számát a napi keret korlátozza, és a bevezetett újak csökkentik', async () => {
      await t.http.patch(`${API}/users/me`).set(user.auth).send({ dailyNewCardsLimit: 3 }).expect(200);
      await enroll(['Tisch', 'warten', 'schnell', 'gut', 'Milch']);

      let queue = (await t.http.get(`${API}/study/queue`).set(user.auth).expect(200)).body;
      expect(queue.newCards).toHaveLength(3);
      expect(queue.newCardsRemainingToday).toBe(3);

      await submit(queue.newCards[0].progressId as string, { grade: 4 }).expect(200);
      queue = (await t.http.get(`${API}/study/queue`).set(user.auth).expect(200)).body;
      expect(queue.newCards).toHaveLength(2);
      expect(queue.newCardsRemainingToday).toBe(2);
      // A tanulási lépcsőre került kártya a „learning” listában jelenik meg, kereten kívül.
      expect(queue.learning).toHaveLength(1);
    });

    it('az ismétlési keretet a mai REVIEW-értékelések csökkentik', async () => {
      await t.http.patch(`${API}/users/me`).set(user.auth).send({ dailyReviewLimit: 1 }).expect(200);
      await enroll(['Tisch', 'warten']);
      // Két kártya „könnyű” válasszal REVIEW-ba, majd esedékessé tesszük őket.
      for (const lemma of ['Tisch', 'warten']) {
        await submit(await cardId(lemma), { grade: 5 }).expect(200);
      }
      await t.prisma.userProgress.updateMany({ where: { userId: user.id, state: CardState.REVIEW }, data: { nextReviewAt: new Date() } });

      let queue = (await t.http.get(`${API}/study/queue`).set(user.auth).expect(200)).body;
      expect(queue.reviews).toHaveLength(1);
      await submit(queue.reviews[0].progressId as string, { grade: 4 }).expect(200);
      queue = (await t.http.get(`${API}/study/queue`).set(user.auth).expect(200)).body;
      expect(queue.reviews).toHaveLength(0);
      expect(queue.reviewsRemainingToday).toBe(0);
    });

    it('a sor tartalmazza a szó nyelvtani adatait (névelő, vonzat)', async () => {
      await enroll(['warten', 'Tisch']);
      const queue = (await t.http.get(`${API}/study/queue`).set(user.auth).expect(200)).body;
      const words = queue.newCards.map((c: { word: Record<string, unknown> }) => c.word);
      expect(words).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ display: 'der Tisch', noun: expect.objectContaining({ article: 'der', pluralForm: 'Tische' }) }),
          expect.objectContaining({ lemma: 'warten', valencies: [expect.objectContaining({ pattern: 'warten auf + Akk.', caseAbbreviation: 'Akk.' })] }),
        ]),
      );
    });
  });

  // ---------------------------------------------------------------------------
  describe('statisztika és elkülönítés', () => {
    it('pontosság, hibaarány és állapotonkénti darabszám', async () => {
      await enroll(['Tisch', 'warten']);
      await submit(await cardId('Tisch'), { grade: 4, responseTimeMs: 1000 }).expect(200);
      await submit(await cardId('warten'), { grade: 1, responseTimeMs: 3000 }).expect(200);

      const stats = (await t.http.get(`${API}/study/stats`).set(user.auth).expect(200)).body;
      expect(stats).toMatchObject({
        reviewsToday: 2,
        reviewsLast30Days: 2,
        accuracyLast30Days: 0.5,
        errorRateLast30Days: 0.5,
        avgResponseMsLast30Days: 2000,
        cardsByState: { NEW: 0, LEARNING: 2, REVIEW: 0, RELEARNING: 0 },
      });
    });

    it('más felhasználó kártyája nem látható és nem értékelhető', async () => {
      await enroll(['Tisch']);
      const id = await cardId('Tisch');
      const intruder = await registerUser(t.http);

      await t.http
        .post(`${API}/study/cards/${id}/reviews`)
        .set(intruder.auth)
        .send({ reviewId: uuid(), grade: 4, responseTimeMs: 1000 })
        .expect(404);
      await t.http.patch(`${API}/study/cards/${id}`).set(intruder.auth).send({ isSuspended: true }).expect(404);
      const queue = (await t.http.get(`${API}/study/queue`).set(intruder.auth).expect(200)).body;
      expect(queue.newCards).toHaveLength(0);
      expect(await t.prisma.userProgress.findUniqueOrThrow({ where: { id } })).toMatchObject({ totalReviews: 0, isSuspended: false });
    });
  });
});
