/**
 * Saját szólista importálása a központi szótárba, a `data/vocabulary/<nyelv>/<szint>.json`
 * fájlok formátumában (lásd `vocabulary-json.ts`). Idempotens: a már meglévő
 * szavakat frissíti.
 *
 *   npx tsx prisma/import-vocabulary.ts <fájl.json> [további fájlok…] [--dry-run]
 *
 * A kategóriáknak már létezniük kell (seed). Formátumhiba esetén az összes
 * hibát kiírja, és semmit nem ír.
 */
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { seedWord } from './seed-writer';
import { loadWordFiles } from './vocabulary-json';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const files = args.filter((a) => !a.startsWith('--')).map((f) => resolve(f));
  if (files.length === 0) {
    console.error('Használat: npx tsx prisma/import-vocabulary.ts <fájl.json> [további fájlok…] [--dry-run]');
    process.exitCode = 2;
    return;
  }

  const prisma = new PrismaClient();
  try {
    const categories = await prisma.category.findMany({ select: { id: true, slug: true } });
    const ids = new Map(categories.map((c) => [c.slug, c.id]));
    const words = loadWordFiles(files, ids.keys(), process.cwd());
    console.log(`${words.length} szó beolvasva (${files.length} fájl).`);
    if (args.includes('--dry-run')) return;

    let skipped = 0;
    for (const w of words) {
      if (!(await seedWord(prisma, w, ids))) skipped++;
    }
    console.log(`Import kész.${skipped > 0 ? ` (${skipped} admin által ellenőrzött szó változatlanul maradt.)` : ''}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
