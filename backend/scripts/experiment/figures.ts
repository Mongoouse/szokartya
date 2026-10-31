/**
 * A kísérlet ábrái önálló SVG-fájlként (külső függőség nélkül). Nyomtatásra
 * és a dolgozatba illesztésre szánt, világos hátterű, statikus ábrák; a
 * sorozatokat a szín mellett a jelölő alakja is megkülönbözteti, így
 * fekete-fehér nyomtatásban és színtévesztéssel is olvashatók. Az ábrák
 * adatai CSV-ben is elkészülnek (lásd `report.ts`), ha más eszközzel
 * (pgfplots, matplotlib) kell újrarajzolni őket.
 */
import { ComparisonResult, ExperimentResult, MetricKey, METRICS, MODEL_LABELS, ModelKey } from './experiment';

const INK = '#0b0b0b';
const INK_2 = '#52514e';
const MUTED = '#8a8984';
const GRID = '#e4e3df';
const SURFACE = '#ffffff';
const FONT = "font-family='Helvetica, Arial, sans-serif'";

type Marker = 'circle' | 'square' | 'triangle' | 'diamond' | 'cross';

/** Rögzített modell → szín / jelölő hozzárendelés: a szín a modellt követi, nem a sorrendet. */
const STYLE: Record<ModelKey, { color: string; marker: Marker; dash?: string }> = {
  sm2: { color: '#2a78d6', marker: 'circle' },
  sm2Calibrated: { color: '#eb6834', marker: 'square', dash: '6 3' },
  fsrsDefault: { color: '#1baf7a', marker: 'triangle', dash: '2 3' },
  fsrsPersonal: { color: '#6250d6', marker: 'diamond' },
  baseline: { color: MUTED, marker: 'cross' },
  oracle: { color: INK_2, marker: 'cross', dash: '1 3' },
};

const fmt = (x: number, digits = 2) => x.toFixed(digits).replace('.', ',');
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function marker(kind: Marker, x: number, y: number, color: string, r = 4.5): string {
  const ring = `stroke='${SURFACE}' stroke-width='1.5'`;
  switch (kind) {
    case 'circle':
      return `<circle cx='${x}' cy='${y}' r='${r}' fill='${color}' ${ring}/>`;
    case 'square':
      return `<rect x='${x - r}' y='${y - r}' width='${2 * r}' height='${2 * r}' rx='1' fill='${color}' ${ring}/>`;
    case 'triangle':
      return `<path d='M${x} ${y - r * 1.2} L${x + r * 1.1} ${y + r * 0.8} L${x - r * 1.1} ${y + r * 0.8} Z' fill='${color}' ${ring}/>`;
    case 'diamond':
      return `<path d='M${x} ${y - r * 1.3} L${x + r * 1.1} ${y} L${x} ${y + r * 1.3} L${x - r * 1.1} ${y} Z' fill='${color}' ${ring}/>`;
    case 'cross':
      return `<path d='M${x - r} ${y - r} L${x + r} ${y + r} M${x - r} ${y + r} L${x + r} ${y - r}' stroke='${color}' stroke-width='2' stroke-linecap='round'/>`;
  }
}

function svg(width: number, height: number, title: string, body: string): string {
  return (
    `<svg xmlns='http://www.w3.org/2000/svg' width='${width}' height='${height}' viewBox='0 0 ${width} ${height}' ${FONT} font-size='12'>\n` +
    `<title>${esc(title)}</title>\n<rect width='${width}' height='${height}' fill='${SURFACE}'/>\n${body}\n</svg>\n`
  );
}

/** Cím és alcím (a forgatókönyv) az ábra tetején. */
function header(title: string, subtitle: string, x = 20): string {
  return (
    `<text x='${x}' y='26' font-size='15' font-weight='600' fill='${INK}'>${esc(title)}</text>` +
    `<text x='${x}' y='46' fill='${INK_2}'>${esc(subtitle)}</text>`
  );
}

interface Frame {
  x: (v: number) => number;
  y: (v: number) => number;
  body: string[];
}

/** Tengelyek, rács és feliratok egy téglalap alakú rajzterülethez. */
function frame(
  box: { left: number; top: number; width: number; height: number },
  xDomain: [number, number],
  yDomain: [number, number],
  ticks: { x: number[]; y: number[]; digits?: number },
  labels: { x: string; y: string },
): Frame {
  const x = (v: number) => box.left + ((v - xDomain[0]) / (xDomain[1] - xDomain[0])) * box.width;
  const y = (v: number) => box.top + box.height - ((v - yDomain[0]) / (yDomain[1] - yDomain[0])) * box.height;
  const d = ticks.digits ?? 1;
  const body: string[] = [];
  for (const t of ticks.y) {
    body.push(`<line x1='${box.left}' x2='${box.left + box.width}' y1='${y(t)}' y2='${y(t)}' stroke='${GRID}'/>`);
    body.push(`<text x='${box.left - 8}' y='${y(t) + 4}' text-anchor='end' fill='${INK_2}'>${fmt(t, d)}</text>`);
  }
  for (const t of ticks.x) {
    body.push(`<line x1='${x(t)}' x2='${x(t)}' y1='${box.top}' y2='${box.top + box.height}' stroke='${GRID}'/>`);
    body.push(`<text x='${x(t)}' y='${box.top + box.height + 18}' text-anchor='middle' fill='${INK_2}'>${fmt(t, d)}</text>`);
  }
  body.push(
    `<line x1='${box.left}' x2='${box.left + box.width}' y1='${box.top + box.height}' y2='${box.top + box.height}' stroke='${INK_2}'/>`,
  );
  body.push(
    `<text x='${box.left + box.width / 2}' y='${box.top + box.height + 40}' text-anchor='middle' fill='${INK}'>${esc(labels.x)}</text>`,
  );
  body.push(
    `<text transform='translate(${box.left - 46} ${box.top + box.height / 2}) rotate(-90)' text-anchor='middle' fill='${INK}'>${esc(labels.y)}</text>`,
  );
  return { x, y, body };
}

function legend(models: readonly ModelKey[], left: number, top: number, perRow: number): string {
  return models
    .map((m, i) => {
      const cx = left + (i % perRow) * 250;
      const cy = top + Math.floor(i / perRow) * 20;
      const s = STYLE[m];
      return (
        `<line x1='${cx}' x2='${cx + 24}' y1='${cy}' y2='${cy}' stroke='${s.color}' stroke-width='2' ${s.dash ? `stroke-dasharray='${s.dash}'` : ''}/>` +
        marker(s.marker, cx + 12, cy, s.color, 4) +
        `<text x='${cx + 32}' y='${cy + 4}' fill='${INK}'>${esc(MODEL_LABELS[m])}</text>`
      );
    })
    .join('\n');
}

/**
 * Kalibrációs (megbízhatósági) diagram: sávonként az átlagos előre jelzett és
 * a tényleges felidézési arány. Az átlón lenne a tökéletes kalibráció; az
 * átló alatti pont azt jelenti, hogy a modell túlbecsüli a felidézést.
 */
export function reliabilityFigure(result: ExperimentResult, title: string, subtitle: string, minBinSize = 20): string {
  const models = result.models.filter((m) => m !== 'baseline');
  const W = 640;
  const H = 640;
  const box = { left: 70, top: 132, width: 520, height: 430 };
  const f = frame(
    box,
    [0, 1],
    [0, 1],
    { x: [0, 0.2, 0.4, 0.6, 0.8, 1], y: [0, 0.2, 0.4, 0.6, 0.8, 1] },
    {
      x: 'Előre jelzett felidézési valószínűség (sáv átlaga)',
      y: 'Tényleges felidézési arány',
    },
  );
  const body = [...f.body];
  body.push(`<line x1='${f.x(0)}' y1='${f.y(0)}' x2='${f.x(1)}' y2='${f.y(1)}' stroke='${MUTED}' stroke-dasharray='4 4'/>`);
  const angle = (-Math.atan(box.height / box.width) * 180) / Math.PI;
  body.push(
    `<text x='${f.x(0.12)}' y='${f.y(0.12) - 6}' fill='${MUTED}' transform='rotate(${angle.toFixed(1)} ${f.x(0.12)} ${f.y(0.12) - 6})'>tökéletes kalibráció</text>`,
  );
  for (const m of models) {
    const bins = result.pooled.find((p) => p.model === m)!.reliability.filter((b) => b.n >= minBinSize);
    const s = STYLE[m];
    const path = bins
      .map((b, i) => `${i === 0 ? 'M' : 'L'}${f.x(b.meanPrediction).toFixed(1)} ${f.y(b.observedRate).toFixed(1)}`)
      .join(' ');
    body.push(`<path d='${path}' fill='none' stroke='${s.color}' stroke-width='2' ${s.dash ? `stroke-dasharray='${s.dash}'` : ''}/>`);
    for (const b of bins) {
      body.push(
        `<line x1='${f.x(b.meanPrediction)}' x2='${f.x(b.meanPrediction)}' y1='${f.y(b.ciLow)}' y2='${f.y(b.ciHigh)}' stroke='${s.color}' stroke-opacity='0.5'/>`,
      );
      body.push(marker(s.marker, +f.x(b.meanPrediction).toFixed(1), +f.y(b.observedRate).toFixed(1), s.color));
    }
  }
  body.push(header(title, subtitle));
  body.push(legend(models, 20, 74, 2));
  body.push(
    `<text x='${box.left - 50}' y='${H - 12}' fill='${INK_2}' font-size='11'>Sávok: 0,1 szélesek, legalább ${minBinSize} minta; függőleges vonal: 95%-os Wilson-intervallum. Teszthalmaz, n = ${result.testSamples}.</text>`,
  );
  return svg(W, H, title, body.join('\n'));
}

/**
 * Erdődiagram (forest plot) egy mérőszámra: összehasonlításonként a
 * felhasználónkénti különbség átlaga 95%-os bootstrap konfidenciaintervallummal
 * és a Holm-korrigált Wilcoxon p-érték.
 */
export function forestFigure(result: ExperimentResult, metric: MetricKey, title: string, subtitle: string): string {
  const rows = result.comparisons.filter((c) => c.metric === metric);
  const meta = METRICS.find((m) => m.key === metric)!;
  const W = 760;
  const rowH = 44;
  const box = { left: 300, top: 90, width: 300, height: rows.length * rowH };
  const H = box.top + box.height + 92;
  const extent = Math.max(1e-3, ...rows.flatMap((r) => [Math.abs(r.meanDifference.low), Math.abs(r.meanDifference.high)])) * 1.15;
  const step = niceStep(extent / 2);
  const lim = Math.ceil(extent / step) * step;
  const ticks: number[] = [];
  for (let t = -lim; t <= lim + 1e-12; t += step) ticks.push(Math.abs(t) < 1e-12 ? 0 : t);
  const digits = Math.max(2, -Math.floor(Math.log10(step)));
  const f = frame(box, [-lim, lim], [0, rows.length], { x: ticks, y: [], digits }, { x: `Különbség (a − b), ${meta.label}`, y: '' });
  const body = [...f.body];
  body.push(`<line x1='${f.x(0)}' x2='${f.x(0)}' y1='${box.top}' y2='${box.top + box.height}' stroke='${INK_2}'/>`);
  const better = meta.higherIsBetter ? ['← „b” a jobb', '„a” a jobb →'] : ['← „a” a jobb', '„b” a jobb →'];
  body.push(`<text x='${box.left}' y='${box.top - 10}' fill='${INK_2}' font-size='11'>${better[0]}</text>`);
  body.push(`<text x='${box.left + box.width}' y='${box.top - 10}' text-anchor='end' fill='${INK_2}' font-size='11'>${better[1]}</text>`);
  body.push(`<text x='${box.left + box.width + 16}' y='${box.top - 10}' fill='${INK_2}' font-size='11'>p (Holm)</text>`);
  rows.forEach((r: ComparisonResult, i) => {
    const cy = box.top + i * rowH + rowH / 2;
    const s = STYLE[r.a];
    body.push(`<text x='${box.left - 14}' y='${cy - 3}' text-anchor='end' fill='${INK}'>${esc(MODEL_LABELS[r.a])}</text>`);
    body.push(
      `<text x='${box.left - 14}' y='${cy + 12}' text-anchor='end' fill='${INK_2}' font-size='11'>vs. ${esc(MODEL_LABELS[r.b])}</text>`,
    );
    body.push(
      `<line x1='${f.x(r.meanDifference.low)}' x2='${f.x(r.meanDifference.high)}' y1='${cy}' y2='${cy}' stroke='${s.color}' stroke-width='2' stroke-linecap='round'/>`,
    );
    body.push(marker('diamond', +f.x(r.meanDifference.estimate).toFixed(1), cy, s.color, 5));
    body.push(`<text x='${box.left + box.width + 16}' y='${cy + 4}' fill='${INK}'>${esc(formatP(r.pHolm))}</text>`);
  });
  body.push(header(title, subtitle));
  body.push(
    `<text x='20' y='${H - 12}' fill='${INK_2}' font-size='11'>Felhasználónkénti különbségek átlaga, 95%-os bootstrap CI (${result.options.bootstrapResamples} újraminta); Wilcoxon-próba, ${result.users} felhasználó.</text>`,
  );
  return svg(W, H, title, body.join('\n'));
}

/**
 * Felhasználónkénti páros szórásdiagram: x = SM-2, y = személyre illesztett
 * FSRS log-vesztesége. Az átló alatti pont olyan felhasználó, akinél az FSRS jobb.
 */
export function pairedScatterFigure(
  result: ExperimentResult,
  title: string,
  subtitle: string,
  a: ModelKey = 'fsrsPersonal',
  b: ModelKey = 'sm2',
): string {
  const pts = result.perUser.map((u) => ({ x: u.metrics[b]!.logLoss, y: u.metrics[a]!.logLoss })).filter((p) => Number.isFinite(p.x + p.y));
  const W = 600;
  const H = 620;
  const box = { left: 80, top: 90, width: 470, height: 440 };
  const values = pts.flatMap((p) => [p.x, p.y]);
  const step = niceStep((Math.max(...values) - Math.min(...values)) / 4);
  const lo = Math.floor(Math.min(...values) / step) * step;
  const hi = Math.ceil(Math.max(...values) / step) * step;
  const ticks: number[] = [];
  for (let t = lo; t <= hi + 1e-12; t += step) ticks.push(t);
  const f = frame(
    box,
    [lo, hi],
    [lo, hi],
    { x: ticks, y: ticks, digits: 2 },
    {
      x: `${MODEL_LABELS[b]} – log-veszteség`,
      y: `${MODEL_LABELS[a]} – log-veszteség`,
    },
  );
  const body = [...f.body];
  body.push(`<line x1='${f.x(lo)}' y1='${f.y(lo)}' x2='${f.x(hi)}' y2='${f.y(hi)}' stroke='${MUTED}' stroke-dasharray='4 4'/>`);
  const below = pts.filter((p) => p.y < p.x).length;
  for (const p of pts) body.push(marker('circle', +f.x(p.x).toFixed(1), +f.y(p.y).toFixed(1), STYLE[a].color, 4.5));
  body.push(
    `<text x='${f.x(hi) - 6}' y='${f.y(lo) - 10}' text-anchor='end' fill='${INK_2}' font-size='11'>átló alatt: „${esc(MODEL_LABELS[a])}” a jobb</text>`,
  );
  body.push(header(title, subtitle));
  body.push(
    `<text x='20' y='${H - 12}' fill='${INK_2}' font-size='11'>Egy pont = egy felhasználó teszthalmaza. Átló alatt: ${below} / ${pts.length} felhasználó.</text>`,
  );
  return svg(W, H, title, body.join('\n'));
}

function niceStep(raw: number): number {
  const exp = Math.pow(10, Math.floor(Math.log10(raw)));
  const m = raw / exp;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * exp;
}

export function formatP(p: number): string {
  if (p < 0.001) return '< 0,001';
  return fmt(p, 3);
}
