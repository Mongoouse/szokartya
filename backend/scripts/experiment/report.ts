/**
 * A kísérlet eredményének kiírása: JSON (teljes), CSV (az ábrák és táblázatok
 * nyers adatai), SVG ábrák és egy Markdown összefoglaló, amely táblázatai
 * közvetlenül átvehetők a dolgozatba.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ExperimentResult, METRICS, MODEL_LABELS, TESTED_METRICS } from './experiment';
import { forestFigure, formatP, pairedScatterFigure, reliabilityFigure } from './figures';

const num = (x: number, digits = 4) => (Number.isFinite(x) ? x.toFixed(digits) : '');
/** Magyar tizedesvesszős formázás a Markdown táblázatokhoz. */
const hu = (x: number, digits = 4) => (Number.isFinite(x) ? x.toFixed(digits).replace('.', ',') : '–');
const signed = (x: number, digits = 4) => (x > 0 ? '+' : '') + hu(x, digits);

export interface ScenarioInfo {
  /** Rövid azonosító (könyvtárnév), pl. „actr” vagy „valos”. */
  id: string;
  title: string;
  /** Az adatforrás leírása a riportban. */
  description: string;
}

export function writeScenario(dir: string, info: ScenarioInfo, result: ExperimentResult): void {
  mkdirSync(join(dir, 'abrak'), { recursive: true });
  writeFileSync(join(dir, 'eredmeny.json'), JSON.stringify({ scenario: info, ...result }, null, 2) + '\n');
  writeFileSync(join(dir, 'felhasznalonkent.csv'), perUserCsv(result));
  writeFileSync(join(dir, 'kalibracio.csv'), reliabilityCsv(result));
  writeFileSync(join(dir, 'osszehasonlitasok.csv'), comparisonsCsv(result));
  writeFileSync(join(dir, 'abrak', 'kalibracio.svg'), reliabilityFigure(result, 'Kalibrációs görbe a teszthalmazon', info.title));
  writeFileSync(
    join(dir, 'abrak', 'felhasznalok-logloss.svg'),
    pairedScatterFigure(result, 'Felhasználónkénti log-veszteség: FSRS (személyre illesztve) vs. SM-2', info.title),
  );
  for (const metric of TESTED_METRICS) {
    const label = METRICS.find((m) => m.key === metric)!.label;
    writeFileSync(
      join(dir, 'abrak', `kulonbsegek-${metric}.svg`),
      forestFigure(result, metric, `Páros különbségek – ${label}`, info.title),
    );
  }
  writeFileSync(join(dir, 'README.md'), scenarioMarkdown(info, result));
}

function perUserCsv(result: ExperimentResult): string {
  const header = [
    'userId',
    'trainSamples',
    'testSamples',
    'testRecallRate',
    'personalized',
    'sm2CalibrationExponent',
    'model',
    ...METRICS.map((m) => m.key),
  ];
  const lines = [header.join(',')];
  for (const u of result.perUser) {
    for (const model of result.models) {
      const m = u.metrics[model]!;
      lines.push(
        [
          u.userId,
          u.trainSamples,
          u.testSamples,
          num(u.testRecallRate),
          u.personalized,
          num(u.sm2CalibrationExponent),
          model,
          ...METRICS.map((x) => num(m[x.key])),
        ].join(','),
      );
    }
  }
  return lines.join('\n') + '\n';
}

function reliabilityCsv(result: ExperimentResult): string {
  const lines = ['model,binFrom,binTo,n,meanPrediction,observedRate,ciLow,ciHigh'];
  for (const p of result.pooled) {
    for (const b of p.reliability) {
      lines.push(
        [p.model, b.from.toFixed(2), b.to.toFixed(2), b.n, num(b.meanPrediction), num(b.observedRate), num(b.ciLow), num(b.ciHigh)].join(
          ',',
        ),
      );
    }
  }
  return lines.join('\n') + '\n';
}

function comparisonsCsv(result: ExperimentResult): string {
  const lines = [
    'a,b,metric,users,meanDiff,ciLow,ciHigh,medianDiff,pooledDiff,pooledCiLow,pooledCiHigh,aBetterShare,wPlus,wMinus,z,method,p,pHolm,rankBiserial',
  ];
  for (const c of result.comparisons) {
    lines.push(
      [
        c.a,
        c.b,
        c.metric,
        c.users,
        num(c.meanDifference.estimate, 5),
        num(c.meanDifference.low, 5),
        num(c.meanDifference.high, 5),
        num(c.medianDifference, 5),
        num(c.pooledDifference.estimate, 5),
        num(c.pooledDifference.low, 5),
        num(c.pooledDifference.high, 5),
        num(c.aBetterShare, 3),
        num(c.wilcoxon.wPlus, 1),
        num(c.wilcoxon.wMinus, 1),
        num(c.wilcoxon.z, 3),
        c.wilcoxon.method,
        c.wilcoxon.pValue.toExponential(3),
        c.pHolm.toExponential(3),
        num(c.wilcoxon.rankBiserial, 3),
      ].join(','),
    );
  }
  return lines.join('\n') + '\n';
}

function scenarioMarkdown(info: ScenarioInfo, r: ExperimentResult): string {
  const out: string[] = [];
  out.push(`# Ütemezők összevetése – ${info.title}`, '', info.description, '');
  out.push(
    `Felhasználók: **${r.users}** (kimaradt ${r.excludedUsers}, mert ${r.options.minTestSamples}-nál kevesebb teszt mintája volt; ` +
      `személyre illesztve: ${r.personalizedUsers}). Tanító minta: ${r.trainSamples}, teszt minta: ${r.testSamples}, ` +
      `tényleges felidézési arány a teszthalmazon: ${hu(r.testRecallRate * 100, 1)}%.`,
    '',
  );

  out.push('## Összesített mérőszámok a teszthalmazon', '');
  out.push(
    '| Modell | log-veszteség ↓ | RMSE (sávos) ↓ | AUC ↑ | ECE ↓ | Brier ↓ | átl. előrejelzés |',
    '|---|---:|---:|---:|---:|---:|---:|',
  );
  for (const p of r.pooled) {
    const m = p.metrics;
    out.push(
      `| ${p.label} | ${hu(m.logLoss)} | ${hu(m.rmseBins)} | ${hu(m.auc)} | ${hu(m.ece)} | ${hu(m.brier)} | ${hu(p.meanPrediction, 3)} |`,
    );
  }
  out.push('');

  for (const metric of TESTED_METRICS) {
    const meta = METRICS.find((m) => m.key === metric)!;
    out.push(`## Páros összehasonlítás – ${meta.label} (${meta.higherIsBetter ? 'nagyobb' : 'kisebb'} a jobb)`, '');
    out.push(
      '| a | b | felh. | átl. különbség (a − b) [95% CI] | medián | összesített különbség [95% CI] | „a” jobb | W⁺ | p | p (Holm) | r |',
      '|---|---|---:|---|---:|---|---:|---:|---:|---:|---:|',
    );
    for (const c of r.comparisons.filter((x) => x.metric === metric)) {
      const md = c.meanDifference;
      const pd = c.pooledDifference;
      out.push(
        `| ${MODEL_LABELS[c.a]} | ${MODEL_LABELS[c.b]} | ${c.users} | ${signed(md.estimate)} [${hu(md.low)}; ${hu(md.high)}] | ${signed(c.medianDifference)} | ` +
          `${signed(pd.estimate)} [${hu(pd.low)}; ${hu(pd.high)}] | ${hu(c.aBetterShare * 100, 0)}% | ${hu(c.wilcoxon.wPlus, 1)} | ${formatP(c.wilcoxon.pValue)} | ` +
          `${formatP(c.pHolm)} | ${signed(c.wilcoxon.rankBiserial, 2)} |`,
      );
    }
    out.push('');
  }
  out.push(
    'Jelmagyarázat: *felh.* – a párok (felhasználók) száma; *átl. különbség* – a felhasználónkénti mérőszám-különbségek átlaga, ' +
      'a felhasználók bootstrap újramintavételezéséből számolt 95%-os percentilis intervallummal; *összesített különbség* – az ' +
      'összes teszt mintán számolt mérőszámok különbsége, klaszter-bootstrap intervallummal; *„a” jobb* – a felhasználók hány ' +
      'százalékánál jobb az „a” modell; *W⁺, p* – Wilcoxon-féle előjeles rangpróba (kétoldali); *p (Holm)* – Holm–Bonferroni ' +
      'szerint korrigálva, mérőszámonként az összehasonlítások családján; *r* – illesztett párok rang-biszeriális korrelációja (hatásméret).',
    '',
  );

  out.push('## Ábrák', '');
  out.push('![Kalibrációs görbe](abrak/kalibracio.svg)', '');
  out.push('![Felhasználónkénti log-veszteség](abrak/felhasznalok-logloss.svg)', '');
  for (const metric of TESTED_METRICS) out.push(`![Páros különbségek – ${metric}](abrak/kulonbsegek-${metric}.svg)`, '');

  out.push('## Futtatási paraméterek', '', '```json', JSON.stringify(r.options, null, 2), '```', '');
  return out.join('\n');
}

/** Több forgatókönyv elsődleges eredményének összesítése egy táblázatban (érzékenységvizsgálat). */
export function summaryMarkdown(scenarios: readonly { info: ScenarioInfo; result: ExperimentResult }[], command: string): string {
  const out: string[] = [];
  out.push('# Ütemezők kísérleti összevetése – összefoglaló', '');
  out.push(
    'Elsődleges végpont: a felhasználónkénti log-veszteség különbsége, **FSRS-4.5 (személyre illesztve) − SM-2** (negatív = az FSRS a jobb).',
    '',
  );
  out.push(
    '| Forgatókönyv | felh. | teszt minta | átl. különbség [95% CI] | „FSRS” jobb | p (Holm) | AUC: FSRS szem. / SM-2 | ECE: FSRS szem. / SM-2 |',
    '|---|---:|---:|---|---:|---:|---|---|',
  );
  for (const { info, result } of scenarios) {
    const c = result.comparisons.find((x) => x.metric === 'logLoss' && x.a === 'fsrsPersonal' && x.b === 'sm2');
    const get = (m: string) => result.pooled.find((p) => p.model === m)?.metrics;
    const fp = get('fsrsPersonal');
    const s2 = get('sm2');
    out.push(
      `| [${info.title}](${info.id}/README.md) | ${result.users} | ${result.testSamples} | ` +
        (c
          ? `${signed(c.meanDifference.estimate)} [${hu(c.meanDifference.low)}; ${hu(c.meanDifference.high)}] | ${hu(c.aBetterShare * 100, 0)}% | ${formatP(c.pHolm)}`
          : '– | – | –') +
        ` | ${fp && s2 ? `${hu(fp.auc, 3)} / ${hu(s2.auc, 3)}` : '–'} | ${fp && s2 ? `${hu(fp.ece, 3)} / ${hu(s2.ece, 3)}` : '–'} |`,
    );
  }
  out.push('', `Előállítva: \`${command}\``, '');
  return out.join('\n');
}
