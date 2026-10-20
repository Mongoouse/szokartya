import { CardState } from '@prisma/client';
import { OVERLAP_MS } from '../src/sync/sync-cursor';
import { createTestApp, RegisteredUser, registerUser, resetUserData, TestApp, uuid, wordId } from './helpers/test-app';

const API = '/api/v1';
const MIN = 60_000;
const HOUR = 3_600_000;

interface PullBody {
  cursor: string;
  hasMore: boolean;
  progress: {
    id: string;
    wordId: string;
    cardType: string;
    version: number;
    state: string;
    totalReviews: number;
    isSuspended: boolean;
    deletedAt: string | null;
    updatedAt: string;
  }[];
  words: { id: string; lemma: string; version: number; translations: { text: string }[] }[];
  reviewLogs: { id: string; progressId: string; deviceId: string | null; reviewedAt: string }[];
}

/**
 * Többeszközös adatintegritás. Egy „eszköz” itt egy kliensoldali nézőpont:
 * saját helyi azonosítókkal, saját órával és saját szinkron kurzorral.
 */
describe('Szinkronizáció (integráció)', () => {
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

  const iso = (ms: number) => new Date(ms).toISOString();

  function push(body: Record<string, unknown>, who: RegisteredUser = user) {
    return t.http
      .post(`${API}/sync/push`)
      .set(who.auth)
      .send({ clientTime: iso(Date.now()), enrollments: [], cardChanges: [], reviews: [], ...body });
  }

  async function pull(cursor?: string, limit = 500, who: RegisteredUser = user): Promise<PullBody> {
    const res = await t.http
      .get(`${API}/sync/pull`)
      .set(who.auth)
      .query({ ...(cursor ? { cursor } : {}), limit })
      .expect(200);
    return res.body as PullBody;
  }

  /** Teljes lehúzás lapozva; visszaadja az összes elemet és a végső kurzort. */
  async function pullAll(cursor?: string, limit = 500, who: RegisteredUser = user) {
    const all: PullBody = { cursor: '', hasMore: false, progress: [], words: [], reviewLogs: [] };
    let pages = 0;
    for (;;) {
      const page = await pull(cursor, limit, who);
      pages++;
      all.progress.push(...page.progress);
      all.words.push(...page.words);
      all.reviewLogs.push(...page.reviewLogs);
      cursor = page.cursor;
      if (!page.hasMore) break;
      if (pages > 2000) throw new Error('végtelen lapozás');
    }
    return { ...all, cursor, pages };
  }

  // ---------------------------------------------------------------------------
  describe('pull', () => {
    it('első pull: a teljes központi katalógus; lapozás közben nincs kihagyás és ismétlés', async () => {
      const catalog = await t.prisma.word.count({ where: { ownerId: null } });
      const all = await pullAll(undefined, 4);
      const ids = all.words.map((w) => w.id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids).toHaveLength(catalog);
      expect(all.pages).toBe(Math.ceil(catalog / 4) + (catalog % 4 === 0 ? 1 : 0));
    });

    it('kártyák lapozása azonos időbélyegnél is hiánytalan (id szerinti holtverseny-bontás)', async () => {
      const words = await t.prisma.word.findMany({ where: { ownerId: null }, select: { id: true } });
      // Egy tranzakcióban → azonos updated_at minden soron.
      await t.prisma.userProgress.createMany({
        data: words.flatMap((w) =>
          ['RECOGNITION', 'PRODUCTION'].map((cardType) => ({ userId: user.id, wordId: w.id, cardType: cardType as never })),
        ),
      });
      const all = await pullAll(undefined, 3);
      const ids = all.progress.map((p) => p.id);
      expect(new Set(ids).size).toBe(words.length * 2);
      expect(ids).toHaveLength(words.length * 2);
    });

    it('inkrementális pull: csak a változások (az átfedő ablak duplikátumait a verzió jelzi)', async () => {
      const first = await pullAll();
      expect(first.progress).toHaveLength(0);

      const progressId = uuid();
      await push({ enrollments: [{ progressId, wordId: await wordId(t.prisma, 'Tisch'), cardType: 'RECOGNITION' }] }).expect(200);
      const second = await pull(first.cursor);
      expect(second.progress.map((p) => p.id)).toEqual([progressId]);
      // Az átfedő ablak (OVERLAP_MS) miatt a nemrég módosult szavak újra jöhetnek,
      // de csak a már ismert verzióval – a kliens ezeket eldobja.
      const known = new Map(first.words.map((w) => [w.id, w.version]));
      for (const w of second.words) {
        expect(known.get(w.id)).toBe(w.version);
      }

      // Lezárt kurzor után az átfedő ablakon belül ugyanaz a sor újra jöhet – azonos verzióval.
      const third = await pull(second.cursor);
      expect(third.progress.every((p) => p.id === progressId && p.version === second.progress[0]!.version)).toBe(true);
      expect(OVERLAP_MS).toBeGreaterThan(0);
    });

    it('a szó gyermekrekordjának változása a szót is lehozza', async () => {
      const { cursor } = await pullAll();
      const tisch = await wordId(t.prisma, 'Tisch');
      await t.prisma.translation.updateMany({ where: { wordId: tisch, text: 'asztal' }, data: { senseNote: 'étkezőasztal' } });
      // Az átfedő ablakon túlra kell lépni, hogy csak a valódi változás jöjjön.
      const page = await pull(cursor);
      const changed = page.words.find((w) => w.id === tisch);
      expect(changed).toBeDefined();
      expect(changed!.version).toBeGreaterThan(1);
    });

    it('törölt kártya tombstone-ként érkezik', async () => {
      const progressId = uuid();
      await push({ enrollments: [{ progressId, wordId: await wordId(t.prisma, 'Tisch'), cardType: 'RECOGNITION' }] }).expect(200);
      const { cursor } = await pullAll();
      await push({ cardChanges: [{ progressId, baseVersion: 1, changedAt: iso(Date.now()), deleted: true }] }).expect(200);
      const page = await pull(cursor);
      expect(page.progress.find((p) => p.id === progressId)?.deletedAt).not.toBeNull();
    });

    it('érvénytelen kurzor → 400', async () => {
      await t.http.get(`${API}/sync/pull`).set(user.auth).query({ cursor: 'nem-kurzor' }).expect(400);
    });

    it('más felhasználó kártyái és naplója nem jönnek le', async () => {
      const progressId = uuid();
      await push({
        enrollments: [{ progressId, wordId: await wordId(t.prisma, 'Tisch'), cardType: 'RECOGNITION' }],
        reviews: [{ reviewId: uuid(), progressId, grade: 4, responseTimeMs: 1000, reviewedAt: iso(Date.now()) }],
      }).expect(200);
      const other = await registerUser(t.http);
      const all = await pullAll(undefined, 500, other);
      expect(all.progress).toHaveLength(0);
      expect(all.reviewLogs).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  describe('push', () => {
    it('offline felvétel + értékelések: időrendben alkalmazza, akkor is, ha fordított sorrendben érkeznek', async () => {
      const progressId = uuid();
      const now = Date.now();
      const r1 = uuid();
      const r2 = uuid();
      const res = await push({
        deviceId: 'A',
        enrollments: [{ progressId, wordId: await wordId(t.prisma, 'Tisch'), cardType: 'RECOGNITION' }],
        reviews: [
          { reviewId: r2, progressId, grade: 4, responseTimeMs: 1000, reviewedAt: iso(now - 20 * MIN) },
          { reviewId: r1, progressId, grade: 4, responseTimeMs: 1000, reviewedAt: iso(now - 30 * MIN) },
        ],
      }).expect(200);

      expect(res.body.enrollments).toEqual([{ progressId, status: 'created', serverProgressId: progressId }]);
      expect(res.body.reviews.map((r: { reviewId: string; status: string }) => [r.reviewId, r.status])).toEqual([
        [r1, 'applied'],
        [r2, 'applied'],
      ]);
      const logs = await t.prisma.reviewLog.findMany({ where: { progressId }, orderBy: { reviewedAt: 'asc' } });
      expect(logs.map((l) => [l.id, l.stateBefore, l.stateAfter])).toEqual([
        [r1, CardState.NEW, CardState.LEARNING],
        [r2, CardState.LEARNING, CardState.REVIEW],
      ]);
    });

    it('a teljes köteg ismételt küldése idempotens', async () => {
      const progressId = uuid();
      const body = {
        enrollments: [{ progressId, wordId: await wordId(t.prisma, 'Tisch'), cardType: 'RECOGNITION' }],
        reviews: [{ reviewId: uuid(), progressId, grade: 4, responseTimeMs: 1000, reviewedAt: iso(Date.now() - MIN) }],
      };
      await push(body).expect(200);
      const before = await t.prisma.userProgress.findUniqueOrThrow({ where: { id: progressId } });

      const again = await push(body).expect(200);
      expect(again.body.enrollments[0].status).toBe('exists');
      expect(again.body.reviews[0].status).toBe('duplicate');
      expect(await t.prisma.userProgress.findUniqueOrThrow({ where: { id: progressId } })).toEqual(before);
      expect(await t.prisma.reviewLog.count({ where: { progressId } })).toBe(1);
    });

    it('két eszköz ugyanazt a szót veszi fel offline: egy kártya marad, mindkét eszköz értékelése megmarad', async () => {
      const tisch = await wordId(t.prisma, 'Tisch');
      const idA = uuid();
      const idB = uuid();
      const now = Date.now();

      await push({
        deviceId: 'A',
        enrollments: [{ progressId: idA, wordId: tisch, cardType: 'RECOGNITION' }],
        reviews: [{ reviewId: uuid(), progressId: idA, grade: 4, responseTimeMs: 1500, reviewedAt: iso(now - 40 * MIN) }],
      }).expect(200);
      const resB = await push({
        deviceId: 'B',
        enrollments: [{ progressId: idB, wordId: tisch, cardType: 'RECOGNITION' }],
        reviews: [{ reviewId: uuid(), progressId: idB, grade: 1, responseTimeMs: 5000, reviewedAt: iso(now - 35 * MIN) }],
      }).expect(200);

      // B megkapja a szerver azonosítóját, a saját értékelése arra íródik.
      expect(resB.body.enrollments[0]).toEqual({ progressId: idB, status: 'exists', serverProgressId: idA });
      expect(resB.body.reviews[0].status).toBe('applied');
      expect(await t.prisma.userProgress.count({ where: { userId: user.id } })).toBe(1);
      const card = await t.prisma.userProgress.findUniqueOrThrow({ where: { id: idA } });
      expect(card.totalReviews).toBe(2);
      const logs = await t.prisma.reviewLog.findMany({ where: { progressId: idA }, orderBy: { reviewedAt: 'asc' } });
      expect(logs.map((l) => l.deviceId)).toEqual(['A', 'B']);
    });

    it('két eszköz offline értékelései egy kártyán összefésülődnek (egyik sem vész el)', async () => {
      const progressId = uuid();
      const now = Date.now();
      await push({ enrollments: [{ progressId, wordId: await wordId(t.prisma, 'warten'), cardType: 'RECOGNITION' }] }).expect(200);

      // B később küldi fel a KORÁBBI értékelését: a szerver az időpontot normalizálja,
      // de az eseményt nem dobja el.
      await push({
        deviceId: 'A',
        reviews: [{ reviewId: uuid(), progressId, grade: 4, responseTimeMs: 1000, reviewedAt: iso(now - 10 * MIN) }],
      }).expect(200);
      await push({
        deviceId: 'B',
        reviews: [{ reviewId: uuid(), progressId, grade: 4, responseTimeMs: 1000, reviewedAt: iso(now - 20 * MIN) }],
      }).expect(200);

      const card = await t.prisma.userProgress.findUniqueOrThrow({ where: { id: progressId } });
      expect(card).toMatchObject({ totalReviews: 2, correctReviews: 2, state: CardState.REVIEW });
      expect(await t.prisma.reviewLog.count({ where: { progressId } })).toBe(2);
    });

    it('órakülönbség-korrekció: egy órával késő eszköz értékelése a valós időre kerül', async () => {
      const progressId = uuid();
      await push({ enrollments: [{ progressId, wordId: await wordId(t.prisma, 'Tisch'), cardType: 'RECOGNITION' }] }).expect(200);
      const now = Date.now();
      const res = await push({
        clientTime: iso(now - HOUR),
        reviews: [{ reviewId: uuid(), progressId, grade: 4, responseTimeMs: 1000, reviewedAt: iso(now - HOUR - 5 * MIN) }],
      }).expect(200);

      expect(res.body.clockOffsetMs).toBeGreaterThan(HOUR - 5000);
      const log = await t.prisma.reviewLog.findFirstOrThrow({ where: { progressId } });
      expect(Math.abs(log.reviewedAt.getTime() - (now - 5 * MIN))).toBeLessThan(10_000);
    });

    it('elutasított felvétel: ismeretlen szó, névelőkártya igéhez', async () => {
      const res = await push({
        enrollments: [
          { progressId: uuid(), wordId: uuid(), cardType: 'RECOGNITION' },
          { progressId: uuid(), wordId: await wordId(t.prisma, 'warten'), cardType: 'GENDER' },
        ],
      }).expect(200);
      expect(res.body.enrollments.map((e: { status: string; reason: string }) => [e.status, e.reason])).toEqual([
        ['rejected', 'unknown_word'],
        ['rejected', 'gender_not_applicable'],
      ]);
    });

    it('elkülönítés: más felhasználó kártyájára nem lehet értékelést vagy módosítást küldeni', async () => {
      const progressId = uuid();
      await push({ enrollments: [{ progressId, wordId: await wordId(t.prisma, 'Tisch'), cardType: 'RECOGNITION' }] }).expect(200);
      const intruder = await registerUser(t.http);

      const res = await push(
        {
          enrollments: [{ progressId, wordId: await wordId(t.prisma, 'warten'), cardType: 'RECOGNITION' }],
          cardChanges: [{ progressId, baseVersion: 1, changedAt: iso(Date.now()), isSuspended: true }],
          reviews: [{ reviewId: uuid(), progressId, grade: 1, responseTimeMs: 1000, reviewedAt: iso(Date.now()) }],
        },
        intruder,
      ).expect(200);
      expect(res.body.enrollments[0]).toMatchObject({ status: 'rejected', reason: 'id_conflict' });
      expect(res.body.cardChanges[0]).toMatchObject({ status: 'rejected', reason: 'card_not_found' });
      expect(res.body.reviews[0]).toMatchObject({ status: 'rejected', reason: 'card_not_found' });
      expect(await t.prisma.userProgress.findUniqueOrThrow({ where: { id: progressId } })).toMatchObject({
        userId: user.id,
        isSuspended: false,
        totalReviews: 0,
      });
    });

    it('kötegméret-korlát: 500 fölött 400', async () => {
      const reviews = Array.from({ length: 501 }, () => ({
        reviewId: uuid(),
        progressId: uuid(),
        grade: 4,
        responseTimeMs: 1,
        reviewedAt: iso(Date.now()),
      }));
      await push({ reviews }).expect(400);
    });
  });

  // ---------------------------------------------------------------------------
  describe('jelzők ütközéskezelése (LWW + verzió)', () => {
    let progressId: string;

    beforeEach(async () => {
      progressId = uuid();
      await push({ enrollments: [{ progressId, wordId: await wordId(t.prisma, 'Tisch'), cardType: 'RECOGNITION' }] }).expect(200);
    });

    const change = (baseVersion: number, changedAt: number, isSuspended: boolean) =>
      push({ cardChanges: [{ progressId, baseVersion, changedAt: iso(changedAt), isSuspended }] }).expect(200);

    it('aktuális verzión végzett módosítás alkalmazódik', async () => {
      const res = await change(1, Date.now(), true);
      expect(res.body.cardChanges[0].status).toBe('applied');
      expect(await t.prisma.userProgress.findUniqueOrThrow({ where: { id: progressId } })).toMatchObject({ isSuspended: true, version: 2 });
    });

    it('elavult verzió + régebbi időbélyeg → conflict, a szerver állapota marad', async () => {
      await change(1, Date.now(), true); // „A” eszköz: v1 → v2
      const res = await change(1, Date.now() - 10 * MIN, false); // „B” régebbi módosítása
      expect(res.body.cardChanges[0]).toMatchObject({ status: 'conflict', reason: 'server_newer' });
      expect(await t.prisma.userProgress.findUniqueOrThrow({ where: { id: progressId } })).toMatchObject({ isSuspended: true });
    });

    it('elavult verzió + újabb időbélyeg → az utolsó író nyer', async () => {
      await change(1, Date.now() - 5 * MIN, true);
      await new Promise((r) => setTimeout(r, 5));
      const res = await change(1, Date.now(), false);
      expect(res.body.cardChanges[0].status).toBe('applied');
      expect(await t.prisma.userProgress.findUniqueOrThrow({ where: { id: progressId } })).toMatchObject({ isSuspended: false });
    });

    it('regresszió: a később MÓDOSÍTÓ eszköz nyer akkor is, ha a másik szinkronizált előbb', async () => {
      const t1 = Date.now() - 10 * MIN; // B módosít (offline)
      const t2 = Date.now() - 5 * MIN; //  A módosít később (offline)
      await change(1, t1, true); //        B szinkronizál először → v2
      const res = await change(1, t2, false); // A szinkronizál utána, elavult verzióval
      expect(res.body.cardChanges[0].status).toBe('applied');
      const card = await t.prisma.userProgress.findUniqueOrThrow({ where: { id: progressId } });
      expect(card.isSuspended).toBe(false);
      expect(card.flagsChangedAt!.getTime()).toBe(t2);
    });

    it('a jelzőmódosítás nem írja felül az ütemezési állapotot (közben érkezett értékelés megmarad)', async () => {
      await push({ reviews: [{ reviewId: uuid(), progressId, grade: 5, responseTimeMs: 900, reviewedAt: iso(Date.now() - MIN) }] }).expect(
        200,
      );
      const res = await change(1, Date.now(), true);
      expect(res.body.cardChanges[0].status).toBe('applied');
      expect(await t.prisma.userProgress.findUniqueOrThrow({ where: { id: progressId } })).toMatchObject({
        isSuspended: true,
        state: CardState.REVIEW,
        totalReviews: 1,
      });
    });

    it('üres módosítás és ismeretlen kártya → rejected', async () => {
      const res = await push({
        cardChanges: [
          { progressId, baseVersion: 1, changedAt: iso(Date.now()) },
          { progressId: uuid(), baseVersion: 1, changedAt: iso(Date.now()), isSuspended: true },
        ],
      }).expect(200);
      expect(res.body.cardChanges.map((c: { reason: string }) => c.reason)).toEqual(['empty_change', 'card_not_found']);
    });

    it('törlés és visszaállítás', async () => {
      await change(1, Date.now(), true);
      await push({ cardChanges: [{ progressId, baseVersion: 2, changedAt: iso(Date.now()), deleted: true }] }).expect(200);
      expect((await t.prisma.userProgress.findUniqueOrThrow({ where: { id: progressId } })).deletedAt).not.toBeNull();
      await push({ cardChanges: [{ progressId, baseVersion: 3, changedAt: iso(Date.now()), deleted: false }] }).expect(200);
      expect((await t.prisma.userProgress.findUniqueOrThrow({ where: { id: progressId } })).deletedAt).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  it('végponttól végpontig: két eszköz kurzorral követi egymás változásait', async () => {
    const tisch = await wordId(t.prisma, 'Tisch');
    // Mindkét eszköz kezdeti teljes szinkronja.
    let cursorA = (await pullAll()).cursor;
    let cursorB = (await pullAll()).cursor;

    // A: felvétel + értékelés.
    const progressId = uuid();
    await push({
      deviceId: 'A',
      enrollments: [{ progressId, wordId: tisch, cardType: 'RECOGNITION' }],
      reviews: [{ reviewId: uuid(), progressId, grade: 4, responseTimeMs: 1000, reviewedAt: iso(Date.now() - MIN) }],
    }).expect(200);

    // B lehúzza.
    const pageB = await pullAll(cursorB);
    cursorB = pageB.cursor;
    const seenByB = pageB.progress.find((p) => p.id === progressId)!;
    expect(seenByB).toMatchObject({ state: 'LEARNING', totalReviews: 1 });
    expect(pageB.reviewLogs.filter((l) => l.progressId === progressId)).toHaveLength(1);

    // B felfüggeszti a látott verzión.
    await push({
      deviceId: 'B',
      cardChanges: [{ progressId, baseVersion: seenByB.version, changedAt: iso(Date.now()), isSuspended: true }],
    }).expect(200);

    // A lehúzza: a felfüggesztés és B naplója is megérkezik, a verzió nő.
    const pageA = await pullAll(cursorA);
    cursorA = pageA.cursor;
    const latest = pageA.progress.filter((p) => p.id === progressId).sort((a, b) => b.version - a.version)[0]!;
    expect(latest).toMatchObject({ isSuspended: true, totalReviews: 1 });
    expect(latest.version).toBeGreaterThan(seenByB.version);
  });
});
