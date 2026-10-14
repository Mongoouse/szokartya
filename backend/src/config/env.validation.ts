import { plainToInstance, Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min, MinLength, validateSync } from 'class-validator';

/**
 * A futtatási környezet típusos, validált leírása.
 *
 * Indoklás: a hibás konfiguráció (pl. hiányzó vagy túl rövid JWT titok) az
 * alkalmazás INDULÁSAKOR derüljön ki, ne az első kérésnél éles forgalomban.
 */
export class EnvironmentVariables {
  @IsString()
  DATABASE_URL!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT = 3000;

  @IsOptional()
  @IsString()
  CORS_ORIGINS?: string;

  @IsString()
  @MinLength(32, { message: 'JWT_ACCESS_SECRET legalább 32 karakter legyen' })
  JWT_ACCESS_SECRET!: string;

  @Type(() => Number)
  @IsInt()
  @Min(60)
  @Max(86400)
  JWT_ACCESS_TTL_SECONDS = 900;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  REFRESH_TOKEN_TTL_DAYS = 30;
}

export function validateEnv(config: Record<string, unknown>): EnvironmentVariables {
  const validated = plainToInstance(EnvironmentVariables, config, { enableImplicitConversion: true });
  const errors = validateSync(validated, { skipMissingProperties: false });
  if (errors.length > 0) {
    const details = errors.flatMap((e) => Object.values(e.constraints ?? {})).join('; ');
    throw new Error(`Érvénytelen környezeti konfiguráció: ${details}`);
  }
  return validated;
}
