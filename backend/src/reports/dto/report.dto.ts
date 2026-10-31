import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CardType, ReportCategory, ReportStatus, WordReport } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsDate, IsEnum, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength } from 'class-validator';

const NOT_BLANK = /\S/;

/** Hibabejelentés egy szóról. Offline is rögzíthető: az azonosítót a kliens generálja. */
export class CreateReportDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Kliensen generált azonosító (szinkronnál kötelező, idempotens)' })
  @IsOptional()
  @IsUUID('all')
  id?: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  wordId!: string;

  @ApiPropertyOptional({ enum: CardType, enumName: 'CardType', description: 'Melyik kártyán vette észre' })
  @IsOptional()
  @IsEnum(CardType)
  cardType?: CardType;

  @ApiPropertyOptional({ enum: ReportCategory, enumName: 'ReportCategory', default: ReportCategory.OTHER })
  @IsOptional()
  @IsEnum(ReportCategory)
  category?: ReportCategory;

  @ApiProperty({ example: 'A „Museum” jelentése nem „könyvtár”, hanem „múzeum”.', maxLength: 1000 })
  @IsString()
  @MinLength(1)
  @Matches(NOT_BLANK, { message: 'message: nem lehet üres' })
  @MaxLength(1000)
  message!: string;

  @ApiPropertyOptional({ description: 'A rögzítés ideje a kliens órája szerint (offline bejelentésnél)' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  createdAt?: Date;
}

export enum ReportSubmitStatus {
  CREATED = 'created',
  /** Ugyanezzel az azonosítóval már létezik (ismételt küldés). */
  EXISTS = 'exists',
  REJECTED = 'rejected',
}

export class ReportSubmitResultDto {
  @ApiProperty({ format: 'uuid' }) reportId!: string;
  @ApiProperty({ enum: ReportSubmitStatus }) status!: ReportSubmitStatus;
  @ApiPropertyOptional({ example: 'unknown_word' }) reason?: string;
}

/** A bejelentő számára látható adatok (saját bejelentéseinek állapota). */
export class ReportDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) wordId!: string;
  @ApiPropertyOptional({ enum: CardType, enumName: 'CardType', nullable: true }) cardType!: CardType | null;
  @ApiProperty({ enum: ReportCategory, enumName: 'ReportCategory' }) category!: ReportCategory;
  @ApiProperty() message!: string;
  @ApiProperty({ enum: ReportStatus, enumName: 'ReportStatus' }) status!: ReportStatus;
  @ApiPropertyOptional({ nullable: true, type: String }) adminNote!: string | null;
  @ApiProperty() createdAt!: Date;
  @ApiPropertyOptional({ nullable: true, type: Date }) resolvedAt!: Date | null;

  static fromEntity(r: WordReport): ReportDto {
    return {
      id: r.id,
      wordId: r.wordId,
      cardType: r.cardType,
      category: r.category,
      message: r.message,
      status: r.status,
      adminNote: r.adminNote,
      createdAt: r.createdAt,
      resolvedAt: r.resolvedAt,
    };
  }
}

export class MyReportDto extends ReportDto {
  @ApiProperty({ example: 'das Museum', description: 'A szó alakja a bejelentés listázásakor' })
  word!: string;
}
