import { Injectable, NotFoundException } from '@nestjs/common';
import { ProgressSyncDto } from '../sync/dto/sync.dto';
import { WordDto } from '../words/dto/word.dto';
import { ExportedReviewLogDto, UserExportDto } from './dto/user-export.dto';
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

  async exportData(userId: string, now: Date = new Date()): Promise<UserExportDto> {
    const profile = await this.getProfile(userId);
    const data = await this.users.exportData(userId);
    return {
      exportedAt: now,
      profile,
      customWords: data.customWords.map(WordDto.fromEntity),
      cards: data.cards.map((c) => ({ ...ProgressSyncDto.fromEntity(c), word: c.word.lemma })),
      reviewLogs: data.reviewLogs.map(ExportedReviewLogDto.fromEntity),
    };
  }
}
