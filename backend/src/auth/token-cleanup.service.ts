import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { RefreshTokenRepository } from './refresh-token.repository';

/** Ennyivel a lejárat után törlünk (óraeltérés, folyamatban lévő kérések). */
const GRACE_MS = 24 * 60 * 60 * 1000;

/**
 * A lejárt refresh tokenek ütemezett takarítása (az `expires_at` index ezt
 * szolgálja ki). Csak a LEJÁRT tokenek törölhetők: a visszavont, de még
 * érvényes idejű tokenek kellenek az újrafelhasználás-detektáláshoz (egy
 * ellopott, már lecserélt token bemutatása a teljes családot visszavonja).
 */
@Injectable()
export class TokenCleanupService {
  private readonly logger = new Logger(TokenCleanupService.name);

  constructor(private readonly refreshTokens: RefreshTokenRepository) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM, { name: 'refresh-token-cleanup' })
  async purgeExpired(now: Date = new Date()): Promise<number> {
    const deleted = await this.refreshTokens.deleteExpiredBefore(new Date(now.getTime() - GRACE_MS));
    if (deleted > 0) {
      this.logger.log(`${deleted} lejárt refresh token törölve`);
    }
    return deleted;
  }
}
