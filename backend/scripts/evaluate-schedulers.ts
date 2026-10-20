/**
 * SM-2 ↔ FSRS-4.5 összevetés a valós értékelési naplón (review_logs).
 *
 *   npx tsx scripts/evaluate-schedulers.ts [--user <uuid>] [--json <fájl>] [--personalize [--test 0.2]]
 *
 * --personalize: az FSRS súlyait felhasználónként a napló időben korábbi
 * részére illeszti (gépi tanulás), és mindhárom modellt a kihagyott, későbbi
 * részen méri (--test: a teszthalmaz aránya, alapértelmezés 0.2).
 *
 * A DATABASE_URL-t a .env-ből veszi. Csak olvas. Értelmes eredményhez
 * több hét valós használatból származó napló kell (a mintába csak a legalább
 * egynapos szünet utáni értékelések kerülnek).
 */
import 'dotenv/config';
import { writeFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { evaluate, evaluatePersonalized, ModelScore, ReviewEvent } from './scheduler-evaluation';

function printScores(scores: ModelScore[]): void {
  console.table(
    scores.map((s) => ({
      modell: s.model,
      'log-veszteség ↓': s.logLoss.toFixed(4),
      'RMSE (sávos) ↓': s.rmseBins.toFixed(4),
      'AUC ↑': Number.isNaN(s.auc) ? '–' : s.auc.toFixed(4),
      'átl. előrejelzés': s.meanPrediction.toFixed(3),
    })),
  );
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const opt = (name: string): string | undefined => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const userId = opt('--user');
  const jsonPath = opt('--json');
  const personalize = args.includes('--personalize');
  const testFraction = Number(opt('--test') ?? 0.2);
  if (!(testFraction > 0 && testFraction < 1)) throw new Error('--test: 0 és 1 közötti arány kell');

  const prisma = new PrismaClient();
  try {
    const logs = await prisma.reviewLog.findMany({
      where: userId ? { userId } : {},
      select: { userId: true, progressId: true, grade: true, responseTimeMs: true, reviewedAt: true },
      orderBy: [{ progressId: 'asc' }, { reviewedAt: 'asc' }],
    });
    const users = new Map<string, Map<string, ReviewEvent[]>>();
    for (const l of logs) {
      const cards = users.get(l.userId) ?? new Map<string, ReviewEvent[]>();
      const list = cards.get(l.progressId) ?? [];
      list.push({ grade: l.grade, responseTimeMs: l.responseTimeMs, reviewedAt: l.reviewedAt });
      cards.set(l.progressId, list);
      users.set(l.userId, cards);
    }

    let output: unknown;
    if (personalize) {
      const result = evaluatePersonalized(users, { testFraction });
      output = result;
      console.log(
        `Felhasználók: ${result.users} (ebből személyre illesztve: ${result.personalizedUsers}), ` +
          `tanító minta: ${result.trainSamples}, teszt minta: ${result.testSamples}`,
      );
      if (result.testSamples === 0) {
        console.log('Nincs elég adat (legalább egynapos szünet utáni értékelések kellenek).');
      } else {
        console.log(`Tényleges felidézési arány a teszthalmazon: ${(result.testRecallRate * 100).toFixed(1)}%\n`);
        printScores(result.scores);
        for (const f of result.fits.filter((x) => x.weights)) {
          console.log(`  ${f.userId}: tanító log-veszteség ${f.trainLossBefore.toFixed(4)} → ${f.trainLossAfter.toFixed(4)}`);
        }
      }
    } else {
      const histories = new Map([...users.values()].flatMap((cards) => [...cards]));
      const result = evaluate(histories);
      output = result;
      console.log(`Kártyák: ${result.cards}, értékelések: ${result.reviews}, minta (≥ 1 nap szünet): ${result.samples}`);
      if (result.samples === 0) {
        console.log('Nincs elég adat az összevetéshez (legalább egynapos szünet utáni értékelés kell).');
      } else {
        console.log(`Tényleges felidézési arány: ${(result.recallRate * 100).toFixed(1)}%\n`);
        printScores(result.scores);
      }
    }
    if (jsonPath) {
      writeFileSync(jsonPath, JSON.stringify(output, null, 2));
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
