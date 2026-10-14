import { PrismaClient } from '@prisma/client';
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { assertTestDatabase, TEST_DATABASE_URL } from './test-database';

/**
 * Egyszer, az összes integrációs teszt előtt:
 *  1. a tesztadatbázis létrehozása, ha nem létezik;
 *  2. a séma teljes újraépítése a migrációkból (ugyanaz a kód, ami élesben fut);
 *  3. a központi szókatalógus betöltése (seed).
 */
export default async function globalSetup(): Promise<void> {
  assertTestDatabase(TEST_DATABASE_URL);
  await ensureDatabaseExists(TEST_DATABASE_URL);

  const prisma = new PrismaClient({ datasourceUrl: TEST_DATABASE_URL });
  try {
    await prisma.$executeRawUnsafe('DROP SCHEMA IF EXISTS public CASCADE');
    await prisma.$executeRawUnsafe('CREATE SCHEMA public');
  } finally {
    await prisma.$disconnect();
  }

  const env = { ...process.env, DATABASE_URL: TEST_DATABASE_URL };
  const cwd = join(__dirname, '..', '..');
  execSync('npx prisma migrate deploy', { cwd, env, stdio: 'pipe' });
  execSync('npx tsx prisma/seed.ts', { cwd, env, stdio: 'pipe' });
}

async function ensureDatabaseExists(url: string): Promise<void> {
  const probe = new PrismaClient({ datasourceUrl: url });
  try {
    await probe.$queryRaw`SELECT 1`;
    return;
  } catch (e) {
    if (!String(e).includes('does not exist')) throw e;
  } finally {
    await probe.$disconnect();
  }
  const parsed = new URL(url);
  const name = parsed.pathname.replace(/^\//, '');
  parsed.pathname = '/postgres';
  const admin = new PrismaClient({ datasourceUrl: parsed.toString() });
  try {
    await admin.$executeRawUnsafe(`CREATE DATABASE "${name.replace(/"/g, '')}"`);
  } finally {
    await admin.$disconnect();
  }
}
