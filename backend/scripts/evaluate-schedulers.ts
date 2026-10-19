/**
 * SM-2 ↔ FSRS-4.5 összevetés a valós értékelési naplón (review_logs).
 *
 *   npx tsx scripts/evaluate-schedulers.ts [--user <uuid>] [--json <fájl>]
 *
 * A DATABASE_URL-t a .env-ből veszi. Csak olvas. Értelmes eredményhez
 * több hét valós használatból származó napló kell (a mintába csak a legalább
 * egynapos szünet utáni értékelések kerülnek).
 */
import 'dotenv/config';
import { writeFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { evaluate, ReviewEvent } from './scheduler-evaluation';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const opt = (name: string): string | undefined => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const userId = opt('--user');
  const jsonPath = opt('--json');

  const prisma = new PrismaClient();
  try {
    const logs = await prisma.reviewLog.findMany({
      where: userId ? { userId } : {},
      select: { progressId: true, grade: true, responseTimeMs: true, reviewedAt: true },
      orderBy: [{ progressId: 'asc' }, { reviewedAt: 'asc' }],
    });
    const histories = new Map<string, ReviewEvent[]>();
    for (const l of logs) {
      const list = histories.get(l.progressId) ?? [];
      list.push({ grade: l.grade, responseTimeMs: l.responseTimeMs, reviewedAt: l.reviewedAt });
      histories.set(l.progressId, list);
    }

    const result = evaluate(histories);
    console.log(`Kártyák: ${result.cards}, értékelések: ${result.reviews}, minta (≥ 1 nap szünet): ${result.samples}`);
    if (result.samples === 0) {
      console.log('Nincs elég adat az összevetéshez (legalább egynapos szünet utáni értékelés kell).');
    } else {
      console.log(`Tényleges felidézési arány: ${(result.recallRate * 100).toFixed(1)}%\n`);
      console.table(
        result.scores.map((s) => ({
          modell: s.model,
          'log-veszteség ↓': s.logLoss.toFixed(4),
          'RMSE (sávos) ↓': s.rmseBins.toFixed(4),
          'AUC ↑': Number.isNaN(s.auc) ? '–' : s.auc.toFixed(4),
          'átl. előrejelzés': s.meanPrediction.toFixed(3),
        })),
      );
    }
    if (jsonPath) {
      writeFileSync(jsonPath, JSON.stringify(result, null, 2));
      console.log(`Eredmény: ${jsonPath}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
