import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CardState, CardType, ReviewLog, UserProgress } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDate,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { WordDto } from '../../words/dto/word.dto';
import type { WordWithDetails } from '../../words/word-detail';

/** Egy push kötegben elemtípusonként legfeljebb ennyi tétel. */
export const MAX_PUSH_ITEMS = 500;

// ---------------------------------------------------------------------------
// Pull
// ---------------------------------------------------------------------------

export class PullQueryDto {
  @ApiPropertyOptional({ description: 'Az előző pull válaszában kapott kurzor. Hiányában teljes szinkron.' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  cursor?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 1000, default: 500, description: 'Folyamonkénti maximális elemszám' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  limit = 500;
}

export class ProgressSyncDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) wordId!: string;
  @ApiProperty({ enum: CardType, enumName: 'CardType' }) cardType!: CardType;
  @ApiProperty({ enum: CardState, enumName: 'CardState' }) state!: CardState;
  @ApiProperty() easeFactor!: number;
  @ApiProperty() intervalDays!: number;
  @ApiProperty() repetitions!: number;
  @ApiProperty() learningStep!: number;
  @ApiProperty() lapses!: number;
  @ApiProperty() totalReviews!: number;
  @ApiProperty() correctReviews!: number;
  @ApiPropertyOptional({ nullable: true, type: Number }) avgResponseMs!: number | null;
  @ApiPropertyOptional({ nullable: true, type: Number }) stabilityDays!: number | null;
  @ApiPropertyOptional({ nullable: true, type: Date }) lastReviewedAt!: Date | null;
  @ApiPropertyOptional({ nullable: true, type: Date }) nextReviewAt!: Date | null;
  @ApiProperty() isSuspended!: boolean;
  @ApiProperty() version!: number;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
  @ApiPropertyOptional({ nullable: true, type: Date, description: 'Nem null = törölt (tombstone)' })
  deletedAt!: Date | null;

  static fromEntity(p: UserProgress): ProgressSyncDto {
    return {
      id: p.id,
      wordId: p.wordId,
      cardType: p.cardType,
      state: p.state,
      easeFactor: p.easeFactor.toNumber(),
      intervalDays: p.intervalDays,
      repetitions: p.repetitions,
      learningStep: p.learningStep,
      lapses: p.lapses,
      totalReviews: p.totalReviews,
      correctReviews: p.correctReviews,
      avgResponseMs: p.avgResponseMs,
      stabilityDays: p.stabilityDays?.toNumber() ?? null,
      lastReviewedAt: p.lastReviewedAt,
      nextReviewAt: p.nextReviewAt,
      isSuspended: p.isSuspended,
      version: p.version,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      deletedAt: p.deletedAt,
    };
  }
}

export class WordSyncDto extends WordDto {
  @ApiProperty() version!: number;
  @ApiProperty() updatedAt!: Date;
  @ApiPropertyOptional({ nullable: true, type: Date, description: 'Nem null = törölt (tombstone)' })
  deletedAt!: Date | null;

  static fromWord(w: WordWithDetails): WordSyncDto {
    return { ...WordDto.fromEntity(w), version: w.version, updatedAt: w.updatedAt, deletedAt: w.deletedAt };
  }
}

export class ReviewLogSyncDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) progressId!: string;
  @ApiProperty() grade!: number;
  @ApiProperty() responseTimeMs!: number;
  @ApiProperty() reviewedAt!: Date;
  @ApiProperty() receivedAt!: Date;
  @ApiProperty({ enum: CardState, enumName: 'CardState' }) stateBefore!: CardState;
  @ApiProperty({ enum: CardState, enumName: 'CardState' }) stateAfter!: CardState;
  @ApiPropertyOptional({ nullable: true, type: String }) deviceId!: string | null;

  static fromEntity(l: ReviewLog): ReviewLogSyncDto {
    return {
      id: l.id,
      progressId: l.progressId,
      grade: l.grade,
      responseTimeMs: l.responseTimeMs,
      reviewedAt: l.reviewedAt,
      receivedAt: l.receivedAt,
      stateBefore: l.stateBefore,
      stateAfter: l.stateAfter,
      deviceId: l.deviceId,
    };
  }
}

export class PullResponseDto {
  @ApiProperty({ description: 'Szerveridő – a kliens órakülönbség-becsléséhez' })
  serverTime!: Date;

  @ApiProperty({ description: 'A következő pull kurzora (átlátszatlan)' })
  cursor!: string;

  @ApiProperty({ description: 'true: van még lehúzandó változás – azonnal újra kell hívni a kapott kurzorral' })
  hasMore!: boolean;

  @ApiProperty({ type: [ProgressSyncDto] })
  progress!: ProgressSyncDto[];

  @ApiProperty({ type: [WordSyncDto] })
  words!: WordSyncDto[];

  @ApiProperty({ type: [ReviewLogSyncDto] })
  reviewLogs!: ReviewLogSyncDto[];
}

// ---------------------------------------------------------------------------
// Push
// ---------------------------------------------------------------------------

export class EnrollmentChangeDto {
  @ApiProperty({ format: 'uuid', description: 'A kliensen generált kártyaazonosító' })
  @IsUUID('all')
  progressId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  wordId!: string;

  @ApiProperty({ enum: CardType, enumName: 'CardType' })
  @IsEnum(CardType)
  cardType!: CardType;
}

export class CardChangeDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  progressId!: string;

  @ApiProperty({ description: 'A kártya verziója, amelyen a kliens a módosítást végezte' })
  @IsInt()
  @Min(0)
  baseVersion!: number;

  @ApiProperty({ description: 'A módosítás időpontja a kliens órája szerint' })
  @Type(() => Date)
  @IsDate()
  changedAt!: Date;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isSuspended?: boolean;

  @ApiPropertyOptional({ description: 'true: törlés (soft delete), false: visszaállítás' })
  @IsOptional()
  @IsBoolean()
  deleted?: boolean;
}

export class ReviewChangeDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  reviewId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  progressId!: string;

  @ApiProperty({ minimum: 0, maximum: 5 })
  @IsInt()
  @Min(0)
  @Max(5)
  grade!: number;

  @ApiProperty({ minimum: 0, maximum: 3_600_000 })
  @IsInt()
  @Min(0)
  @Max(3_600_000)
  responseTimeMs!: number;

  @ApiProperty({ description: 'Az értékelés időpontja a kliens órája szerint' })
  @Type(() => Date)
  @IsDate()
  reviewedAt!: Date;
}

export class PushRequestDto {
  @ApiProperty({ description: 'A kliens aktuális órája a küldés pillanatában (órakülönbség-korrekcióhoz)' })
  @Type(() => Date)
  @IsDate()
  clientTime!: Date;

  @ApiPropertyOptional({ maxLength: 128 })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  deviceId?: string;

  @ApiProperty({ type: [EnrollmentChangeDto], maxItems: MAX_PUSH_ITEMS })
  @IsArray()
  @ArrayMaxSize(MAX_PUSH_ITEMS)
  @ValidateNested({ each: true })
  @Type(() => EnrollmentChangeDto)
  enrollments: EnrollmentChangeDto[] = [];

  @ApiProperty({ type: [CardChangeDto], maxItems: MAX_PUSH_ITEMS })
  @IsArray()
  @ArrayMaxSize(MAX_PUSH_ITEMS)
  @ValidateNested({ each: true })
  @Type(() => CardChangeDto)
  cardChanges: CardChangeDto[] = [];

  @ApiProperty({ type: [ReviewChangeDto], maxItems: MAX_PUSH_ITEMS })
  @IsArray()
  @ArrayMaxSize(MAX_PUSH_ITEMS)
  @ValidateNested({ each: true })
  @Type(() => ReviewChangeDto)
  reviews: ReviewChangeDto[] = [];
}

export enum EnrollmentStatus {
  CREATED = 'created',
  /** A (szó, kártyatípus) pár már létezett – a kliens a serverProgressId-ra képezze le a sajátját. */
  EXISTS = 'exists',
  REJECTED = 'rejected',
}

export enum ChangeStatus {
  APPLIED = 'applied',
  /** A szerveren újabb módosítás van – a szerver állapota nyer (a pull hozza). */
  CONFLICT = 'conflict',
  REJECTED = 'rejected',
}

export enum ReviewStatus {
  APPLIED = 'applied',
  DUPLICATE = 'duplicate',
  REJECTED = 'rejected',
}

export class EnrollmentResultDto {
  @ApiProperty({ format: 'uuid' }) progressId!: string;
  @ApiProperty({ enum: EnrollmentStatus, enumName: 'EnrollmentStatus' }) status!: EnrollmentStatus;
  @ApiPropertyOptional({ format: 'uuid', description: 'A szerveren érvényes azonosító (EXISTS esetén eltérhet)' })
  serverProgressId?: string;
  @ApiPropertyOptional() reason?: string;
}

export class CardChangeResultDto {
  @ApiProperty({ format: 'uuid' }) progressId!: string;
  @ApiProperty({ enum: ChangeStatus, enumName: 'ChangeStatus' }) status!: ChangeStatus;
  @ApiPropertyOptional() reason?: string;
}

export class ReviewResultItemDto {
  @ApiProperty({ format: 'uuid' }) reviewId!: string;
  @ApiProperty({ enum: ReviewStatus, enumName: 'ReviewStatus' }) status!: ReviewStatus;
  @ApiPropertyOptional() reason?: string;
}

export class PushResponseDto {
  @ApiProperty() serverTime!: Date;
  @ApiProperty({ description: 'Becsült órakülönbség (szerver − kliens, ms); 2 s fölött korrigálva' })
  clockOffsetMs!: number;
  @ApiProperty({ type: [EnrollmentResultDto] }) enrollments!: EnrollmentResultDto[];
  @ApiProperty({ type: [CardChangeResultDto] }) cardChanges!: CardChangeResultDto[];
  @ApiProperty({ type: [ReviewResultItemDto] }) reviews!: ReviewResultItemDto[];
}
