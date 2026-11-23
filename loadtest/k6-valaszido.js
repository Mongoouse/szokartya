// Szókártya – válaszidő-mérés terhelés alatt (k6).
//
// Egy virtuális felhasználó (VU) egy iterációja = egy tanulási munkamenet:
//   1. GET  /sync/pull      – az alkalmazás indításakor inkrementális szinkron
//   2. GET  /study/queue    – napi kártyasor
//   3. POST /study/cards/:id/reviews – SESSION_CARDS kártya értékelése
//                             egyenként, gondolkodási idővel (online út)
//   4. POST /sync/push      – OFFLINE_CARDS kártya offline értékelése kötegben
//                             (a mobilkliens kimenő sorának kiürítése)
//   5. GET  /sync/pull      – a push utáni szinkron
//   + szünet a következő munkamenetig.
//
// Fázisok: 30 s bemelegítés (nem számít bele az eredménybe), majd 5 perc
// mért terhelés (30 s felfutás VUS-ig, utána 4 perc 30 s állandó terhelés).
// Az eredmény a `phase:load` címkéjű mérésekből készül, végpontonként.
//
// Futtatás (részletesen: loadtest/README.md):
//   k6 run -e VUS=50 -e RUN=1 loadtest/k6-valaszido.js
//
// Paraméterek (-e KULCS=érték):
//   BASE_URL       az API címe                     (http://localhost:3000/api/v1)
//   VUS            párhuzamos felhasználók a mért fázisban (50)
//   WARMUP_VUS     párhuzamos felhasználók a bemelegítésben (10)
//   USERS          a seedelt felhasználók száma    (200; ≥ VUS + WARMUP_VUS)
//   SESSION_CARDS  online értékelt kártya / munkamenet (10)
//   OFFLINE_CARDS  offline (push) értékelt kártya / munkamenet (5)
//   P95_MS         a p95 célérték ezredmásodpercben (200) – küszöbként ellenőrizve
//   RUN            a futás sorszáma, az eredményfájl nevéhez (1)
//   OUT_DIR        az eredményfájlok mappája       (loadtest/eredmenyek)
//   WARMUP, RAMP, HOLD  fázishosszak (30s, 30s, 4m30s) – csak gyors próbához
//                  érdemes rövidíteni; a mérés az alapértékekkel készül.

import http from 'k6/http';
import { check, sleep, fail } from 'k6';
import encoding from 'k6/encoding';
import exec from 'k6/execution';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000/api/v1';
const VUS = int('VUS', 50);
const WARMUP_VUS = int('WARMUP_VUS', 10);
const USERS = int('USERS', 200);
const SESSION_CARDS = int('SESSION_CARDS', 10);
const OFFLINE_CARDS = int('OFFLINE_CARDS', 5);
const P95_MS = int('P95_MS', 200);
const RUN = __ENV.RUN || '1';
const OUT_DIR = __ENV.OUT_DIR || 'loadtest/eredmenyek';
const WARMUP = __ENV.WARMUP || '30s';
const RAMP = __ENV.RAMP || '30s';
const HOLD = __ENV.HOLD || '4m30s';

// A seed szkripttel egyező adatok (backend/scripts/loadtest/seed-loadtest.ts).
const PASSWORD = 'Terheles-Teszt-2026';
const email = (i) => `loadtest-${String(i).padStart(4, '0')}@loadtest.local`;

const ENDPOINTS = ['pull', 'queue', 'review', 'push'];

const thresholds = {};
for (const e of ENDPOINTS) {
  thresholds[`http_req_duration{endpoint:${e},phase:load}`] = [`p(95)<${P95_MS}`];
  thresholds[`http_req_failed{endpoint:${e},phase:load}`] = ['rate<0.01'];
  thresholds[`http_reqs{endpoint:${e},phase:load}`] = ['count>0'];
}

export const options = {
  scenarios: {
    warmup: {
      executor: 'constant-vus',
      vus: WARMUP_VUS,
      duration: WARMUP,
      gracefulStop: '0s',
      tags: { phase: 'warmup' },
    },
    load: {
      executor: 'ramping-vus',
      startTime: WARMUP,
      startVUs: 0,
      stages: [
        { duration: RAMP, target: VUS },
        { duration: HOLD, target: VUS },
      ],
      gracefulRampDown: '0s',
      gracefulStop: '30s',
      tags: { phase: 'load' },
    },
  },
  thresholds,
  summaryTrendStats: ['avg', 'min', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
  // A bejelentkezés (setup) nem része a mérésnek.
  setupTimeout: '5m',
};

function int(name, def) {
  const v = __ENV[name] === undefined ? def : Number(__ENV[name]);
  if (!Number.isInteger(v) || v < 0) fail(`${name}: nemnegatív egész kell`);
  return v;
}

// ---------------------------------------------------------------------------
// setup: minden szükséges felhasználó egyszeri bejelentkezése
// ---------------------------------------------------------------------------

export function setup() {
  const needed = Math.min(USERS, VUS + WARMUP_VUS);
  if (USERS < VUS + WARMUP_VUS) {
    console.warn(`USERS (${USERS}) < VUS + WARMUP_VUS: egyes felhasználókat több VU használ párhuzamosan.`);
  }
  const health = http.get(`${BASE_URL}/health`);
  if (health.status !== 200) fail(`Az API nem érhető el: ${BASE_URL} (${health.status})`);

  const tokens = [];
  // Kötegelt párhuzamos bejelentkezés (argon2 ellenőrzés: szándékosan lassú).
  for (let start = 1; start <= needed; start += 10) {
    const batch = [];
    for (let i = start; i < Math.min(start + 10, needed + 1); i++) {
      batch.push([
        'POST',
        `${BASE_URL}/auth/login`,
        JSON.stringify({ email: email(i), password: PASSWORD }),
        { headers: { 'Content-Type': 'application/json' }, tags: { endpoint: 'login' } },
      ]);
    }
    for (const res of http.batch(batch)) {
      if (res.status !== 200) {
        fail(
          `Bejelentkezés sikertelen (${res.status}). Fut a seed (npm run loadtest:seed)? ` +
            `Ki van kapcsolva a rate limit (THROTTLE_ENABLED=false)?`,
        );
      }
      tokens.push(res.json('accessToken'));
    }
  }
  // Inkrementális szinkron kiindulópontja: a teszt kezdete. Így a pull a
  // klienshez hasonlóan csak az azóta történt változásokat hozza.
  return { tokens, startedAt: new Date().toISOString() };
}

// ---------------------------------------------------------------------------
// VU-szintű állapot (iterációk között megmarad)
// ---------------------------------------------------------------------------

let cursor = null;
let deviceId = null;

function initialCursor(startedAt) {
  const pos = { t: startedAt, id: '00000000-0000-0000-0000-000000000000' };
  const c = { v: 1, final: true, streams: { progress: pos, words: pos, reviewLogs: pos } };
  return encoding.b64encode(JSON.stringify(c), 'rawurl');
}

function uuidv4() {
  const b = new Uint8Array(16);
  for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** Valószerű osztályzat: ~10% hibás, 15% nehéz, 50% jó, 25% könnyű. */
function randomGrade() {
  const r = Math.random();
  if (r < 0.1) return Math.floor(Math.random() * 3);
  if (r < 0.25) return 3;
  if (r < 0.75) return 4;
  return 5;
}

const between = (lo, hi) => lo + Math.random() * (hi - lo);

// ---------------------------------------------------------------------------
// Egy tanulási munkamenet
// ---------------------------------------------------------------------------

export default function (data) {
  const token = data.tokens[(exec.vu.idInTest - 1) % data.tokens.length];
  const params = (endpoint) => ({
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    tags: { endpoint },
  });
  if (cursor === null) {
    cursor = initialCursor(data.startedAt);
    deviceId = `k6-vu-${exec.vu.idInTest}`;
  }

  // 1. Szinkron az alkalmazás indításakor.
  pullAll(params);

  // 2. Napi kártyasor.
  const qRes = http.get(`${BASE_URL}/study/queue?limit=100`, Object.assign(params('queue'), { name: 'GET /study/queue' }));
  check(qRes, { 'queue 200': (r) => r.status === 200 });
  let cards = [];
  if (qRes.status === 200) {
    const q = qRes.json();
    cards = [...q.learning, ...q.reviews, ...q.newCards].map((c) => c.progressId);
  }

  // 3. Online értékelés kártyánként, gondolkodási idővel.
  const online = cards.slice(0, SESSION_CARDS);
  for (const progressId of online) {
    sleep(between(2, 6));
    const res = http.post(
      `${BASE_URL}/study/cards/${progressId}/reviews`,
      JSON.stringify({ reviewId: uuidv4(), grade: randomGrade(), responseTimeMs: Math.round(between(1200, 7000)), deviceId }),
      Object.assign(params('review'), { name: 'POST /study/cards/:id/reviews' }),
    );
    check(res, { 'review 200': (r) => r.status === 200 });
  }

  // 4. Offline értékelt kártyák feltöltése kötegben (a mobilkliens útja).
  const offline = cards.slice(SESSION_CARDS, SESSION_CARDS + OFFLINE_CARDS);
  if (offline.length > 0) {
    const now = Date.now();
    const reviews = offline.map((progressId, i) => ({
      reviewId: uuidv4(),
      progressId,
      grade: randomGrade(),
      responseTimeMs: Math.round(between(1200, 7000)),
      reviewedAt: new Date(now - (offline.length - i) * 5000).toISOString(),
    }));
    const res = http.post(
      `${BASE_URL}/sync/push`,
      JSON.stringify({ clientTime: new Date(now).toISOString(), deviceId, customWords: [], enrollments: [], cardChanges: [], reviews }),
      Object.assign(params('push'), { name: 'POST /sync/push' }),
    );
    check(res, { 'push 200': (r) => r.status === 200 });
  }

  // 5. Szinkron a push után.
  pullAll(params);

  // Szünet a következő munkamenetig.
  sleep(between(5, 15));
}

function pullAll(params) {
  for (let page = 0; page < 10; page++) {
    const res = http.get(
      `${BASE_URL}/sync/pull?limit=500&cursor=${cursor}`,
      Object.assign(params('pull'), { name: 'GET /sync/pull' }),
    );
    if (!check(res, { 'pull 200': (r) => r.status === 200 })) return;
    const body = res.json();
    cursor = body.cursor;
    if (!body.hasMore) return;
  }
}

// ---------------------------------------------------------------------------
// Összesítés: végpontonkénti medián / p95 / p99 / hibaarány a mért fázisból
// ---------------------------------------------------------------------------

export function handleSummary(data) {
  const m = data.metrics;
  const endpoints = {};
  for (const e of ENDPOINTS) {
    const d = m[`http_req_duration{endpoint:${e},phase:load}`];
    const f = m[`http_req_failed{endpoint:${e},phase:load}`];
    const n = m[`http_reqs{endpoint:${e},phase:load}`];
    if (!d) continue;
    endpoints[e] = {
      count: n ? n.values.count : null,
      rps: n ? n.values.rate : null,
      avg: d.values.avg,
      med: d.values.med,
      p90: d.values['p(90)'],
      p95: d.values['p(95)'],
      p99: d.values['p(99)'],
      max: d.values.max,
      errorRate: f ? f.values.rate : null,
    };
  }
  const result = {
    run: RUN,
    finishedAt: new Date().toISOString(),
    config: { baseUrl: BASE_URL, vus: VUS, warmupVus: WARMUP_VUS, users: USERS, sessionCards: SESSION_CARDS, offlineCards: OFFLINE_CARDS, p95TargetMs: P95_MS },
    endpoints,
    checksPassRate: m.checks ? m.checks.values.rate : null,
    thresholdsOk: Object.values(m).every((x) => !x.thresholds || Object.values(x.thresholds).every((t) => t.ok)),
  };

  const f1 = (x) => (x === null || x === undefined ? '–' : x.toFixed(1));
  const lines = [
    '',
    `Mért fázis (${RAMP} felfutás + ${HOLD}, ${VUS} VU) – válaszidő ezredmásodpercben, cél: p95 < ${P95_MS} ms`,
    'végpont   kérés    medián     p95     p99     max   hibaarány',
  ];
  for (const [e, v] of Object.entries(endpoints)) {
    lines.push(
      `${e.padEnd(8)} ${String(v.count).padStart(6)} ${f1(v.med).padStart(8)} ${f1(v.p95).padStart(7)} ${f1(v.p99).padStart(7)} ` +
        `${f1(v.max).padStart(7)}   ${(100 * (v.errorRate || 0)).toFixed(2)}%`,
    );
  }
  lines.push(`küszöbök: ${result.thresholdsOk ? 'teljesültek' : 'NEM teljesültek'}`, '');

  return {
    stdout: lines.join('\n'),
    [`${OUT_DIR}/futas-${RUN}.json`]: JSON.stringify(result, null, 2),
    [`${OUT_DIR}/futas-${RUN}-nyers.json`]: JSON.stringify(data),
  };
}
