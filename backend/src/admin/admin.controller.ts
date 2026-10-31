import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Query, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AuthenticatedUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { AdminGuard } from '../common/guards/admin.guard';
import { AdminService } from './admin.service';
import {
  AdminReportDto,
  AdminReportPageDto,
  AdminReportQueryDto,
  AdminSummaryDto,
  AdminWordDto,
  AdminWordPageDto,
  AdminWordQueryDto,
  UpdateReportDto,
  UpdateWordReviewDto,
} from './dto/admin.dto';

@ApiTags('admin')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Hiányzó vagy érvénytelen access token' })
@ApiForbiddenResponse({ description: 'Nem ADMIN szerepkörű felhasználó' })
@UseGuards(AdminGuard)
@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('summary')
  @ApiOperation({ summary: 'Összesítés: szavak ellenőrzöttség szerint, bejelentések állapot és típus szerint' })
  @ApiOkResponse({ type: AdminSummaryDto })
  summary(): Promise<AdminSummaryDto> {
    return this.admin.summary();
  }

  @Get('words')
  @ApiOperation({ summary: 'Központi szavak ellenőrzési sora (szűrhető státuszra, szintre, nyitott bejelentésre)' })
  @ApiOkResponse({ type: AdminWordPageDto })
  words(@Query() query: AdminWordQueryDto): Promise<AdminWordPageDto> {
    return this.admin.words(query);
  }

  @Get('words/:id')
  @ApiOperation({ summary: 'Egy központi szó adatlapja ellenőrzési adatokkal' })
  @ApiOkResponse({ type: AdminWordDto })
  @ApiNotFoundResponse()
  word(@Param('id', ParseUUIDPipe) id: string): Promise<AdminWordDto> {
    return this.admin.word(id);
  }

  @Patch('words/:id')
  @ApiOperation({
    summary: 'Szó jóváhagyása / elutasítása, jelentések javítása',
    description:
      'Az elutasított szó a felhasználóknál törlődik (a kártyái kikerülnek a tanulásból). ' +
      'A jelentések javítása státusz megadása nélkül ellenőrzöttnek jelöli a szót.',
  })
  @ApiOkResponse({ type: AdminWordDto })
  @ApiBadRequestResponse()
  @ApiNotFoundResponse()
  @ApiConflictResponse({ description: 'expectedVersion eltér (közben módosították)' })
  updateWord(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateWordReviewDto,
  ): Promise<AdminWordDto> {
    return this.admin.updateWord(user.id, id, dto);
  }

  @Get('reports')
  @ApiOperation({ summary: 'Hibabejelentések (a legrégebb óta várakozó elöl)' })
  @ApiOkResponse({ type: AdminReportPageDto })
  reports(@Query() query: AdminReportQueryDto): Promise<AdminReportPageDto> {
    return this.admin.reports(query);
  }

  @Patch('reports/:id')
  @ApiOperation({ summary: 'Bejelentés lezárása (RESOLVED / DISMISSED) vagy újranyitása, megjegyzéssel' })
  @ApiOkResponse({ type: AdminReportDto })
  @ApiNotFoundResponse()
  updateReport(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateReportDto,
  ): Promise<AdminReportDto> {
    return this.admin.updateReport(user.id, id, dto);
  }
}
