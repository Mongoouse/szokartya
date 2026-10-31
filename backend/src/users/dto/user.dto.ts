import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CefrLevel, User, UserRole } from '@prisma/client';
import {
  ArrayUnique,
  IsArray,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  Validate,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { isValidTimeZone } from '../../common/utils/time-zone';

@ValidatorConstraint({ name: 'ianaTimeZone' })
export class IsIanaTimeZone implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return typeof value === 'string' && isValidTimeZone(value);
  }

  defaultMessage(): string {
    return 'timezone: érvénytelen IANA időzóna (pl. Europe/Budapest)';
  }
}

/** A felhasználó nyilvános adatai (jelszó-hash nélkül). */
export class UserDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'anna@example.hu' })
  email!: string;

  @ApiPropertyOptional({ nullable: true, example: 'Anna', type: String })
  displayName!: string | null;

  @ApiProperty({ example: 'hu' })
  nativeLanguage!: string;

  @ApiProperty({ example: 'Europe/Budapest' })
  timezone!: string;

  @ApiProperty({ example: 20 })
  dailyNewCardsLimit!: number;

  @ApiProperty({ example: 200 })
  dailyReviewLimit!: number;

  @ApiProperty({ example: 0.9, description: 'Cél felidézési valószínűség az esedékességkor (0.70–0.97)' })
  targetRetention!: number;

  @ApiProperty({ enum: CefrLevel, enumName: 'CefrLevel', isArray: true, description: 'Szinkronizált katalógusszintek; üres = mind' })
  catalogLevels!: CefrLevel[];

  @ApiProperty({ enum: UserRole, enumName: 'UserRole', description: 'ADMIN: szókincs-ellenőrzés és bejelentések kezelése' })
  role!: UserRole;

  @ApiProperty()
  createdAt!: Date;

  static fromEntity(user: User): UserDto {
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      nativeLanguage: user.nativeLanguage,
      timezone: user.timezone,
      dailyNewCardsLimit: user.dailyNewCardsLimit,
      dailyReviewLimit: user.dailyReviewLimit,
      targetRetention: user.targetRetention.toNumber(),
      catalogLevels: user.catalogLevels,
      role: user.role,
      createdAt: user.createdAt,
    };
  }
}

export class UpdateUserSettingsDto {
  @ApiPropertyOptional({ example: 'Anna', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  displayName?: string;

  @ApiPropertyOptional({ example: 'Europe/Budapest' })
  @IsOptional()
  @Validate(IsIanaTimeZone)
  timezone?: string;

  @ApiPropertyOptional({ minimum: 0, maximum: 1000, example: 20 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000)
  dailyNewCardsLimit?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 10000, example: 200 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10000)
  dailyReviewLimit?: number;

  @ApiPropertyOptional({ minimum: 0.7, maximum: 0.97, example: 0.9, description: 'Magasabb érték → rövidebb intervallumok' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.7)
  @Max(0.97)
  targetRetention?: number;

  @ApiPropertyOptional({ enum: CefrLevel, enumName: 'CefrLevel', isArray: true, description: 'Üres tömb = minden szint' })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsEnum(CefrLevel, { each: true })
  catalogLevels?: CefrLevel[];
}
