import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { WordsModule } from '../words/words.module';
import { RepetitionController } from './repetition.controller';
import { RepetitionRepository } from './repetition.repository';
import { RepetitionService, SCHEDULER_CONFIG } from './repetition.service';
import { DEFAULT_SCHEDULER_CONFIG } from './scheduler/sm2-scheduler';

@Module({
  imports: [UsersModule, WordsModule],
  controllers: [RepetitionController],
  providers: [
    RepetitionRepository,
    RepetitionService,
    // Injektálható konfiguráció: tesztekben és később felhasználónként felülírható.
    { provide: SCHEDULER_CONFIG, useValue: DEFAULT_SCHEDULER_CONFIG },
  ],
})
export class RepetitionModule {}
