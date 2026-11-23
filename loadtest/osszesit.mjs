// Több k6 futás (futas-N.json) átlagolása a szakdolgozat táblázatához.
//
//   node loadtest/osszesit.mjs loadtest/eredmenyek/futas-1.json futas-2.json futas-3.json
//
// Végpontonként a futások mediánjának, p95-ének és hibaarányának számtani
// átlaga, valamint a p95 szóródása (min–max) a futások között. A kimenet
// Markdown táblázat, közvetlenül beilleszthető.
import { readFileSync } from 'node:fs';

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error('Használat: node loadtest/osszesit.mjs <futas-1.json> [futas-2.json …]');
  process.exit(1);
}
const runs = files.map((f) => JSON.parse(readFileSync(f, 'utf8')));
const names = {
  queue: 'GET /study/queue',
  review: 'POST /study/cards/:id/reviews',
  pull: 'GET /sync/pull',
  push: 'POST /sync/push',
};
const target = runs[0].config.p95TargetMs;
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const ms = (x) => x.toFixed(1).replace('.', ',');

console.log(`Futások: ${runs.length} (${runs.map((r) => r.run).join(', ')}), ${runs[0].config.vus} VU, p95 cél: ${target} ms\n`);
console.log('| Végpont | Kérések / futás | Medián (ms) | p95 (ms) | p95 min–max (ms) | Hibaarány | p95 < cél? |');
console.log('|---|---:|---:|---:|---:|---:|:---:|');
for (const [key, label] of Object.entries(names)) {
  const rs = runs.map((r) => r.endpoints[key]).filter(Boolean);
  if (rs.length === 0) continue;
  const p95s = rs.map((r) => r.p95);
  const p95 = mean(p95s);
  console.log(
    `| \`${label}\` | ${Math.round(mean(rs.map((r) => r.count)))} | ${ms(mean(rs.map((r) => r.med)))} | ${ms(p95)} | ` +
      `${ms(Math.min(...p95s))}–${ms(Math.max(...p95s))} | ${(100 * mean(rs.map((r) => r.errorRate ?? 0))).toFixed(2).replace('.', ',')}% | ` +
      `${p95 < target ? 'igen' : 'nem'} |`,
  );
}
