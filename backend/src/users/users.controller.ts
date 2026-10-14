import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { AuthenticatedUser, CurrentUser } from '../common/decorators/current-user.decorator';
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
  @ApiOperation({ summary: 'Tanulási beállítások módosítása (időzóna, napi limitek)' })
  @ApiOkResponse({ type: UserDto })
  update(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateUserSettingsDto): Promise<UserDto> {
    return this.usersService.updateSettings(user.id, dto);
  }
}
