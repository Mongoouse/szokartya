import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AuthenticatedUser, CurrentUser } from '../common/decorators/current-user.decorator';
import {
  EnrollCardsDto,
  EnrollResultDto,
  QueueQueryDto,
  ReviewResultDto,
  StudyCardDto,
  StudyQueueDto,
  StudyStatsDto,
  SubmitReviewDto,
  SuspendCardDto,
} from './dto/study.dto';
import { RepetitionService } from './repetition.service';

@ApiTags('study')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Hiányzó vagy érvénytelen access token' })
@Controller('study')
export class RepetitionController {
  constructor(private readonly repetition: RepetitionService) {}

  @Get('queue')
  @ApiOperation({
    summary: 'Napi kártyasor',
    description: 'Tanulási lépcsőn lévő, ma esedékes és új kártyák a felhasználó napi keretei és időzónája szerint.',
  })
  @ApiOkResponse({ type: StudyQueueDto })
  queue(@CurrentUser() user: AuthenticatedUser, @Query() query: QueueQueryDto): Promise<StudyQueueDto> {
    return this.repetition.getDailyQueue(user.id, query.limit);
  }

  @Post('cards')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Szavak felvétele a tanulandók közé', description: 'Idempotens: a már felvett kártyákat kihagyja.' })
  @ApiOkResponse({ type: EnrollResultDto })
  enroll(@CurrentUser() user: AuthenticatedUser, @Body() dto: EnrollCardsDto): Promise<EnrollResultDto> {
    return this.repetition.enroll(user.id, dto);
  }

  @Post('cards/:progressId/reviews')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Kártya értékelése',
    description:
      'Feldolgozza a választ, újraszámolja az intervallumot és a nehézségi faktort (módosított SM-2), ' +
      'majd tranzakcióban menti az állapotot és a naplót. A reviewId alapján idempotens.',
  })
  @ApiOkResponse({ type: ReviewResultDto })
  @ApiNotFoundResponse({ description: 'A kártya nem található' })
  @ApiConflictResponse({ description: 'Felfüggesztett kártya, vagy a reviewId már másik kártyához tartozik' })
  review(
    @CurrentUser() user: AuthenticatedUser,
    @Param('progressId', ParseUUIDPipe) progressId: string,
    @Body() dto: SubmitReviewDto,
  ): Promise<ReviewResultDto> {
    return this.repetition.submitReview(user.id, progressId, dto);
  }

  @Patch('cards/:progressId')
  @ApiOperation({ summary: 'Kártya felfüggesztése / visszaállítása' })
  @ApiOkResponse({ type: StudyCardDto })
  @ApiNotFoundResponse({ description: 'A kártya nem található' })
  suspend(
    @CurrentUser() user: AuthenticatedUser,
    @Param('progressId', ParseUUIDPipe) progressId: string,
    @Body() dto: SuspendCardDto,
  ): Promise<StudyCardDto> {
    return this.repetition.setSuspended(user.id, progressId, dto.isSuspended);
  }

  @Get('stats')
  @ApiOperation({
    summary: 'Tanulási statisztika',
    description: 'Kártyák állapot szerint, esedékesség, pontosság, hibagyakoriság, reakcióidő.',
  })
  @ApiOkResponse({ type: StudyStatsDto })
  stats(@CurrentUser() user: AuthenticatedUser): Promise<StudyStatsDto> {
    return this.repetition.getStats(user.id);
  }
}
