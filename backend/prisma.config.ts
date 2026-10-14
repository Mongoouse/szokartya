import 'dotenv/config';
import path from 'node:path';
import { defineConfig } from 'prisma/config';

/**
 * Prisma CLI konfiguráció. Konfigurációs fájl használatakor a Prisma nem tölti
 * be automatikusan a `.env`-et, ezért a `dotenv/config` importálása szükséges.
 */
export default defineConfig({
  schema: path.join('prisma', 'schema.prisma'),
  migrations: {
    path: path.join('prisma', 'migrations'),
    seed: 'tsx prisma/seed.ts',
  },
});
