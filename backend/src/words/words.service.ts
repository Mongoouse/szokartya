import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ConjugationType, NumberType, PartOfSpeech, Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCustomWordDto, CustomWordResultDto, CustomWordStatus } from './dto/custom-word.dto';
import { CategoryDto, WordDto, WordPageDto, WordQueryDto } from './dto/word.dto';
import { CustomWordData, WordsRepository } from './words.repository';

@Injectable()
export class WordsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly words: WordsRepository,
  ) {}

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

  // -------------------------------------------------------------------------
  // Saját szavak
  // -------------------------------------------------------------------------

  /** REST: hibás bemenetre 400, azonosító-ütközésre 409. */
  async createCustomOrThrow(userId: string, dto: CreateCustomWordDto): Promise<WordDto> {
    const result = await this.createCustom(userId, dto);
    if (result.status === CustomWordStatus.REJECTED) {
      throw result.reason === 'id_conflict' ? new ConflictException('Az azonosító már foglalt') : new BadRequestException(result.reason);
    }
    return result.word!;
  }

  /**
   * Saját szó létrehozása – a REST végpont és a szinkron push közös útja.
   * Idempotens a kliens által adott azonosítóra: ismételt küldés EXISTS.
   * Azonos alakú saját szónál új homográf-sorszámot kap (pl. két jelentés).
   */
  async createCustom(userId: string, dto: CreateCustomWordDto): Promise<CustomWordResultDto> {
    const id = dto.id ?? randomUUID();
    const invalid = validateCustomWord(dto);
    if (invalid) {
      return { wordId: id, status: CustomWordStatus.REJECTED, reason: invalid };
    }
    const existing = await this.words.findById(id);
    if (existing) {
      return existing.ownerId === userId
        ? { wordId: id, status: CustomWordStatus.EXISTS }
        : { wordId: id, status: CustomWordStatus.REJECTED, reason: 'id_conflict' };
    }

    try {
      const word = await this.prisma.$transaction(async (tx) => {
        const lemma = dto.lemma.trim();
        const homographNo = await this.words.nextHomographNo(userId, lemma, dto.partOfSpeech, tx);
        return this.words.createCustom(toCustomWordData(id, userId, lemma, homographNo, dto), tx);
      });
      return { wordId: id, status: CustomWordStatus.CREATED, word: WordDto.fromEntity(word) };
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        // Párhuzamos küldés ugyanazzal az azonosítóval.
        const raced = await this.words.findById(id);
        if (raced?.ownerId === userId) {
          return { wordId: id, status: CustomWordStatus.EXISTS };
        }
        return { wordId: id, status: CustomWordStatus.REJECTED, reason: 'id_conflict' };
      }
      throw err;
    }
  }

  async deleteCustom(userId: string, id: string, now: Date = new Date()): Promise<void> {
    const deleted = await this.prisma.$transaction((tx) => this.words.softDeleteCustom(userId, id, now, tx));
    if (!deleted) {
      throw new NotFoundException('Saját szó nem található');
    }
  }
}

/** Szófajhoz nem illő mezők elutasítása. @returns az ok, vagy null, ha érvényes. */
export function validateCustomWord(dto: CreateCustomWordDto): string | null {
  const isNoun = dto.partOfSpeech === PartOfSpeech.NOUN;
  if (!isNoun && (dto.gender !== undefined || dto.pluralForm !== undefined)) {
    return 'noun_fields_on_non_noun';
  }
  if (dto.partOfSpeech !== PartOfSpeech.VERB && dto.verb !== undefined) {
    return 'verb_fields_on_non_verb';
  }
  if (dto.translations.every((t) => t.trim() === '')) {
    return 'translation_required';
  }
  return null;
}

function toCustomWordData(id: string, ownerId: string, lemma: string, homographNo: number, dto: CreateCustomWordDto): CustomWordData {
  const gender = dto.gender ?? null;
  const pluralForm = dto.pluralForm?.trim() || null;
  // A séma CHECK kényszereivel összhangban: nem nélkül csak többes számú,
  // többes szám nélkül csak egyes számú főnév.
  const numberType = gender === null ? NumberType.PLURAL_ONLY : pluralForm === null ? NumberType.SINGULAR_ONLY : NumberType.REGULAR;
  const noun =
    dto.partOfSpeech === PartOfSpeech.NOUN && (gender !== null || pluralForm !== null) ? { gender, numberType, pluralForm } : null;
  const verb = dto.verb
    ? {
        conjugationType: dto.verb.conjugationType ?? guessConjugation(dto.verb.pastParticiple),
        auxiliary: dto.verb.auxiliary,
        present3sg: dto.verb.present3sg.trim(),
        preterite3sg: dto.verb.preterite3sg.trim(),
        pastParticiple: dto.verb.pastParticiple.trim(),
      }
    : null;
  return {
    id,
    ownerId,
    lemma,
    partOfSpeech: dto.partOfSpeech,
    homographNo,
    cefrLevel: dto.cefrLevel ?? null,
    noun,
    verb,
    translations: [...new Set(dto.translations.map((t) => t.trim()).filter(Boolean))],
    example: dto.example ? { sentence: dto.example.sentence.trim(), translation: dto.example.translation?.trim() || undefined } : null,
  };
}

/** Durva becslés, ha a felhasználó nem adta meg: az erős igék Partizip II-je -en végű (gefahren). */
function guessConjugation(pastParticiple: string): ConjugationType {
  return pastParticiple.trim().endsWith('en') ? ConjugationType.IRREGULAR : ConjugationType.REGULAR;
}
