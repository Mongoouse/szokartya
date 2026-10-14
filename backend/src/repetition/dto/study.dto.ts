import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CardState, CardType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
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
} from 'class-validator';
import { WordDto } from '../../words/dto/word.dto';
import type { ProgressWithWord } from '../repetition.repository';

// ---------------------------------------------------------------------------
// Kártyák
// ---------------------------------------------------------------------------

export class SchedulingInfoDto {
  @ApiProperty({ enum: CardState, enumName: 'CardState' })
  state!: CardState;

  @ApiProperty({ example: 2.5 })
  easeFactor!: number;

  @ApiProperty({ example: 6 })
  intervalDays!: number;

  @ApiProperty({ example: 2, description: 'Egymást követő sikeres felidézések' })
  repetitions!: number;

  @ApiProperty({ example: 0 })
  lapses!: number;

  @ApiProperty({ example: 5 })
  totalReviews!: number;

  @ApiProperty({ example: 4 })
  correctReviews!: number;

  @ApiPropertyOptional({ nullable: true, example: 2300, type: Number })
  avgResponseMs!: number | null;

  @ApiPropertyOptional({ nullable: true, description: 'Felejtési görbe stabilitása (nap)', type: Number })
  stabilityDays!: number | null;

  @ApiPropertyOptional({ nullable: true, type: Date })
  lastReviewedAt!: Date | null;

  @ApiPropertyOptional({ nullable: true, type: Date })
  nextReviewAt!: Date | null;

  @ApiProperty()
  isSuspended!: boolean;

  @ApiProperty({ description: 'Optimista konkurenciához / szinkronhoz' })
  version!: number;
}

export class StudyCardDto {
  @ApiProperty({ format: 'uuid' })
  progressId!: string;

  @ApiProperty({ enum: CardType, enumName: 'CardType' })
  cardType!: CardType;

  @ApiProperty({ type: SchedulingInfoDto })
  scheduling!: SchedulingInfoDto;

  @ApiProperty({ type: WordDto })
  word!: WordDto;

  static fromEntity(p: ProgressWithWord): StudyCardDto {
    return {
      progressId: p.id,
      cardType: p.cardType,
      scheduling: {
        state: p.state,
        easeFactor: p.easeFactor.toNumber(),
        intervalDays: p.intervalDays,
        repetitions: p.repetitions,
        lapses: p.lapses,
        totalReviews: p.totalReviews,
        correctReviews: p.correctReviews,
        avgResponseMs: p.avgResponseMs,
        stabilityDays: p.stabilityDays?.toNumber() ?? null,
        lastReviewedAt: p.lastReviewedAt,
        nextReviewAt: p.nextReviewAt,
        isSuspended: p.isSuspended,
        version: p.version,
      },
      word: WordDto.fromEntity(p.word),
    };
  }
}

export class EnrollCardsDto {
  @ApiProperty({ type: [String], format: 'uuid', minItems: 1, maxItems: 200 })
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  wordIds!: string[];

  @ApiPropertyOptional({
    enum: CardType,
    enumName: 'CardType',
    isArray: true,
    default: [CardType.RECOGNITION, CardType.PRODUCTION],
    description: 'GENDER kártya csak nemmel rendelkező főnévhez jön létre',
  })
  @IsOptional()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsEnum(CardType, { each: true })
  cardTypes: CardType[] = [CardType.RECOGNITION, CardType.PRODUCTION];
}

export class EnrollResultDto {
  @ApiProperty({ example: 4, description: 'Újonnan létrehozott kártyák' })
  created!: number;

  @ApiProperty({ example: 0, description: 'Visszaállított (korábban törölt) kártyák' })
  restored!: number;

  @ApiProperty({ type: [String], format: 'uuid', description: 'Nem létező vagy nem elérhető szavak' })
  unknownWordIds!: string[];
}

export class SuspendCardDto {
  @ApiProperty()
  @IsBoolean()
  isSuspended!: boolean;
}

// ---------------------------------------------------------------------------
// Napi sor
// ---------------------------------------------------------------------------

export class QueueQueryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 500, default: 100, description: 'Legfeljebb ennyi kártya kategóriánként' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit = 100;
}

export class StudyQueueDto {
  @ApiProperty({ description: 'Szerveridő a lekérdezés pillanatában' })
  generatedAt!: Date;

  @ApiProperty({ description: 'A felhasználó helyi napjának vége (UTC)' })
  dayEndsAt!: Date;

  @ApiProperty({ type: [StudyCardDto], description: 'Tanulási / újratanulási lépcsőn lévő kártyák (perc alapú ütemezés)' })
  learning!: StudyCardDto[];

  @ApiProperty({ type: [StudyCardDto], description: 'Ma esedékes ismétlések, esedékesség szerint' })
  reviews!: StudyCardDto[];

  @ApiProperty({ type: [StudyCardDto], description: 'A napi keretből még bevezethető új kártyák' })
  newCards!: StudyCardDto[];

  @ApiProperty({ example: 180, description: 'A napi ismétlési keretből hátralévő' })
  reviewsRemainingToday!: number;

  @ApiProperty({ example: 15, description: 'A napi új kártya keretből hátralévő' })
  newCardsRemainingToday!: number;
}

// ---------------------------------------------------------------------------
// Értékelés
// ---------------------------------------------------------------------------

export class SubmitReviewDto {
  @ApiProperty({
    format: 'uuid',
    description: 'A kliens által generált egyedi azonosító. Ismételt beküldés (pl. offline sorból) idempotens.',
  })
  @IsUUID('all')
  reviewId!: string;

  @ApiProperty({ minimum: 0, maximum: 5, example: 4, description: '0–2: nem tudta, 3: nehezen, 4: jól, 5: könnyen' })
  @IsInt()
  @Min(0)
  @Max(5)
  grade!: number;

  @ApiProperty({ minimum: 0, maximum: 3_600_000, example: 2400, description: 'Reakcióidő ezredmásodpercben' })
  @IsInt()
  @Min(0)
  @Max(3_600_000)
  responseTimeMs!: number;

  @ApiPropertyOptional({ description: 'Az értékelés időpontja a kliensen (offline értékeléshez). Alapértelmezés: szerveridő.' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  reviewedAt?: Date;

  @ApiPropertyOptional({ maxLength: 128 })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  deviceId?: string;
}

export class ReviewResultDto {
  @ApiProperty({ format: 'uuid' })
  reviewId!: string;

  @ApiProperty({ description: 'true, ha ezt az értékelést a szerver már korábban feldolgozta' })
  duplicate!: boolean;

  @ApiProperty({ example: 4, description: 'A reakcióidővel korrigált minőség, amellyel az ütemező számolt' })
  effectiveGrade!: number;

  @ApiProperty({ type: StudyCardDto })
  card!: StudyCardDto;
}

// ---------------------------------------------------------------------------
// Statisztika
// ---------------------------------------------------------------------------

export class CardCountsDto {
  @ApiProperty() NEW!: number;
  @ApiProperty() LEARNING!: number;
  @ApiProperty() REVIEW!: number;
  @ApiProperty() RELEARNING!: number;
}

export class StudyStatsDto {
  @ApiProperty({ type: CardCountsDto, description: 'Aktív kártyák állapot szerint' })
  cardsByState!: CardCountsDto;

  @ApiProperty({ description: 'Most esedékes kártyák' })
  dueNow!: number;

  @ApiProperty({ description: 'A helyi nap végéig esedékes kártyák' })
  dueToday!: number;

  @ApiProperty({ description: 'Ma elvégzett értékelések' })
  reviewsToday!: number;

  @ApiProperty({ description: 'Az elmúlt 30 nap értékelései' })
  reviewsLast30Days!: number;

  @ApiPropertyOptional({ nullable: true, example: 0.87, description: 'Helyes válaszok aránya (30 nap)', type: Number })
  accuracyLast30Days!: number | null;

  @ApiPropertyOptional({ nullable: true, example: 0.13, description: 'Hibagyakoriság: 1 − pontosság (30 nap)', type: Number })
  errorRateLast30Days!: number | null;

  @ApiPropertyOptional({ nullable: true, example: 2800, description: 'Átlagos reakcióidő (ms, 30 nap)', type: Number })
  avgResponseMsLast30Days!: number | null;
}
