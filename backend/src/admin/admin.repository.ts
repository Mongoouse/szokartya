import { Injectable } from '@nestjs/common';
import { CefrLevel, Prisma, ReportCategory, ReportStatus, WordReviewStatus } from '@prisma/client';
import { DbClient, PrismaService } from '../prisma/prisma.service';
import { WORD_DETAIL_INCLUDE } from '../words/word-detail';

/** Az admin nézet szóadata: a teljes adatlap + ellenőrzési adatok + nyitott bejelentések száma. */
export const ADMIN_WORD_INCLUDE = {
  ...WORD_DETAIL_INCLUDE,
  reviewedBy: { select: { email: true } },
  _count: { select: { reports: { where: { status: ReportStatus.OPEN } } } },
} satisfies Prisma.WordInclude;

export type AdminWord = Prisma.WordGetPayload<{ include: typeof ADMIN_WORD_INCLUDE }>;

export const ADMIN_REPORT_INCLUDE = {
  user: { select: { id: true, email: true, displayName: true } },
  resolvedBy: { select: { email: true } },
  word: { include: ADMIN_WORD_INCLUDE },
} satisfies Prisma.WordReportInclude;

export type AdminReport = Prisma.WordReportGetPayload<{ include: typeof ADMIN_REPORT_INCLUDE }>;

export interface AdminWordFilter {
  status?: WordReviewStatus;
  q?: string;
  cefrLevel?: CefrLevel;
  hasOpenReports?: boolean;
}

/** Csak a központi (kurált) szótár ellenőrizhető; a saját szavak a felhasználóé. */
const CENTRAL = { ownerId: null, deletedAt: null } as const;

@Injectable()
export class AdminRepository {
  constructor(private readonly prisma: PrismaService) {}

  // -------------------------------------------------------------------------
  // Szavak
  // -------------------------------------------------------------------------

  async findWordsPage(filter: AdminWordFilter, limit: number, offset: number): Promise<{ items: AdminWord[]; total: number }> {
    const where = this.wordWhere(filter);
    const [items, total] = await this.prisma.$transaction([
      this.prisma.word.findMany({
        where,
        include: ADMIN_WORD_INCLUDE,
        // Ugyanaz a sorrend, mint a tanulásban: a gyakori szavak ellenőrzése a legsürgetőbb.
        orderBy: [{ frequencyRank: { sort: 'asc', nulls: 'last' } }, { lemma: 'asc' }, { id: 'asc' }],
        take: limit,
        skip: offset,
      }),
      this.prisma.word.count({ where }),
    ]);
    return { items, total };
  }

  findCentralWord(id: string, db: DbClient = this.prisma): Promise<AdminWord | null> {
    return db.word.findFirst({ where: { id, ...CENTRAL }, include: ADMIN_WORD_INCLUDE });
  }

  /** @returns false, ha a szó verziója közben megváltozott (optimista konkurencia). */
  async setReviewStatus(
    id: string,
    data: { status: WordReviewStatus; adminId: string; now: Date; expectedVersion?: number },
    db: DbClient,
  ): Promise<boolean> {
    const reviewed = data.status !== WordReviewStatus.UNREVIEWED;
    const { count } = await db.word.updateMany({
      where: { id, ...CENTRAL, ...(data.expectedVersion ? { version: data.expectedVersion } : {}) },
      data: {
        reviewStatus: data.status,
        reviewedAt: reviewed ? data.now : null,
        reviewedById: reviewed ? data.adminId : null,
      },
    });
    return count === 1;
  }

  /**
   * A magyar jelentések cseréje: a listában nem szereplők puhán törlődnek, a
   * szereplők (akár korábban törölt sorként) visszaállnak, a sorrend és az
   * elsődleges jelentés a lista szerint áll be. A szó verziója a
   * `touch_parent_word` trigger miatt lép, így a javítás minden eszközre leszinkronizálódik.
   */
  async replaceTranslations(wordId: string, texts: string[], now: Date, db: DbClient): Promise<void> {
    const existing = await db.translation.findMany({ where: { wordId, language: 'hu' } });
    // Előbb minden elsődleges jelzőt levesszük: a „szavanként egy elsődleges” részleges
    // egyedi index különben a csere közben sérülne.
    await db.translation.updateMany({ where: { wordId, language: 'hu', isPrimary: true }, data: { isPrimary: false } });
    const keep = new Set(texts);
    const toDelete = existing.filter((t) => !keep.has(t.text) && t.deletedAt === null).map((t) => t.id);
    if (toDelete.length > 0) {
      await db.translation.updateMany({ where: { id: { in: toDelete } }, data: { deletedAt: now } });
    }
    for (const [i, text] of texts.entries()) {
      const fields = { isPrimary: i === 0, sortOrder: i, deletedAt: null };
      await db.translation.upsert({
        where: { wordId_language_text: { wordId, language: 'hu', text } },
        update: fields,
        create: { wordId, language: 'hu', text, ...fields },
      });
    }
  }

  private wordWhere(filter: AdminWordFilter): Prisma.WordWhereInput {
    const and: Prisma.WordWhereInput[] = [CENTRAL];
    if (filter.status) and.push({ reviewStatus: filter.status });
    if (filter.cefrLevel) and.push({ cefrLevel: filter.cefrLevel });
    if (filter.hasOpenReports) and.push({ reports: { some: { status: ReportStatus.OPEN } } });
    if (filter.q?.trim()) {
      const q = filter.q.trim();
      and.push({
        OR: [
          { lemma: { contains: q, mode: 'insensitive' } },
          { translations: { some: { deletedAt: null, text: { contains: q, mode: 'insensitive' } } } },
        ],
      });
    }
    return { AND: and };
  }

  // -------------------------------------------------------------------------
  // Bejelentések
  // -------------------------------------------------------------------------

  async findReportsPage(
    filter: { status?: ReportStatus; category?: ReportCategory },
    limit: number,
    offset: number,
  ): Promise<{ items: AdminReport[]; total: number }> {
    const where: Prisma.WordReportWhereInput = { status: filter.status, category: filter.category };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.wordReport.findMany({
        where,
        include: ADMIN_REPORT_INCLUDE,
        // A legrégebb óta várakozó elöl (FIFO ügyintézés).
        orderBy: [{ receivedAt: 'asc' }, { id: 'asc' }],
        take: limit,
        skip: offset,
      }),
      this.prisma.wordReport.count({ where }),
    ]);
    return { items, total };
  }

  findReport(id: string): Promise<AdminReport | null> {
    return this.prisma.wordReport.findUnique({ where: { id }, include: ADMIN_REPORT_INCLUDE });
  }

  async updateReport(id: string, data: { status: ReportStatus; adminNote?: string; adminId: string; now: Date }): Promise<boolean> {
    const open = data.status === ReportStatus.OPEN;
    const { count } = await this.prisma.wordReport.updateMany({
      where: { id },
      data: {
        status: data.status,
        resolvedAt: open ? null : data.now,
        resolvedById: open ? null : data.adminId,
        ...(data.adminNote !== undefined ? { adminNote: data.adminNote.trim() } : {}),
      },
    });
    return count === 1;
  }

  // -------------------------------------------------------------------------
  // Összesítés
  // -------------------------------------------------------------------------

  async summary() {
    const [words, reports, categories, avg] = await Promise.all([
      this.prisma.word.groupBy({ by: ['reviewStatus'], where: CENTRAL, _count: { _all: true } }),
      this.prisma.wordReport.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.wordReport.groupBy({ by: ['category'], _count: { _all: true } }),
      this.prisma.$queryRaw<{ hours: number | null }[]>`
        SELECT avg(extract(epoch FROM resolved_at - received_at)) / 3600 AS hours
          FROM word_reports WHERE status <> 'OPEN'`,
    ]);
    return {
      words: words.map((w) => ({ key: w.reviewStatus, n: w._count._all })),
      reports: reports.map((r) => ({ key: r.status, n: r._count._all })),
      categories: categories.map((c) => ({ key: c.category, n: c._count._all })),
      avgResolutionHours: avg[0]?.hours == null ? null : Number(avg[0].hours),
    };
  }
}
