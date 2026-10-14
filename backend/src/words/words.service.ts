import { Injectable, NotFoundException } from '@nestjs/common';
import { CategoryDto, WordDto, WordPageDto, WordQueryDto } from './dto/word.dto';
import { WordsRepository } from './words.repository';

@Injectable()
export class WordsService {
  constructor(private readonly words: WordsRepository) {}

  async search(userId: string, query: WordQueryDto): Promise<WordPageDto> {
    const { items, total } = await this.words.findPage(
      userId,
      { q: query.q, cefrLevel: query.cefrLevel, partOfSpeech: query.partOfSpeech, categorySlug: query.category },
      query.limit,
      query.offset,
    );
    return { items: items.map(WordDto.fromEntity), total, limit: query.limit, offset: query.offset };
  }

  async getById(userId: string, id: string): Promise<WordDto> {
    const word = await this.words.findVisibleById(userId, id);
    if (!word) {
      throw new NotFoundException('A szó nem található');
    }
    return WordDto.fromEntity(word);
  }

  async categories(): Promise<CategoryDto[]> {
    const categories = await this.words.findCategories();
    return categories.map((c) => ({ id: c.id, slug: c.slug, nameHu: c.nameHu, nameDe: c.nameDe, parentId: c.parentId }));
  }
}
