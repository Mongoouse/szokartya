import { Module } from '@nestjs/common';
import { RepetitionModule } from '../repetition/repetition.module';
import { UsersModule } from '../users/users.module';
import { WordsModule } from '../words/words.module';
import { SyncController } from './sync.controller';
import { SyncRepository } from './sync.repository';
import { SyncService } from './sync.service';

@Module({
  imports: [RepetitionModule, WordsModule, UsersModule],
  controllers: [SyncController],
  providers: [SyncRepository, SyncService],
})
export class SyncModule {}
