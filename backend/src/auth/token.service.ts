import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes } from 'node:crypto';
import { AppConfigService } from '../config/app-config.service';
import type { AccessTokenPayload } from '../common/guards/jwt-auth.guard';

export interface IssuedAccessToken {
  token: string;
  expiresInSeconds: number;
}

export interface GeneratedRefreshToken {
  /** A kliensnek átadott nyers érték – soha nem kerül az adatbázisba. */
  token: string;
  /** SHA-256 hex – ez tárolódik. */
  hash: string;
  expiresAt: Date;
}

/**
 * Tokenek előállítása.
 *
 * - Access token: HS256 JWT, rövid élettartam, állapotmentesen ellenőrizhető.
 * - Refresh token: 256 bites véletlen, átlátszatlan (opaque) érték. Nem JWT,
 *   mert úgyis adatbázis-lookuppal kell ellenőrizni (visszavonás, rotáció), így
 *   a JWT önleíró jellege csak felesleges támadási felület lenne.
 *   Tárolás SHA-256 hash-ként: magas entrópiájú értéknél a lassú hash (argon2)
 *   nem ad többletvédelmet, a gyors hash viszont egyedi indexszel kereshető.
 */
@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: AppConfigService,
  ) {}

  async issueAccessToken(user: { id: string; email: string }): Promise<IssuedAccessToken> {
    const payload: AccessTokenPayload = { sub: user.id, email: user.email, typ: 'access' };
    const expiresInSeconds = this.config.jwtAccessTtlSeconds;
    const token = await this.jwt.signAsync(payload, { expiresIn: expiresInSeconds, algorithm: 'HS256' });
    return { token, expiresInSeconds };
  }

  generateRefreshToken(now: Date): GeneratedRefreshToken {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(now.getTime() + this.config.refreshTokenTtlDays * 86_400_000);
    return { token, hash: TokenService.hashRefreshToken(token), expiresAt };
  }

  static hashRefreshToken(token: string): string {
    return createHash('sha256').update(token, 'utf8').digest('hex');
  }
}
