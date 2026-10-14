import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { createApp } from './app.factory';
import { AppConfigService } from './config/app-config.service';

async function bootstrap(): Promise<void> {
  const app = await createApp();
  const port = app.get(AppConfigService).port;
  await app.listen(port);
  Logger.log(`Szókártya API: http://localhost:${port}/api/v1 – dokumentáció: http://localhost:${port}/docs`, 'Bootstrap');
}

void bootstrap();
