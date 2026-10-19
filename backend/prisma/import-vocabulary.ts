/**
 * Szólista importálása a központi szótárba (a `data/wortschatz.txt`
 * formátumában). Idempotens: a már meglévő szavakat frissíti.
 *
 *   npx tsx prisma/import-vocabulary.ts <fájl> [--dry-run]
 *
 * A kategóriáknak már létezniük kell (seed); a sorok formátumhibáit
 * sorszámmal jelzi, és ilyenkor semmit nem ír.
 */
import { readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { seedWord } from './seed-writer';
import { parseVocabulary } from './vocabulary';

async function main(): Promise<void> {
  const [file, ...flags] = process.argv.slice(2);
  if (!file) {
    console.error('Használat: npx tsx prisma/import-vocabulary.ts <fájl> [--dry-run]');
    process.exitCode = 2;
    return;
  }
  const words = parseVocabulary(readFileSync(file, 'utf8'));
  console.log(`${words.length} szó beolvasva (${file}).`);
  if (flags.includes('--dry-run')) return;

  const prisma = new PrismaClient();
  try {
    const categories = await prisma.category.findMany({ select: { id: true, slug: true } });
    const ids = new Map(categories.map((c) => [c.slug, c.id]));
    for (const w of words) {
      await seedWord(prisma, w, ids);
    }
    console.log('Import kész.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
