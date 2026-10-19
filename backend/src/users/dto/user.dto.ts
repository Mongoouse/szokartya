import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { User } from '@prisma/client';
import {
  IsInt,
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
}
