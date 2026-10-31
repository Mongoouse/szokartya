import { MyReportDto } from '../../reports/dto/report.dto';
import { ApiProperty } from '@nestjs/swagger';
import { ReviewLog } from '@prisma/client';
import { ProgressSyncDto } from '../../sync/dto/sync.dto';
import { WordDto } from '../../words/dto/word.dto';
import { UserDto } from './user.dto';

export class ExportedReviewLogDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) progressId!: string;
  @ApiProperty() grade!: number;
  @ApiProperty() responseTimeMs!: number;
  @ApiProperty() reviewedAt!: Date;
  @ApiProperty() receivedAt!: Date;
  @ApiProperty({ nullable: true, type: String }) deviceId!: string | null;
  @ApiProperty() stateBefore!: string;
  @ApiProperty() stateAfter!: string;
  @ApiProperty() easeFactorBefore!: number;
  @ApiProperty() easeFactorAfter!: number;
  @ApiProperty() intervalDaysBefore!: number;
  @ApiProperty() intervalDaysAfter!: number;
  @ApiProperty({ nullable: true, type: Number }) elapsedDays!: number | null;
  @ApiProperty() scheduledNextReviewAt!: Date;

  static fromEntity(l: ReviewLog): ExportedReviewLogDto {
    return {
      id: l.id,
      progressId: l.progressId,
      grade: l.grade,
      responseTimeMs: l.responseTimeMs,
      reviewedAt: l.reviewedAt,
      receivedAt: l.receivedAt,
      deviceId: l.deviceId,
      stateBefore: l.stateBefore,
      stateAfter: l.stateAfter,
      easeFactorBefore: l.easeFactorBefore.toNumber(),
      easeFactorAfter: l.easeFactorAfter.toNumber(),
      intervalDaysBefore: l.intervalDaysBefore,
      intervalDaysAfter: l.intervalDaysAfter,
      elapsedDays: l.elapsedDays?.toNumber() ?? null,
      scheduledNextReviewAt: l.scheduledNextReviewAt,
    };
  }
}

export class ExportedCardDto extends ProgressSyncDto {
  @ApiProperty({ example: 'der Tisch' }) word!: string;
}

/** A felhasználó összes személyes adata géppel olvasható formában (GDPR 20. cikk). */
export class UserExportDto {
  @ApiProperty() exportedAt!: Date;
  @ApiProperty({ type: UserDto }) profile!: UserDto;
  @ApiProperty({ type: [WordDto] }) customWords!: WordDto[];
  @ApiProperty({ type: [ExportedCardDto] }) cards!: ExportedCardDto[];
  @ApiProperty({ type: [ExportedReviewLogDto] }) reviewLogs!: ExportedReviewLogDto[];
  @ApiProperty({ type: [MyReportDto] }) reports!: MyReportDto[];
}
