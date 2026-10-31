import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AuthenticatedUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { CreateCustomWordDto } from './dto/custom-word.dto';
import { CategoryDto, WordDto, WordPageDto, WordQueryDto } from './dto/word.dto';
import { WordsService } from './words.service';

@ApiTags('words')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Hiányzó vagy érvénytelen access token' })
@Controller()
export class WordsController {
  constructor(private readonly words: WordsService) {}

  @Get('words')
  @ApiOperation({
    summary: 'Szókereső',
    description: 'Szűrés CEFR szintre, szófajra, kategóriára; részleges egyezés német alakra vagy magyar fordításra.',
  })
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

  @Post('words')
  @ApiOperation({
    summary: 'Saját szó felvétele',
    description: 'Csak a létrehozó felhasználó látja. Offline létrehozáshoz a szinkron push customWords mezője használható.',
  })
  @ApiCreatedResponse({ type: WordDto })
  @ApiBadRequestResponse({ description: 'Szófajhoz nem illő mezők' })
  @ApiConflictResponse({ description: 'Az azonosító már foglalt' })
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateCustomWordDto): Promise<WordDto> {
    return this.words.createCustomOrThrow(user.id, dto);
  }

  @Delete('words/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Saját szó törlése a kártyáival együtt' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ description: 'Nincs ilyen saját szó (a központi szótár szavai nem törölhetők)' })
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.words.deleteCustom(user.id, id);
  }
}
