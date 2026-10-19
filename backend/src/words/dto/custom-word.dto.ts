import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AuxiliaryVerb, CefrLevel, ConjugationType, GrammaticalGender, PartOfSpeech } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { WordDto } from './word.dto';

/** Nem üres, nem csak szóközből álló szöveg. */
const NOT_BLANK = /\S/;

export class CustomVerbFormsDto {
  @ApiProperty({ example: 'fährt' })
  @IsString()
  @Matches(NOT_BLANK)
  @MaxLength(200)
  present3sg!: string;

  @ApiProperty({ example: 'fuhr' })
  @IsString()
  @Matches(NOT_BLANK)
  @MaxLength(200)
  preterite3sg!: string;

  @ApiProperty({ example: 'gefahren' })
  @IsString()
  @Matches(NOT_BLANK)
  @MaxLength(200)
  pastParticiple!: string;

  @ApiProperty({ enum: AuxiliaryVerb, enumName: 'AuxiliaryVerb' })
  @IsEnum(AuxiliaryVerb)
  auxiliary!: AuxiliaryVerb;

  @ApiPropertyOptional({
    enum: ConjugationType,
    enumName: 'ConjugationType',
    description: 'Hiányában becslés: -en végű Partizip II → erős, egyébként gyenge',
  })
  @IsOptional()
  @IsEnum(ConjugationType)
  conjugationType?: ConjugationType;
}

export class CustomExampleDto {
  @ApiProperty({ example: 'Ich lerne jeden Tag.' })
  @IsString()
  @Matches(NOT_BLANK)
  @MaxLength(1000)
  sentence!: string;

  @ApiPropertyOptional({ example: 'Minden nap tanulok.' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  translation?: string;
}

/** Saját szó felvétele. Offline is létrehozható: az azonosítót a kliens generálja. */
export class CreateCustomWordDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Kliensen generált azonosító (szinkronnál kötelező, idempotens)' })
  @IsOptional()
  @IsUUID('all')
  id?: string;

  @ApiProperty({ example: 'Schreibtisch', description: 'Szótári alak névelő nélkül' })
  @IsString()
  @MinLength(1)
  @Matches(NOT_BLANK)
  @MaxLength(200)
  lemma!: string;

  @ApiProperty({ enum: PartOfSpeech, enumName: 'PartOfSpeech' })
  @IsEnum(PartOfSpeech)
  partOfSpeech!: PartOfSpeech;

  @ApiPropertyOptional({ enum: CefrLevel, enumName: 'CefrLevel' })
  @IsOptional()
  @IsEnum(CefrLevel)
  cefrLevel?: CefrLevel;

  @ApiProperty({ type: [String], minItems: 1, maxItems: 10, example: ['íróasztal'], description: 'Az első az elsődleges' })
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ArrayUnique()
  @IsString({ each: true })
  @Matches(NOT_BLANK, { each: true })
  @MaxLength(300, { each: true })
  translations!: string[];

  @ApiPropertyOptional({ enum: GrammaticalGender, enumName: 'GrammaticalGender', description: 'Csak főnévnél' })
  @IsOptional()
  @IsEnum(GrammaticalGender)
  gender?: GrammaticalGender;

  @ApiPropertyOptional({ example: 'Schreibtische', description: 'Csak főnévnél; hiányában csak egyes számú' })
  @IsOptional()
  @IsString()
  @Matches(NOT_BLANK)
  @MaxLength(200)
  pluralForm?: string;

  @ApiPropertyOptional({ type: CustomVerbFormsDto, description: 'Csak igénél' })
  @IsOptional()
  @ValidateNested()
  @Type(() => CustomVerbFormsDto)
  verb?: CustomVerbFormsDto;

  @ApiPropertyOptional({ type: CustomExampleDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => CustomExampleDto)
  example?: CustomExampleDto;
}

export enum CustomWordStatus {
  CREATED = 'created',
  /** Ugyanezzel az azonosítóval már létezik (ismételt küldés). */
  EXISTS = 'exists',
  REJECTED = 'rejected',
}

export class CustomWordResultDto {
  @ApiProperty({ format: 'uuid' }) wordId!: string;
  @ApiProperty({ enum: CustomWordStatus, enumName: 'CustomWordStatus' }) status!: CustomWordStatus;
  @ApiPropertyOptional() reason?: string;
  @ApiPropertyOptional({ type: WordDto }) word?: WordDto;
}
