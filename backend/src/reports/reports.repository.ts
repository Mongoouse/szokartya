import { Injectable } from '@nestjs/common';
import { CardType, ReportCategory, WordReport } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface CreateReportData {
  id: string;
  userId: string;
  wordId: string;
  cardType: CardType | null;
  category: ReportCategory;
  message: string;
  createdAt: Date;
}

@Injectable()
export class ReportsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(id: string): Promise<WordReport | null> {
    return this.prisma.wordReport.findUnique({ where: { id } });
  }

  create(data: CreateReportData): Promise<WordReport> {
    return this.prisma.wordReport.create({ data });
  }

  /** A felhasználó saját bejelentései, a legfrissebb elöl, a szó lemmájával. */
  findByUser(userId: string, limit: number) {
    return this.prisma.wordReport.findMany({
      where: { userId },
      include: { word: { select: { lemma: true } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      take: limit,
    });
  }
}
