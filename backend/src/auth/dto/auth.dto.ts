import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsOptional, IsString, Matches, MaxLength, MinLength, Validate } from 'class-validator';
import { IsIanaTimeZone, UserDto } from '../../users/dto/user.dto';

const trimLower = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

/** Opcionális eszközazonosító: a munkamenetek eszközönkénti kezeléséhez. */
class DeviceInfoDto {
  @ApiPropertyOptional({ maxLength: 128, example: 'c0a8012e-ios-iphone15' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  deviceId?: string;
}

export class RegisterDto extends DeviceInfoDto {
  @ApiProperty({ example: 'anna@example.hu', maxLength: 254 })
  @Transform(trimLower)
  @IsEmail({}, { message: 'email: érvénytelen e-mail cím' })
  @MaxLength(254)
  email!: string;

  /**
   * NIST SP 800-63B: hossz a fő követelmény (min. 10), összetételi szabályok
   * helyett. A felső korlát a hash-függvény DoS-védelmét szolgálja.
   */
  @ApiProperty({ minLength: 10, maxLength: 128, example: 'helyes-lo-elem-tuzgolyo' })
  @IsString()
  @MinLength(10, { message: 'password: legalább 10 karakter' })
  @MaxLength(128)
  @Matches(/\S/, { message: 'password: nem állhat csak szóközökből' })
  password!: string;

  @ApiPropertyOptional({ example: 'Anna', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  displayName?: string;

  @ApiPropertyOptional({ example: 'Europe/Budapest' })
  @IsOptional()
  @Validate(IsIanaTimeZone)
  timezone?: string;
}

export class LoginDto extends DeviceInfoDto {
  @ApiProperty({ example: 'anna@example.hu' })
  @Transform(trimLower)
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiProperty({ example: 'helyes-lo-elem-tuzgolyo' })
  @IsString()
  @MaxLength(128)
  password!: string;
}

export class RefreshTokenDto {
  @ApiProperty({ description: 'A legutóbb kapott refresh token' })
  @IsString()
  @MinLength(20)
  @MaxLength(200)
  refreshToken!: string;
}

export class AuthTokensDto {
  @ApiProperty({ description: 'Bearer access token (JWT, HS256)' })
  accessToken!: string;

  @ApiProperty({ example: 900, description: 'Az access token élettartama másodpercben' })
  accessTokenExpiresIn!: number;

  @ApiProperty({ description: 'Egyszer használatos refresh token – minden frissítéskor új érkezik' })
  refreshToken!: string;

  @ApiProperty()
  refreshTokenExpiresAt!: Date;

  @ApiProperty({ type: UserDto })
  user!: UserDto;
}
