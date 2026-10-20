import { Body, Controller, Get, Header, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { AuthenticatedUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { UserExportDto } from './dto/user-export.dto';
import { UpdateUserSettingsDto, UserDto } from './dto/user.dto';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Hiányzó vagy érvénytelen access token' })
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @ApiOperation({ summary: 'A bejelentkezett felhasználó profilja' })
  @ApiOkResponse({ type: UserDto })
  me(@CurrentUser() user: AuthenticatedUser): Promise<UserDto> {
    return this.usersService.getProfile(user.id);
  }

  @Patch('me')
  @ApiOperation({ summary: 'Tanulási beállítások módosítása (időzóna, napi limitek, célmegtartás, katalógusszintek)' })
  @ApiOkResponse({ type: UserDto })
  update(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateUserSettingsDto): Promise<UserDto> {
    return this.usersService.updateSettings(user.id, dto);
  }

  @Get('me/export')
  @Header('Content-Disposition', 'attachment; filename="szokartya-export.json"')
  @ApiOperation({
    summary: 'Személyes adatok exportja (JSON)',
    description: 'Profil, saját szavak, kártyák ütemezési állapota és a teljes értékelési napló (GDPR 20. cikk).',
  })
  @ApiOkResponse({ type: UserExportDto })
  export(@CurrentUser() user: AuthenticatedUser): Promise<UserExportDto> {
    return this.usersService.exportData(user.id);
  }
}
