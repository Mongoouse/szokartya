import { Body, Controller, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { AuthenticatedUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { AuthService, ClientContext } from './auth.service';
import { AuthTokensDto, LoginDto, RefreshTokenDto, RegisterDto } from './dto/auth.dto';

/** Brute-force elleni korlát a hitelesítési végpontokon: IP-nként 10 kérés / perc. */
const AUTH_THROTTLE = { default: { limit: 10, ttl: 60_000 } };

@ApiTags('auth')
@ApiTooManyRequestsResponse({ description: 'Túl sok kérés – próbáld újra később' })
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('register')
  @ApiOperation({ summary: 'Regisztráció', description: 'Új fiók létrehozása; sikeres regisztráció után bejelentkezett munkamenetet ad.' })
  @ApiCreatedResponse({ type: AuthTokensDto })
  @ApiBadRequestResponse({ description: 'Validációs hiba' })
  @ApiConflictResponse({ description: 'Az e-mail cím már foglalt' })
  register(@Body() dto: RegisterDto, @Req() req: Request): Promise<AuthTokensDto> {
    return this.auth.register(dto, clientContext(req));
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Bejelentkezés e-mail címmel és jelszóval' })
  @ApiOkResponse({ type: AuthTokensDto })
  @ApiUnauthorizedResponse({ description: 'Hibás e-mail cím vagy jelszó' })
  login(@Body() dto: LoginDto, @Req() req: Request): Promise<AuthTokensDto> {
    return this.auth.login(dto, clientContext(req));
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Token frissítés (rotáció)',
    description:
      'Új access és refresh tokent ad; a bemutatott refresh token érvénytelenné válik. ' +
      'Egy már lecserélt token ismételt használata a teljes munkamenet-család visszavonását váltja ki.',
  })
  @ApiOkResponse({ type: AuthTokensDto })
  @ApiUnauthorizedResponse({ description: 'Érvénytelen, lejárt vagy már felhasznált refresh token' })
  refresh(@Body() dto: RefreshTokenDto, @Req() req: Request): Promise<AuthTokensDto> {
    return this.auth.refresh(dto.refreshToken, clientContext(req));
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Kijelentkezés az aktuális eszközről (idempotens)' })
  @ApiNoContentResponse()
  logout(@Body() dto: RefreshTokenDto): Promise<void> {
    return this.auth.logout(dto.refreshToken);
  }

  @ApiBearerAuth()
  @Post('logout-all')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Kijelentkezés minden eszközről' })
  @ApiNoContentResponse()
  @ApiUnauthorizedResponse({ description: 'Hiányzó vagy érvénytelen access token' })
  logoutAll(@CurrentUser() user: AuthenticatedUser): Promise<void> {
    return this.auth.logoutAll(user.id);
  }
}

function clientContext(req: Request): ClientContext {
  const userAgent = req.headers['user-agent'];
  return { userAgent: typeof userAgent === 'string' ? userAgent : null, ipAddress: req.ip ?? null };
}
