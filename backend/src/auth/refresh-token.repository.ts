import { Injectable } from '@nestjs/common';
import { RefreshToken } from '@prisma/client';
import { DbClient, PrismaService } from '../prisma/prisma.service';

export interface CreateRefreshTokenData {
  userId: string;
  tokenHash: string;
  familyId: string;
  expiresAt: Date;
  deviceId?: string | null;
  userAgent?: string | null;
  ipAddress?: string | null;
}

/** A `refresh_tokens` tábla adatelérési rétege. */
@Injectable()
export class RefreshTokenRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByHash(tokenHash: string, db: DbClient = this.prisma): Promise<RefreshToken | null> {
    return db.refreshToken.findUnique({ where: { tokenHash } });
  }

  create(data: CreateRefreshTokenData, db: DbClient = this.prisma): Promise<RefreshToken> {
    return db.refreshToken.create({ data });
  }

  /**
   * Feltételes visszavonás + lecserélés: csak akkor sikeres, ha a token még nem
   * volt visszavonva. Két párhuzamos frissítés közül így pontosan egy nyer.
   * @returns true, ha ez a hívás vonta vissza a tokent.
   */
  async markRotated(id: string, replacedById: string, now: Date, db: DbClient = this.prisma): Promise<boolean> {
    const { count } = await db.refreshToken.updateMany({
      where: { id, revokedAt: null },
      data: { revokedAt: now, replacedById },
    });
    return count === 1;
  }

  async revokeFamily(familyId: string, now: Date, db: DbClient = this.prisma): Promise<number> {
    const { count } = await db.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: now },
    });
    return count;
  }

  async revokeAllForUser(userId: string, now: Date, db: DbClient = this.prisma): Promise<number> {
    const { count } = await db.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: now },
    });
    return count;
  }
}
