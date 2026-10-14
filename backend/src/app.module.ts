import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from './auth/auth.module';
import { PrismaExceptionFilter } from './common/filters/prisma-exception.filter';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { AppConfigModule } from './config/config.module';
import { HealthController } from './health.controller';
import { PrismaModule } from './prisma/prisma.module';
import { RepetitionModule } from './repetition/repetition.module';
import { UsersModule } from './users/users.module';
import { WordsModule } from './words/words.module';

@Module({
  imports: [
    AppConfigModule,
    PrismaModule,
    // Általános korlát IP-nként; az auth végpontok szigorúbbat kapnak (@Throttle).
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 300 }]),
    AuthModule,
    UsersModule,
    WordsModule,
    RepetitionModule,
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
