import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { AuthModule } from './auth/auth.module';
import { PrismaExceptionFilter } from './common/filters/prisma-exception.filter';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { AppConfigService } from './config/app-config.service';
import { AppConfigModule } from './config/config.module';
import { HealthController } from './health.controller';
import { PrismaModule } from './prisma/prisma.module';
import { RepetitionModule } from './repetition/repetition.module';
import { SyncModule } from './sync/sync.module';
import { UsersModule } from './users/users.module';
import { WordsModule } from './words/words.module';

@Module({
  imports: [
    AppConfigModule,
    // Strukturált (JSON) kérésnapló; a titkos mezők nem kerülnek a naplóba.
    LoggerModule.forRootAsync({
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({
        pinoHttp: {
          level: config.logLevel,
          redact: ['req.headers.authorization', 'req.headers.cookie', 'req.body.password', 'req.body.refreshToken'],
          // Az egészség-ellenőrzés (load balancer, Docker) ne töltse a naplót.
          autoLogging: { ignore: (req) => req.url?.endsWith('/health') ?? false },
          customProps: () => ({ service: 'szokartya-api' }),
          ...(config.logPretty ? { transport: { target: 'pino-pretty', options: { singleLine: true } } } : {}),
        },
      }),
    }),
    ScheduleModule.forRoot(),
    PrismaModule,
    // Általános korlát IP-nként; az auth végpontok szigorúbbat kapnak (@Throttle).
    ThrottlerModule.forRootAsync({
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({
        throttlers: [{ name: 'default', ttl: 60_000, limit: 300 }],
        skipIf: () => !config.throttleEnabled,
      }),
    }),
    AuthModule,
    UsersModule,
    WordsModule,
    RepetitionModule,
    SyncModule,
  ],
  controllers: [HealthController],
  providers: [
    // Sorrend: előbb a rate limit, utána a hitelesítés.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_FILTER, useClass: PrismaExceptionFilter },
  ],
})
export class AppModule {}
