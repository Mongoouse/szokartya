import { ConflictException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { Prisma, User } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { DbClient, PrismaService } from '../prisma/prisma.service';
import { UserDto } from '../users/dto/user.dto';
import { UsersRepository } from '../users/users.repository';
import { AuthTokensDto, LoginDto, RegisterDto } from './dto/auth.dto';
import { PasswordService } from './password.service';
import { RefreshTokenRepository } from './refresh-token.repository';
import { TokenService } from './token.service';

/** A kérés környezete, amelyet a munkamenethez naplózunk. */
export interface ClientContext {
  userAgent?: string | null;
  ipAddress?: string | null;
}

const INVALID_CREDENTIALS = 'Hibás e-mail cím vagy jelszó';
const INVALID_REFRESH = 'Érvénytelen vagy lejárt refresh token';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersRepository,
    private readonly refreshTokens: RefreshTokenRepository,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
  ) {}

  async register(dto: RegisterDto, ctx: ClientContext): Promise<AuthTokensDto> {
    const passwordHash = await this.passwords.hash(dto.password);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const user = await this.users.create(
          { email: dto.email, passwordHash, displayName: dto.displayName ?? null, timezone: dto.timezone },
          tx,
        );
        const session = await this.startSession(user, randomUUID(), dto.deviceId, ctx, tx);
        return session.tokens;
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Ezzel az e-mail címmel már létezik fiók');
      }
      throw e;
    }
  }

  async login(dto: LoginDto, ctx: ClientContext): Promise<AuthTokensDto> {
    const user = await this.users.findActiveByEmail(dto.email);
    const valid = user
      ? await this.passwords.verify(user.passwordHash, dto.password)
      : await this.passwords.verifyAgainstDummy(dto.password);
    if (!user || !valid) {
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }
    if (this.passwords.needsRehash(user.passwordHash)) {
      // Paraméter-szigorítás után a hash a következő sikeres belépéskor frissül.
      await this.users.updatePasswordHash(user.id, await this.passwords.hash(dto.password));
    }
    const session = await this.startSession(user, randomUUID(), dto.deviceId, ctx, this.prisma);
    return session.tokens;
  }

  /**
   * Refresh token rotáció újrafelhasználás-detektálással (OAuth 2.0 Security
   * BCP, „refresh token rotation”):
   *  1. A bemutatott token érvényes → visszavonjuk, és ugyanabban a családban
   *     újat adunk ki.
   *  2. A token már vissza volt vonva → valaki egy régi, lecserélt tokent
   *     használ (lopás gyanúja): a TELJES családot visszavonjuk, így a
   *     támadó és a jogos kliens is újra bejelentkezésre kényszerül.
   */
  async refresh(rawToken: string, ctx: ClientContext): Promise<AuthTokensDto> {
    const now = new Date();
    const tokenHash = TokenService.hashRefreshToken(rawToken);

    const outcome = await this.prisma.$transaction(async (tx) => {
      const existing = await this.refreshTokens.findByHash(tokenHash, tx);
      if (!existing) {
        return { kind: 'invalid' as const };
      }
      if (existing.revokedAt) {
        await this.refreshTokens.revokeFamily(existing.familyId, now, tx);
        return { kind: 'reuse' as const, familyId: existing.familyId, userId: existing.userId };
      }
      if (existing.expiresAt <= now) {
        return { kind: 'invalid' as const };
      }
      const user = await this.users.findActiveById(existing.userId, tx);
      if (!user) {
        return { kind: 'invalid' as const };
      }

      const session = await this.startSession(user, existing.familyId, existing.deviceId, ctx, tx);
      const newTokenId = session.refreshTokenId;
      const won = await this.refreshTokens.markRotated(existing.id, newTokenId, now, tx);
      if (!won) {
        // Párhuzamos kérés már lecserélte ugyanezt a tokent → újrafelhasználás.
        // A kivétel visszagörgeti a fenti új tokent is.
        throw new UnauthorizedException(INVALID_REFRESH);
      }
      return { kind: 'ok' as const, tokens: session.tokens };
    });

    switch (outcome.kind) {
      case 'ok':
        return outcome.tokens;
      case 'reuse':
        this.logger.warn(`Refresh token újrafelhasználás: user=${outcome.userId} family=${outcome.familyId} – család visszavonva`);
        throw new UnauthorizedException(INVALID_REFRESH);
      case 'invalid':
        throw new UnauthorizedException(INVALID_REFRESH);
    }
  }

  /** Kijelentkezés az aktuális eszközről: a token teljes családját visszavonja. Idempotens. */
  async logout(rawToken: string): Promise<void> {
    const existing = await this.refreshTokens.findByHash(TokenService.hashRefreshToken(rawToken));
    if (existing) {
      await this.refreshTokens.revokeFamily(existing.familyId, new Date());
    }
  }

  /** Kijelentkezés minden eszközről. */
  async logoutAll(userId: string): Promise<void> {
    await this.refreshTokens.revokeAllForUser(userId, new Date());
  }

  private async startSession(
    user: User,
    familyId: string,
    deviceId: string | null | undefined,
    ctx: ClientContext,
    db: DbClient,
  ): Promise<{ tokens: AuthTokensDto; refreshTokenId: string }> {
    const now = new Date();
    const refresh = this.tokens.generateRefreshToken(now);
    const stored = await this.refreshTokens.create(
      {
        userId: user.id,
        tokenHash: refresh.hash,
        familyId,
        expiresAt: refresh.expiresAt,
        deviceId: deviceId ?? null,
        userAgent: ctx.userAgent?.slice(0, 512) ?? null,
        ipAddress: ctx.ipAddress ?? null,
      },
      db,
    );
    const access = await this.tokens.issueAccessToken(user);
    return {
      refreshTokenId: stored.id,
      tokens: {
        accessToken: access.token,
        accessTokenExpiresIn: access.expiresInSeconds,
        refreshToken: refresh.token,
        refreshTokenExpiresAt: refresh.expiresAt,
        user: UserDto.fromEntity(user),
      },
    };
  }
}
