import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';
import { ApiBadRequestResponse, ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { AuthenticatedUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { PullQueryDto, PullResponseDto, PushRequestDto, PushResponseDto } from './dto/sync.dto';
import { SyncService } from './sync.service';

@ApiTags('sync')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Hiányzó vagy érvénytelen access token' })
@Controller('sync')
export class SyncController {
  constructor(private readonly sync: SyncService) {}

  @Get('pull')
  @ApiOperation({
    summary: 'Változások lehúzása',
    description:
      'A kurzor óta változott kártyák, szavak és értékelések (törölt tételek tombstone-ként). ' +
      'Amíg hasMore = true, a klienst azonnal újra kell hívnia a kapott kurzorral.',
  })
  @ApiOkResponse({ type: PullResponseDto })
  @ApiBadRequestResponse({ description: 'Érvénytelen kurzor – teljes újraszinkron szükséges' })
  pull(@CurrentUser() user: AuthenticatedUser, @Query() query: PullQueryDto): Promise<PullResponseDto> {
    return this.sync.pull(user.id, query.cursor, query.limit);
  }

  @Post('push')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Offline módosítások feltöltése',
    description:
      'Kártyafelvételek, felfüggesztés/törlés és értékelések kötegelt feltöltése. Idempotens: ' +
      'ugyanaz a köteg ismételten elküldhető. Az eredmény tételenként jelzi a sikert vagy a konfliktust.',
  })
  @ApiOkResponse({ type: PushResponseDto })
  push(@CurrentUser() user: AuthenticatedUser, @Body() dto: PushRequestDto): Promise<PushResponseDto> {
    return this.sync.push(user.id, dto);
  }
}
