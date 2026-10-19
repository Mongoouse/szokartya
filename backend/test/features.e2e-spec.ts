import { createTestApp, PASSWORD, RegisteredUser, registerUser, resetUserData, TestApp, uuid, wordId } from './helpers/test-app';

const API = '/api/v1';
const DAY = 86_400_000;

interface PullWord {
  id: string;
  lemma: string;
  cefrLevel: string | null;
  isCustom: boolean;
  deletedAt: string | null;
}

/**
 * A továbbfejlesztés funkciói: nyelvtani kártyatípusok, saját szavak (REST és
 * offline push), célmegtartás, katalógusszűrés, adatexport és fióktörlés.
 */
describe('Továbbfejlesztett funkciók (integráció)', () => {
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

  const push = (body: Record<string, unknown>, who: RegisteredUser = user) =>
    t.http
      .post(`${API}/sync/push`)
      .set(who.auth)
      .send({ clientTime: new Date().toISOString(), enrollments: [], cardChanges: [], reviews: [], ...body });

  async function pullAllWords(who: RegisteredUser = user): Promise<PullWord[]> {
    const words: PullWord[] = [];
    let cursor: string | undefined;
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
    return words;
  }

  // ---------------------------------------------------------------------------
  describe('nyelvtani kártyatípusok', () => {
    it('REST felvétel: csak az alkalmazható típusok jönnek létre', async () => {
      const ids = await Promise.all(['Tisch', 'Milch', 'warten'].map((l) => wordId(t.prisma, l)));
      const res = await t.http
        .post(`${API}/study/cards`)
        .set(user.auth)
        .send({ wordIds: ids, cardTypes: ['PLURAL', 'VERB_FORMS', 'VALENCY'] })
        .expect(200);
      // Tisch: PLURAL; Milch: semmi (csak egyes számú); warten: VERB_FORMS + VALENCY.
      expect(res.body).toMatchObject({ created: 3 });
      const cards = await t.prisma.userProgress.findMany({ where: { userId: user.id }, include: { word: true } });
      expect(cards.map((c) => `${c.word.lemma}:${c.cardType}`).sort()).toEqual(['Tisch:PLURAL', 'warten:VALENCY', 'warten:VERB_FORMS']);
    });

    it('push felvétel: nem alkalmazható típus indokolt elutasítással', async () => {
      const milch = await wordId(t.prisma, 'Milch');
      const res = await push({ enrollments: [{ progressId: uuid(), wordId: milch, cardType: 'PLURAL' }] }).expect(200);
      expect(res.body.enrollments[0]).toMatchObject({ status: 'rejected', reason: 'plural_not_applicable' });
    });
  });

  // ---------------------------------------------------------------------------
  describe('saját szavak', () => {
    const schreibtisch = {
      lemma: 'Schreibtisch',
      partOfSpeech: 'NOUN',
      gender: 'MASCULINE',
      pluralForm: 'Schreibtische',
      translations: ['íróasztal'],
      example: { sentence: 'Der Schreibtisch ist groß.', translation: 'Az íróasztal nagy.' },
    };

    it('REST: létrehozás nyelvtani adatokkal, csak a tulajdonos látja, törölhető', async () => {
      const res = await t.http.post(`${API}/words`).set(user.auth).send(schreibtisch).expect(201);
      expect(res.body).toMatchObject({
        lemma: 'Schreibtisch',
        display: 'der Schreibtisch',
        isCustom: true,
        noun: { article: 'der', numberType: 'REGULAR', pluralForm: 'Schreibtische' },
        translations: [{ text: 'íróasztal', isPrimary: true }],
        examples: [{ sentence: 'Der Schreibtisch ist groß.' }],
      });
      const id = res.body.id as string;

      const other = await registerUser(t.http);
      await t.http.get(`${API}/words/${id}`).set(other.auth).expect(404);
      await t.http.delete(`${API}/words/${id}`).set(other.auth).expect(404);

      await t.http.delete(`${API}/words/${id}`).set(user.auth).expect(204);
      await t.http.get(`${API}/words/${id}`).set(user.auth).expect(404);
      // A törlés tombstone-ként szinkronizálódik.
      const pulled = (await pullAllWords()).find((w) => w.id === id);
      expect(pulled?.deletedAt).not.toBeNull();
    });

    it('azonos alakú saját szó új homográf-sorszámot kap; szófajhoz nem illő mező 400', async () => {
      await t.http.post(`${API}/words`).set(user.auth).send(schreibtisch).expect(201);
      const second = await t.http
        .post(`${API}/words`)
        .set(user.auth)
        .send({ ...schreibtisch, translations: ['munkaasztal'] })
        .expect(201);
      expect(second.body.homographNo).toBe(2);
      await t.http
        .post(`${API}/words`)
        .set(user.auth)
        .send({ lemma: 'schnell', partOfSpeech: 'ADVERB', gender: 'NEUTER', translations: ['gyorsan'] })
        .expect(400);
      await t.http.post(`${API}/words`).set(user.auth).send({ lemma: 'x', partOfSpeech: 'NOUN', translations: [] }).expect(400);
    });

    it('offline push: szó + kártyafelvétel + értékelés egy kötegben, idempotensen', async () => {
      const id = uuid();
      const progressId = uuid();
      const body = {
        customWords: [
          {
            id,
            lemma: 'ausprobieren',
            partOfSpeech: 'VERB',
            translations: ['kipróbál'],
            verb: { present3sg: 'probiert aus', preterite3sg: 'probierte aus', pastParticiple: 'ausprobiert', auxiliary: 'HABEN' },
          },
        ],
        enrollments: [
          { progressId, wordId: id, cardType: 'RECOGNITION' },
          { progressId: uuid(), wordId: id, cardType: 'VERB_FORMS' },
        ],
        reviews: [{ reviewId: uuid(), progressId, grade: 4, responseTimeMs: 1500, reviewedAt: new Date().toISOString() }],
      };
      const first = await push(body).expect(200);
      expect(first.body.customWords).toEqual([{ wordId: id, status: 'created' }]);
      expect(first.body.enrollments.map((e: { status: string }) => e.status)).toEqual(['created', 'created']);
      expect(first.body.reviews[0].status).toBe('applied');

      const verb = await t.prisma.verbAttributes.findUniqueOrThrow({ where: { wordId: id } });
      expect(verb).toMatchObject({ conjugationType: 'REGULAR', auxiliary: 'HABEN' });

      const again = await push(body).expect(200);
      expect(again.body.customWords).toEqual([{ wordId: id, status: 'exists' }]);
      expect(again.body.reviews[0].status).toBe('duplicate');

      // Más felhasználó nem foglalhatja el ugyanazt az azonosítót.
      const other = await registerUser(t.http);
      const stolen = await push({ customWords: body.customWords }, other).expect(200);
      expect(stolen.body.customWords[0]).toMatchObject({ status: 'rejected', reason: 'id_conflict' });
    });
  });

  // ---------------------------------------------------------------------------
  describe('beállítások', () => {
    it('célmegtartás: validáció, és az értékelés intervalluma ennek megfelelően skálázódik', async () => {
      await t.http.patch(`${API}/users/me`).set(user.auth).send({ targetRetention: 0.5 }).expect(400);
      const res = await t.http.patch(`${API}/users/me`).set(user.auth).send({ targetRetention: 0.8 }).expect(200);
      expect(res.body.targetRetention).toBe(0.8);

      const tisch = await wordId(t.prisma, 'Tisch');
      const now = Date.now();
      const card = await t.prisma.userProgress.create({
        data: {
          userId: user.id,
          wordId: tisch,
          state: 'REVIEW',
          intervalDays: 10,
          repetitions: 3,
          lastReviewedAt: new Date(now - 10 * DAY),
          nextReviewAt: new Date(now),
        },
      });
      const review = await t.http
        .post(`${API}/study/cards/${card.id}/reviews`)
        .set(user.auth)
        .send({ reviewId: uuid(), grade: 4, responseTimeMs: 2000 })
        .expect(200);
      // 10 · 2.5 · ln(0.8)/ln(0.9) ≈ 53 (alapértelmezett 0.9 mellett 25 lenne).
      expect(review.body.card.scheduling.intervalDays).toBe(53);
    });

    it('katalógusszűrés: csak a választott szintek, a felvett kártyák szavai és a saját szavak jönnek le', async () => {
      const abhaengen = await wordId(t.prisma, 'abhängen'); // B1
      await push({ enrollments: [{ progressId: uuid(), wordId: abhaengen, cardType: 'RECOGNITION' }] }).expect(200);
      const custom = await t.http
        .post(`${API}/words`)
        .set(user.auth)
        .send({ lemma: 'Heft', partOfSpeech: 'NOUN', gender: 'NEUTER', pluralForm: 'Hefte', cefrLevel: 'B2', translations: ['füzet'] })
        .expect(201);

      await t.http
        .patch(`${API}/users/me`)
        .set(user.auth)
        .send({ catalogLevels: ['A1'] })
        .expect(200);
      const words = await pullAllWords();
      const levels = new Set(words.filter((w) => !w.isCustom && w.id !== abhaengen).map((w) => w.cefrLevel));
      expect([...levels]).toEqual(['A1']);
      expect(words.some((w) => w.id === abhaengen)).toBe(true);
      expect(words.some((w) => w.id === custom.body.id)).toBe(true);

      await t.http.patch(`${API}/users/me`).set(user.auth).send({ catalogLevels: [] }).expect(200);
      const all = await pullAllWords();
      expect(all.length).toBe((await t.prisma.word.count({ where: { ownerId: null } })) + 1);
    });
  });

  // ---------------------------------------------------------------------------
  describe('személyes adatok', () => {
    it('export: profil, saját szavak, kártyák és teljes értékelési napló', async () => {
      const tisch = await wordId(t.prisma, 'Tisch');
      const progressId = uuid();
      await push({
        enrollments: [{ progressId, wordId: tisch, cardType: 'RECOGNITION' }],
        reviews: [{ reviewId: uuid(), progressId, grade: 5, responseTimeMs: 900, reviewedAt: new Date().toISOString() }],
      }).expect(200);
      await t.http
        .post(`${API}/words`)
        .set(user.auth)
        .send({ lemma: 'Heft', partOfSpeech: 'NOUN', translations: ['füzet'] })
        .expect(201);

      const res = await t.http.get(`${API}/users/me/export`).set(user.auth).expect(200);
      expect(res.headers['content-disposition']).toContain('attachment');
      expect(res.body).toMatchObject({
        profile: { id: user.id, email: user.email, targetRetention: 0.9, catalogLevels: [] },
        customWords: [{ lemma: 'Heft', isCustom: true }],
        cards: [{ id: progressId, word: 'Tisch', cardType: 'RECOGNITION', totalReviews: 1 }],
        reviewLogs: [{ progressId, grade: 5, stateBefore: 'NEW', easeFactorBefore: 2.5 }],
      });
      expect(JSON.stringify(res.body)).not.toContain('passwordHash');
    });

    it('fióktörlés: hibás jelszóval 401, helyessel minden adat törlődik és a token sem használható', async () => {
      const tisch = await wordId(t.prisma, 'Tisch');
      await push({ enrollments: [{ progressId: uuid(), wordId: tisch, cardType: 'RECOGNITION' }] }).expect(200);

      await t.http.delete(`${API}/users/me`).set(user.auth).send({ password: 'rossz-jelszo-123' }).expect(401);
      await t.http.delete(`${API}/users/me`).set(user.auth).send({ password: PASSWORD }).expect(204);

      expect(await t.prisma.user.count({ where: { id: user.id } })).toBe(0);
      expect(await t.prisma.userProgress.count({ where: { userId: user.id } })).toBe(0);
      expect(await t.prisma.refreshToken.count({ where: { userId: user.id } })).toBe(0);
      await t.http.get(`${API}/users/me`).set(user.auth).expect(404);
      await t.http.post(`${API}/auth/refresh`).send({ refreshToken: user.refreshToken }).expect(401);
    });
  });
});
