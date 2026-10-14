import { Module } from '@nestjs/common';
import { WordsController } from './words.controller';
import { WordsRepository } from './words.repository';
import { WordsService } from './words.service';

@Module({
  controllers: [WordsController],
  providers: [WordsRepository, WordsService],
  exports: [WordsRepository],
})
export class WordsModule {}
