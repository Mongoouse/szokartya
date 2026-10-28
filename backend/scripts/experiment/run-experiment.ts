/**
 * Az SM-2 és a személyre illesztett FSRS kísérleti összevetése.
 *
 *   npm run experiment:schedulers -- [--source sim|db] [--out <könyvtár>] [--seed 42]
 *        [--test 0.2] [--min-test 30] [--bootstrap 2000] [--iterations 150]
 *        sim:  [--memory actr,hlr,fsrs] [--learners 40] [--days 120]
 *        db:   [--user <uuid>]   (DATABASE_URL a .env-ből; csak olvas)
 *
 * Szimulációnál memóriamodellenként külön forgatókönyv készül (érzékenység-
 * vizsgálat), valós naplónál egyetlen. Minden forgatókönyv könyvtárába kerül
 * a teljes eredmény (JSON), a nyers adatok (CSV), az ábrák (SVG) és egy
 * Markdown összefoglaló; a gyökérbe az összesítő táblázat. Ugyanazzal a
 * maggal és paraméterekkel a kimenet bájtra azonos.
 */
import 'dotenv/config';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ExperimentOptions, ExperimentResult, runExperiment } from './experiment';
import { MEMORY_MODEL_LABELS, MEMORY_MODELS, MemoryModelName, simulateLearners } from './learner-simulation';
import { ScenarioInfo, summaryMarkdown, writeScenario } from './report';

function parseArgs(argv: readonly string[]) {
  const opt = (name: string): string | undefined => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const int = (name: string, fallback: number, min = 1): number => {
    const v = Number(opt(name) ?? fallback);
    if (!Number.isInteger(v) || v < min) throw new Error(`${name}: legalább ${min} egész szám kell`);
    return v;
  };
  const source = opt('--source') ?? 'sim';
  if (source !== 'sim' && source !== 'db') throw new Error('--source: sim vagy db');
  const memory = (opt('--memory') ?? MEMORY_MODELS.join(',')).split(',') as MemoryModelName[];
  for (const m of memory)
    if (!MEMORY_MODELS.includes(m)) throw new Error(`--memory: ismeretlen modell: ${m} (${MEMORY_MODELS.join(', ')})`);
  const testFraction = Number(opt('--test') ?? 0.2);
  if (!(testFraction > 0 && testFraction < 1)) throw new Error('--test: 0 és 1 közötti arány kell');
  return {
    source,
    out: resolve(opt('--out') ?? 'experiment-output'),
    seed: int('--seed', 42, 0),
    memory,
    learners: int('--learners', 40),
    days: int('--days', 120),
    user: opt('--user'),
    experiment: {
      testFraction,
      minTestSamples: int('--min-test', 30),
      bootstrapResamples: int('--bootstrap', 2000),
      fit: { iterations: int('--iterations', 150) },
    } satisfies ExperimentOptions,
  };
}

async function loadScenarios(args: ReturnType<typeof parseArgs>) {
  if (args.source === 'db') {
    const { PrismaClient } = await import('@prisma/client');
    const { loadReviewLogs } = await import('../review-log-source');
    const prisma = new PrismaClient();
    try {
      const users = await loadReviewLogs(prisma, args.user);
      const info: ScenarioInfo = {
        id: 'valos',
        title: 'valós használati napló',
        description: `Adatforrás: a review_logs tábla${args.user ? ` (felhasználó: ${args.user})` : ''}, ${users.size} felhasználó.`,
      };
      return [{ info, users }];
    } finally {
      await prisma.$disconnect();
    }
  }
  return args.memory.map((memoryModel) => {
    const learners = simulateLearners({ memoryModel, learners: args.learners, days: args.days, seed: args.seed });
    const info: ScenarioInfo = {
      id: memoryModel,
      title: `szimuláció, ${MEMORY_MODEL_LABELS[memoryModel]}`,
      description:
        `Adatforrás: ${args.learners} szimulált tanuló, ${args.days} nap használat, a rendszer SM-2 ütemezője szerint ismételve; ` +
        `a felidézést a(z) ${MEMORY_MODEL_LABELS[memoryModel]} memóriamodell sorsolja (mag: ${args.seed}). ` +
        `Lásd: \`scripts/experiment/learner-simulation.ts\`.`,
    };
    return { info, users: new Map(learners.map((l) => [l.userId, l.cards])) };
  });
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const args = parseArgs(argv);
  const command = ['npm run experiment:schedulers --', ...argv.filter((a, i) => a !== '--out' && argv[i - 1] !== '--out')].join(' ').trim();
  mkdirSync(args.out, { recursive: true });

  const done: { info: ScenarioInfo; result: ExperimentResult }[] = [];
  for (const { info, users } of await loadScenarios(args)) {
    const started = Date.now();
    console.log(`▶ ${info.title}: ${users.size} felhasználó…`);
    const result = runExperiment(users, { ...args.experiment, seed: args.seed });
    writeScenario(join(args.out, info.id), info, result);
    done.push({ info, result });
    const primary = result.comparisons.find((c) => c.metric === 'logLoss' && c.a === 'fsrsPersonal' && c.b === 'sm2');
    console.log(
      `  ${result.users} felhasználó, ${result.testSamples} teszt minta, ${((Date.now() - started) / 1000).toFixed(1)} s` +
        (primary
          ? `; log-veszteség (FSRS szem. − SM-2): ${primary.meanDifference.estimate.toFixed(4)} ` +
            `[${primary.meanDifference.low.toFixed(4)}; ${primary.meanDifference.high.toFixed(4)}], p (Holm) = ${primary.pHolm.toExponential(2)}`
          : ''),
    );
    if (result.users === 0)
      console.log('  Nincs elég adat: legalább egy felhasználó kell elegendő (≥ 1 napos szünet utáni) teszt mintával.');
  }
  writeFileSync(join(args.out, 'README.md'), summaryMarkdown(done, command));
  console.log(`Eredmények: ${args.out}`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
