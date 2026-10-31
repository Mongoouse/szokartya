import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ReportCategory, ReportStatus, WordReviewStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ReportDto } from '../reports/dto/report.dto';
import { WordDto } from '../words/dto/word.dto';
import { AdminRepository, AdminReport, AdminWord } from './admin.repository';
import {
  AdminReportDto,
  AdminReportPageDto,
  AdminReportQueryDto,
  AdminSummaryDto,
  AdminWordDto,
  AdminWordPageDto,
  AdminWordQueryDto,
  UpdateReportDto,
  UpdateWordReviewDto,
} from './dto/admin.dto';

/**
 * Adminisztráció: a központi szókincs emberi ellenőrzése és a felhasználói
 * hibabejelentések kezelése. Minden módosítás a szó verzióját lépteti, ezért
 * a javítás a következő szinkronnál minden eszközre eljut.
 */
@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: AdminRepository,
  ) {}

  async words(query: AdminWordQueryDto): Promise<AdminWordPageDto> {
    const { items, total } = await this.repo.findWordsPage(
      { status: query.status, q: query.q, cefrLevel: query.cefrLevel, hasOpenReports: query.hasOpenReports },
      query.limit,
      query.offset,
    );
    return { items: items.map(toAdminWord), total, limit: query.limit, offset: query.offset };
  }

  async word(id: string): Promise<AdminWordDto> {
    const word = await this.repo.findCentralWord(id);
    if (!word) throw new NotFoundException('A szó nem található (csak a központi szótár szavai ellenőrizhetők)');
    return toAdminWord(word);
  }

  /** Státusz és/vagy jelentések módosítása egy tranzakcióban. */
  async updateWord(adminId: string, id: string, dto: UpdateWordReviewDto, now: Date = new Date()): Promise<AdminWordDto> {
    if (dto.reviewStatus === undefined && dto.translations === undefined) {
      throw new BadRequestException('Nincs módosítandó mező (reviewStatus vagy translations)');
    }
    const translations = dto.translations?.map((t) => t.trim());

    await this.prisma.$transaction(async (tx) => {
      const current = await this.repo.findCentralWord(id, tx);
      if (!current) throw new NotFoundException('A szó nem található (csak a központi szótár szavai ellenőrizhetők)');
      if (dto.expectedVersion !== undefined && current.version !== dto.expectedVersion) {
        throw new ConflictException('A szót közben módosították – töltsd újra');
      }
      if (translations) {
        await this.repo.replaceTranslations(id, translations, now, tx);
      }
      // Javított jelentés + státusz nélkül: a javítás maga is ellenőrzés.
      const status = dto.reviewStatus ?? (translations ? WordReviewStatus.VERIFIED : current.reviewStatus);
      await this.repo.setReviewStatus(id, { status, adminId, now }, tx);
    });
    return this.word(id);
  }

  async reports(query: AdminReportQueryDto): Promise<AdminReportPageDto> {
    const { items, total } = await this.repo.findReportsPage({ status: query.status, category: query.category }, query.limit, query.offset);
    return { items: items.map(toAdminReport), total, limit: query.limit, offset: query.offset };
  }

  async updateReport(adminId: string, id: string, dto: UpdateReportDto, now: Date = new Date()): Promise<AdminReportDto> {
    const updated = await this.repo.updateReport(id, { status: dto.status, adminNote: dto.adminNote, adminId, now });
    if (!updated) throw new NotFoundException('A bejelentés nem található');
    const report = await this.repo.findReport(id);
    return toAdminReport(report!);
  }

  async summary(): Promise<AdminSummaryDto> {
    const s = await this.repo.summary();
    return {
      words: countsByKey(Object.values(WordReviewStatus), s.words),
      reports: countsByKey(Object.values(ReportStatus), s.reports),
      reportsByCategory: countsByKey(Object.values(ReportCategory), s.categories),
      avgResolutionHours: s.avgResolutionHours === null ? null : Math.round(s.avgResolutionHours * 10) / 10,
    };
  }
}

function toAdminWord(w: AdminWord): AdminWordDto {
  return {
    ...WordDto.fromEntity(w),
    reviewStatus: w.reviewStatus,
    reviewedAt: w.reviewedAt,
    reviewedBy: w.reviewedBy?.email ?? null,
    openReports: w._count.reports,
    version: w.version,
  };
}

function toAdminReport(r: AdminReport): AdminReportDto {
  return {
    ...ReportDto.fromEntity(r),
    receivedAt: r.receivedAt,
    reporter: { id: r.user.id, email: r.user.email, displayName: r.user.displayName },
    resolvedBy: r.resolvedBy?.email ?? null,
    word: toAdminWord(r.word),
  };
}

/** Minden kulcs szerepel (0-val is), így a kliensnek nem kell hiányzó kulccsal számolnia. */
function countsByKey<K extends string>(keys: K[], rows: { key: K; n: number }[]): Record<K, number> {
  const out = Object.fromEntries(keys.map((k) => [k, 0])) as Record<K, number>;
  for (const r of rows) out[r.key] = r.n;
  return out;
}
