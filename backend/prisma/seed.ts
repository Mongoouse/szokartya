/**
 * A központi (kurált) szótár feltöltése a `data/vocabulary/` JSON fájljaiból
 * (formátum: `vocabulary-json.ts`).
 *
 * A szkript idempotens (lásd `seed-writer.ts`): többszöri futtatás sem hoz
 * létre duplikátumot, és az admin által már ellenőrzött szót nem írja felül.
 * Formátumhiba esetén semmit nem ír, és az összes hibát kiírja.
 */
import { PrismaClient } from '@prisma/client';
import { seedCategories, seedWord } from './seed-writer';
import { loadVocabulary } from './vocabulary-json';

async function main(): Promise<void> {
  const { categories, words } = loadVocabulary();
  const prisma = new PrismaClient();
  try {
    const categoryIds = await seedCategories(prisma, categories);
    let skipped = 0;
    for (const w of words) {
      if (!(await seedWord(prisma, w, categoryIds))) skipped++;
    }
    console.log(`Seed kész: ${categories.length} kategória, ${words.length} szó.`);
    if (skipped > 0) console.log(`  (${skipped} admin által ellenőrzött szó változatlanul maradt.)`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
