import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CefrLevel, ReportCategory, ReportStatus, WordReviewStatus } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { ReportDto } from '../../reports/dto/report.dto';
import { WordDto } from '../../words/dto/word.dto';

const NOT_BLANK = /\S/;

class PageQueryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 200, default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit = 50;

  @ApiPropertyOptional({ minimum: 0, default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset = 0;
}

// ---------------------------------------------------------------------------
// Szavak ellenőrzése
// ---------------------------------------------------------------------------

export class AdminWordQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ enum: WordReviewStatus, enumName: 'WordReviewStatus' })
  @IsOptional()
  @IsEnum(WordReviewStatus)
  status?: WordReviewStatus;

  @ApiPropertyOptional({ description: 'Részleges egyezés a német alakra vagy a magyar fordításra' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({ enum: CefrLevel, enumName: 'CefrLevel' })
  @IsOptional()
  @IsEnum(CefrLevel)
  cefrLevel?: CefrLevel;

  @ApiPropertyOptional({ description: 'Csak a nyitott bejelentéssel rendelkező szavak' })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean()
  hasOpenReports?: boolean;
}

export class AdminWordDto extends WordDto {
  @ApiProperty({ enum: WordReviewStatus, enumName: 'WordReviewStatus' })
  declare reviewStatus: WordReviewStatus;

  @ApiPropertyOptional({ nullable: true, type: Date }) reviewedAt!: Date | null;
  @ApiPropertyOptional({ nullable: true, type: String, description: 'Az ellenőrző admin e-mail címe' }) reviewedBy!: string | null;
  @ApiProperty({ description: 'Nyitott bejelentések száma' }) openReports!: number;
  @ApiProperty() version!: number;
}

export class AdminWordPageDto {
  @ApiProperty({ type: [AdminWordDto] }) items!: AdminWordDto[];
  @ApiProperty() total!: number;
  @ApiProperty() limit!: number;
  @ApiProperty() offset!: number;
}

export class UpdateWordReviewDto {
  @ApiPropertyOptional({ enum: WordReviewStatus, enumName: 'WordReviewStatus' })
  @IsOptional()
  @IsEnum(WordReviewStatus)
  reviewStatus?: WordReviewStatus;

  @ApiPropertyOptional({
    type: [String],
    minItems: 1,
    maxItems: 10,
    example: ['múzeum'],
    description: 'A magyar jelentések teljes, új listája (az első az elsődleges). Hiányában a jelentések nem változnak.',
  })
  @IsOptional()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ArrayUnique((t: string) => t.trim().toLowerCase())
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @Matches(NOT_BLANK, { each: true, message: 'translations: üres jelentés nem adható meg' })
  @MaxLength(300, { each: true })
  translations?: string[];

  @ApiPropertyOptional({ description: 'Optimista konkurencia: a módosítás csak ennél a verziónál alkalmazódik' })
  @IsOptional()
  @IsInt()
  @Min(1)
  expectedVersion?: number;
}

// ---------------------------------------------------------------------------
// Bejelentések
// ---------------------------------------------------------------------------

export class AdminReportQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ enum: ReportStatus, enumName: 'ReportStatus' })
  @IsOptional()
  @IsEnum(ReportStatus)
  status?: ReportStatus;

  @ApiPropertyOptional({ enum: ReportCategory, enumName: 'ReportCategory' })
  @IsOptional()
  @IsEnum(ReportCategory)
  category?: ReportCategory;
}

export class ReporterDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() email!: string;
  @ApiPropertyOptional({ nullable: true, type: String }) displayName!: string | null;
}

export class AdminReportDto extends ReportDto {
  @ApiProperty() receivedAt!: Date;
  @ApiProperty({ type: ReporterDto }) reporter!: ReporterDto;
  @ApiPropertyOptional({ nullable: true, type: String }) resolvedBy!: string | null;
  @ApiProperty({ type: AdminWordDto }) word!: AdminWordDto;
}

export class AdminReportPageDto {
  @ApiProperty({ type: [AdminReportDto] }) items!: AdminReportDto[];
  @ApiProperty() total!: number;
  @ApiProperty() limit!: number;
  @ApiProperty() offset!: number;
}

export class UpdateReportDto {
  @ApiProperty({ enum: ReportStatus, enumName: 'ReportStatus' })
  @IsEnum(ReportStatus)
  status!: ReportStatus;

  @ApiPropertyOptional({ maxLength: 1000, description: 'Megjegyzés a bejelentőnek (mit javítottunk / miért nem hiba)' })
  @IsOptional()
  @IsString()
  @Matches(NOT_BLANK, { message: 'adminNote: nem lehet üres' })
  @MaxLength(1000)
  adminNote?: string;
}

// ---------------------------------------------------------------------------
// Összesítés
// ---------------------------------------------------------------------------

export class AdminSummaryDto {
  @ApiProperty({ example: { UNREVIEWED: 1990, VERIFIED: 35, REJECTED: 4 }, description: 'Központi szavak ellenőrzöttség szerint' })
  words!: Record<WordReviewStatus, number>;

  @ApiProperty({ example: { OPEN: 3, RESOLVED: 10, DISMISSED: 2 } })
  reports!: Record<ReportStatus, number>;

  @ApiProperty({ example: { TRANSLATION: 9, GRAMMAR: 3, SPELLING: 2, OTHER: 1 } })
  reportsByCategory!: Record<ReportCategory, number>;

  @ApiPropertyOptional({ nullable: true, type: Number, description: 'Lezárt bejelentések átlagos átfutási ideje órában' })
  avgResolutionHours!: number | null;
}
