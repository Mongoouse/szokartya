import { INestApplication, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { AppConfigService } from './config/app-config.service';

export const API_PREFIX = 'api/v1';

/**
 * Az alkalmazás összeállítása – a main.ts és az integrációs tesztek közösen
 * használják, így a tesztek ugyanazt a pipeline-t (validáció, prefix) futtatják.
 */
export async function createApp(): Promise<NestExpressApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  configureApp(app);
  return app;
}

export function configureApp(app: INestApplication): void {
  const config = app.get(AppConfigService);

  app.setGlobalPrefix(API_PREFIX);
  // Biztonsági fejlécek (HSTS, nosniff, frame-ancestors stb.). A Swagger UI
  // inline szkriptjei miatt a CSP a /docs alatt engedékenyebb.
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: { 'script-src': ["'self'", "'unsafe-inline'"], 'img-src': ["'self'", 'data:', 'validator.swagger.io'] },
      },
    }),
  );
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // ismeretlen mezők eldobása (mass assignment ellen)
      forbidNonWhitelisted: true, // …és hibaként jelzése
      transform: true, // DTO osztálypéldányok, típuskonverzió
    }),
  );
  if (config.corsOrigins.length > 0) {
    app.enableCors({ origin: config.corsOrigins });
  }
  app.enableShutdownHooks();
  // Proxy mögött (load balancer) a valós kliens IP a rate limithez és a munkamenet-naplóhoz.
  (app as NestExpressApplication).set?.('trust proxy', 1);
  (app as NestExpressApplication).disable?.('x-powered-by');

  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('Szókártya API')
      .setDescription('Szókincsfejlesztő alkalmazás REST API-ja – német nyelvtani szókártyák, adaptív ismétlés (módosított SM-2).')
      .setVersion('1.0')
      .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' })
      .build(),
  );
  SwaggerModule.setup('docs', app, document, { jsonDocumentUrl: 'docs/openapi.json' });
}
