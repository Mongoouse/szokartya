import { Body, Controller, Delete, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiBearerAuth, ApiNoContentResponse, ApiOperation, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthenticatedUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthService } from './auth.service';
import { DeleteAccountDto } from './dto/auth.dto';

/**
 * Fióktörlés. A `users` útvonal alatt van, de a jelszó-ellenőrzés miatt a
 * hitelesítési modul része (így a felhasználói modul nem függ az auth modultól).
 */
@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class AccountController {
  constructor(private readonly auth: AuthService) {}

  @Delete('me')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Fiók végleges törlése',
    description: 'A jelszó megerősítése után minden adatot töröl: munkamenetek, saját szavak, kártyák, értékelési napló.',
  })
  @ApiNoContentResponse()
  @ApiUnauthorizedResponse({ description: 'Hibás jelszó vagy érvénytelen access token' })
  delete(@CurrentUser() user: AuthenticatedUser, @Body() dto: DeleteAccountDto): Promise<void> {
    return this.auth.deleteAccount(user.id, dto.password);
  }
}
