import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import type { AuthenticatedRequest } from '../decorators/current-user.decorator';

/** Az access token tartalma. */
export interface AccessTokenPayload {
  sub: string;
  email: string;
  typ: 'access';
}

/**
 * Globális, állapotmentes hitelesítés: a Bearer access tokent aláírás és
 * lejárat alapján ellenőrzi, adatbázis-lekérdezés nélkül.
 *
 * Indoklás: a rövid élettartamú (15 perces) access token miatt nincs szükség
 * kérésenkénti visszavonás-ellenőrzésre; a visszavonás a refresh token
 * szintjén történik. (Passport helyett közvetlen JwtService: kevesebb réteg,
 * ugyanaz a biztonsági garancia.)
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [context.getHandler(), context.getClass()]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = extractBearerToken(request.headers.authorization);
    if (!token) {
      throw new UnauthorizedException('Hiányzó access token');
    }

    let payload: AccessTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<AccessTokenPayload>(token, { algorithms: ['HS256'] });
    } catch {
      throw new UnauthorizedException('Érvénytelen vagy lejárt access token');
    }
    if (payload.typ !== 'access' || typeof payload.sub !== 'string') {
      throw new UnauthorizedException('Érvénytelen access token');
    }

    request.user = { id: payload.sub, email: payload.email };
    return true;
  }
}

function extractBearerToken(header: string | undefined): string | null {
  if (!header) {
    return null;
  }
  const [scheme, value] = header.split(' ');
  return scheme?.toLowerCase() === 'bearer' && value ? value : null;
}
