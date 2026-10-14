import { Module } from '@nestjs/common';
import { RepetitionModule } from '../repetition/repetition.module';
import { WordsModule } from '../words/words.module';
import { SyncController } from './sync.controller';
import { SyncRepository } from './sync.repository';
import { SyncService } from './sync.service';

@Module({
  imports: [RepetitionModule, WordsModule],
  controllers: [SyncController],
  providers: [SyncRepository, SyncService],
})
export class SyncModule {}
