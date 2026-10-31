import { Body, Controller, Get, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AuthenticatedUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { CreateReportDto, MyReportDto, ReportDto } from './dto/report.dto';
import { ReportsService } from './reports.service';

@ApiTags('reports')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Hiányzó vagy érvénytelen access token' })
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Post()
  @ApiOperation({
    summary: 'Hibabejelentés egy szóról',
    description: 'Szabad szöveges bejelentés (pl. hibás fordítás). Offline rögzítéshez a szinkron push reports mezője használható.',
  })
  @ApiCreatedResponse({ type: ReportDto })
  @ApiNotFoundResponse({ description: 'A szó nem létezik vagy nem látható' })
  @ApiConflictResponse({ description: 'Az azonosító más felhasználóé' })
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateReportDto): Promise<ReportDto> {
    return this.reports.submitOrThrow(user.id, dto);
  }

  @Get('mine')
  @ApiOperation({ summary: 'Saját bejelentések és állapotuk (a legfrissebb elöl)' })
  @ApiOkResponse({ type: [MyReportDto] })
  mine(@CurrentUser() user: AuthenticatedUser): Promise<MyReportDto[]> {
    return this.reports.mine(user.id);
  }
}
