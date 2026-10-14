import { Injectable, NotFoundException } from '@nestjs/common';
import { UpdateUserSettingsDto, UserDto } from './dto/user.dto';
import { UsersRepository } from './users.repository';

@Injectable()
export class UsersService {
  constructor(private readonly users: UsersRepository) {}

  async getProfile(userId: string): Promise<UserDto> {
    const user = await this.users.findActiveById(userId);
    if (!user) {
      throw new NotFoundException('A felhasználó nem található');
    }
    return UserDto.fromEntity(user);
  }

  async updateSettings(userId: string, dto: UpdateUserSettingsDto): Promise<UserDto> {
    await this.getProfile(userId);
    const updated = await this.users.update(userId, dto);
    return UserDto.fromEntity(updated);
  }
}
