import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ReportCategory } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { WordsRepository } from '../words/words.repository';
import { CreateReportDto, MyReportDto, ReportDto, ReportSubmitResultDto, ReportSubmitStatus } from './dto/report.dto';
import { ReportsRepository } from './reports.repository';

/**
 * Felhasználói hibabejelentések. Ugyanaz a logika szolgálja ki az online
 * végpontot (`POST /reports`) és a szinkron push `reports` mezőjét.
 */
@Injectable()
export class ReportsService {
  constructor(
    private readonly reports: ReportsRepository,
    private readonly words: WordsRepository,
  ) {}

  /**
   * Idempotens felvétel: ugyanazzal az azonosítóval ismételt küldés → `exists`.
   * Csak a felhasználó számára látható szóra lehet bejelenteni.
   *
   * @param receivedAt a szerver ideje; a kliens által küldött `createdAt` ennél
   *        későbbi nem lehet (órakülönbség).
   */
  async submit(userId: string, dto: CreateReportDto, receivedAt: Date = new Date()): Promise<ReportSubmitResultDto> {
    const id = dto.id ?? randomUUID();
    const existing = await this.reports.findById(id);
    if (existing) {
      return existing.userId === userId
        ? { reportId: id, status: ReportSubmitStatus.EXISTS }
        : { reportId: id, status: ReportSubmitStatus.REJECTED, reason: 'id_conflict' };
    }

    const word = await this.words.findVisibleById(userId, dto.wordId);
    if (!word) {
      return { reportId: id, status: ReportSubmitStatus.REJECTED, reason: 'unknown_word' };
    }

    const createdAt = dto.createdAt && dto.createdAt < receivedAt ? dto.createdAt : receivedAt;
    try {
      await this.reports.create({
        id,
        userId,
        wordId: dto.wordId,
        cardType: dto.cardType ?? null,
        category: dto.category ?? ReportCategory.OTHER,
        message: dto.message.trim(),
        createdAt,
      });
      return { reportId: id, status: ReportSubmitStatus.CREATED };
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        // Párhuzamos küldés ugyanazzal az azonosítóval.
        const raced = await this.reports.findById(id);
        return raced?.userId === userId
          ? { reportId: id, status: ReportSubmitStatus.EXISTS }
          : { reportId: id, status: ReportSubmitStatus.REJECTED, reason: 'id_conflict' };
      }
      throw err;
    }
  }

  /** Online végpont: elutasításnál HTTP-hibát ad, sikernél a tárolt bejelentést. */
  async submitOrThrow(userId: string, dto: CreateReportDto): Promise<ReportDto> {
    const result = await this.submit(userId, dto);
    if (result.status === ReportSubmitStatus.REJECTED) {
      if (result.reason === 'unknown_word') throw new NotFoundException('A szó nem található');
      throw new ConflictException('Az azonosító már foglalt');
    }
    const stored = await this.reports.findById(result.reportId);
    return ReportDto.fromEntity(stored!);
  }

  async mine(userId: string, limit = 100): Promise<MyReportDto[]> {
    const rows = await this.reports.findByUser(userId, limit);
    return rows.map((r) => ({ ...ReportDto.fromEntity(r), word: r.word.lemma }));
  }
}
