import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { AuthenticatedUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { CategoryDto, WordDto, WordPageDto, WordQueryDto } from './dto/word.dto';
import { WordsService } from './words.service';

@ApiTags('words')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Hiányzó vagy érvénytelen access token' })
@Controller()
export class WordsController {
  constructor(private readonly words: WordsService) {}

  @Get('words')
  @ApiOperation({ summary: 'Szókereső', description: 'Szűrés CEFR szintre, szófajra, kategóriára; részleges egyezés német alakra vagy magyar fordításra.' })
  @ApiOkResponse({ type: WordPageDto })
  search(@CurrentUser() user: AuthenticatedUser, @Query() query: WordQueryDto): Promise<WordPageDto> {
    return this.words.search(user.id, query);
  }

  @Get('words/:id')
  @ApiOperation({ summary: 'Egy szó teljes nyelvtani adatlapja' })
  @ApiOkResponse({ type: WordDto })
  @ApiNotFoundResponse()
  getById(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string): Promise<WordDto> {
    return this.words.getById(user.id, id);
  }

  @Get('categories')
  @ApiOperation({ summary: 'Tematikus kategóriák (lapos lista, parentId-vel)' })
  @ApiOkResponse({ type: [CategoryDto] })
  categories(): Promise<CategoryDto[]> {
    return this.words.categories();
  }
}
