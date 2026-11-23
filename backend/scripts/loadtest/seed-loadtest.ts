/**
 * Terheléses méréshez szükséges adatbázis-állomány előállítása.
 *
 *   n felhasználó × m kártya / felhasználó × k értékelési napló / tanult kártya
 *
 * Az alapértékek kb. egy év rendszeres napi használatát modellezik
 * (lásd loadtest/README.md): 200 felhasználó, 1500 kártya és tanult
 * kártyánként 8 napló → ~300 000 user_progress és ~2,2 millió review_logs sor.
 *
 * Futtatás (a backend mappából):
 *   npm run loadtest:seed -- --users 200 --cards 1500 --reviews 8
 *
 * A generálás egyetlen SQL utasításcsoportban, a szerveren fut
 * (generate_series), így milliós nagyságrendnél is perces nagyságrendű.
 * Idempotens: előbb törli a korábbi terhelésteszt-felhasználókat
 * (`loadtest-NNNN@loadtest.local`), a kártyáik és naplóik kaszkádolva törlődnek.
 * A központi szókatalógust (prisma/seed.ts) nem módosítja, de igényli.
 */
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import { parseArgs } from 'node:util';

/** A k6 szkript is ezt használja (loadtest/k6-valaszido.js). */
export const LOADTEST_PASSWORD = 'Terheles-Teszt-2026';
export const LOADTEST_EMAIL_DOMAIN = 'loadtest.local';

interface SeedOptions {
  users: number;
  cards: number;
  reviews: number;
  allowRemote: boolean;
}

function parseOptions(): SeedOptions {
  const { values } = parseArgs({
    options: {
      users: { type: 'string', short: 'n', default: process.env.LT_USERS ?? '200' },
      cards: { type: 'string', short: 'm', default: process.env.LT_CARDS ?? '1500' },
      reviews: { type: 'string', short: 'k', default: process.env.LT_REVIEWS ?? '8' },
      'allow-remote': { type: 'boolean', default: false },
    },
  });
  const int = (name: string, raw: string | undefined, min: number, max: number): number => {
    const v = Number(raw);
    if (!Number.isInteger(v) || v < min || v > max) {
      throw new Error(`--${name}: egész szám kell ${min} és ${max} között (kapott: ${raw})`);
    }
    return v;
  };
  return {
    users: int('users', values.users, 1, 9999),
    cards: int('cards', values.cards, 1, 100_000),
    reviews: int('reviews', values.reviews, 1, 1000),
    allowRemote: values['allow-remote'] ?? false,
  };
}

/** Véletlenül se fusson éles adatbázison: csak helyi / docker compose host engedett. */
function assertLocalDatabase(allowRemote: boolean): void {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('Hiányzó DATABASE_URL');
  }
  const host = new URL(url).hostname;
  if (!allowRemote && !['localhost', '127.0.0.1', '::1', 'db'].includes(host)) {
    throw new Error(`A célgép (${host}) nem helyi. Ha biztosan ezt akarod: --allow-remote`);
  }
}

async function main(): Promise<void> {
  const opt = parseOptions();
  assertLocalDatabase(opt.allowRemote);
  const prisma = new PrismaClient();
  const t0 = Date.now();
  const step = (msg: string): void => console.log(`[${((Date.now() - t0) / 1000).toFixed(1).padStart(6)} s] ${msg}`);

  try {
    const catalog = await prisma.word.count({ where: { ownerId: null, isActive: true } });
    // Szavanként két kártyatípus (felismerés, felidézés) választható.
    if (catalog * 2 < opt.cards) {
      throw new Error(
        `A katalógusban ${catalog} szó van (${catalog * 2} kártya), kevés a --cards ${opt.cards} értékhez. Előbb: npm run db:seed`,
      );
    }

    step('Korábbi terhelésteszt-felhasználók törlése…');
    await prisma.$executeRawUnsafe(`DELETE FROM users WHERE email LIKE '%@${LOADTEST_EMAIL_DOMAIN}'`);
    // A törölt sorok helyét (és a holt indexbejegyzéseket) fel kell szabadítani,
    // különben futásról futásra nőne a tábla és az index, és a mérések nem
    // azonos kiinduló állapotból indulnának.
    step('VACUUM a törlés után…');
    await prisma.$executeRawUnsafe('VACUUM users, user_progress, review_logs, refresh_tokens');

    step(`${opt.users} felhasználó létrehozása…`);
    // Egyetlen hash mindenkinek: a jelszó azonos, az argon2 számítás drága.
    const passwordHash = await argon2.hash(LOADTEST_PASSWORD, { type: argon2.argon2id });
    await prisma.$executeRawUnsafe(
      `INSERT INTO users (email, password_hash, display_name, created_at, updated_at)
       SELECT format('loadtest-%s@${LOADTEST_EMAIL_DOMAIN}', lpad(i::text, 4, '0')), $1,
              format('Terhelés %s', i), now() - interval '400 days', now()
       FROM generate_series(1, $2::int) AS i`,
      passwordHash,
      opt.users,
    );

    step(`${opt.users * opt.cards} kártya (user_progress) generálása…`);
    // Felhasználónként determinisztikusan „kevert” m (szó, kártyatípus) pár.
    // Állapotmegoszlás egy év után: 8% NEW (felvett, még nem tanult),
    // 3% LEARNING, 2% RELEARNING, 87% REVIEW. Az intervallum log-egyenletes
    // 1–365 nap között, így a REVIEW kártyák ~20%-a esedékes 24 órán belül
    // (1500 kártyánál ~280); a sort a napi 200-as ismétlési keret vágja le.
    await prisma.$executeRawUnsafe(
      `INSERT INTO user_progress (
         id, user_id, word_id, card_type, state, ease_factor, interval_days, repetitions,
         lapses, total_reviews, correct_reviews, avg_response_ms, stability_days,
         last_reviewed_at, next_review_at, version, created_at, updated_at)
       SELECT gen_random_uuid(), c.user_id, c.word_id, c.card_type, c.state,
              CASE WHEN c.state = 'NEW' THEN 2.50 ELSE round((1.3 + c.r3 * 1.6)::numeric, 2) END,
              c.iv,
              CASE WHEN c.state = 'REVIEW' THEN $2::int - 1 ELSE 0 END,
              CASE WHEN c.state = 'RELEARNING' THEN 1 + floor(c.r3 * 3)::int ELSE floor(c.r3 * 2)::int END,
              CASE WHEN c.state = 'NEW' THEN 0 ELSE $2::int END,
              CASE WHEN c.state = 'NEW' THEN 0 ELSE round($2::int * 0.85)::int END,
              CASE WHEN c.state = 'NEW' THEN NULL ELSE 1500 + floor(c.r4 * 4500)::int END,
              CASE WHEN c.state = 'REVIEW' THEN c.iv::numeric ELSE NULL END,
              c.last_at,
              CASE c.state
                WHEN 'NEW' THEN NULL
                WHEN 'REVIEW' THEN c.last_at + c.iv * interval '1 day'
                ELSE now() - c.r2 * interval '30 minutes'
              END,
              CASE WHEN c.state = 'NEW' THEN 1 ELSE 1 + $2::int END,
              c.created_at,
              coalesce(c.last_at, c.created_at)
       FROM (
         SELECT s.*,
                CASE WHEN s.state = 'REVIEW' THEN greatest(1, floor(exp(s.r2 * ln(365)))::int) ELSE 0 END AS iv,
                CASE
                  WHEN s.state = 'NEW' THEN NULL
                  WHEN s.state = 'REVIEW' THEN greatest(s.created_at + interval '1 day',
                                                        now() - floor(exp(s.r2 * ln(365))) * s.r4 * interval '1 day')
                  ELSE now() - interval '1 hour' - s.r2 * interval '1 hour'
                END AS last_at
         FROM (
           SELECT p.user_id, p.word_id, p.card_type,
                  CASE WHEN p.r1 < 0.08 THEN 'NEW' WHEN p.r1 < 0.11 THEN 'LEARNING'
                       WHEN p.r1 < 0.13 THEN 'RELEARNING' ELSE 'REVIEW' END::card_state AS state,
                  random() AS r2, random() AS r3, random() AS r4,
                  now() - (180 + 185 * random()) * interval '1 day' AS created_at
           FROM (
             SELECT u.id AS user_id, x.word_id, x.card_type, random() AS r1
             FROM users u
             CROSS JOIN LATERAL (
               SELECT w.id AS word_id, ct AS card_type
               FROM words w
               CROSS JOIN unnest(ARRAY['RECOGNITION', 'PRODUCTION']::card_type[]) AS ct
               WHERE w.owner_id IS NULL AND w.is_active
               ORDER BY md5(u.id::text || w.id::text || ct::text)
               LIMIT $1::int
             ) x
             WHERE u.email LIKE '%@${LOADTEST_EMAIL_DOMAIN}'
           ) p
         ) s
       ) c`,
      opt.cards,
      opt.reviews,
    );

    step(`Értékelési naplók (review_logs, tanult kártyánként ${opt.reviews}) generálása…`);
    // A k értékelés egyenletesen oszlik el a kártya felvétele és az utolsó
    // ismétlés között; az első NEW → LEARNING, a többi REVIEW → REVIEW.
    // Osztályzat-megoszlás: ~10% hibás (0–2), 15% nehéz (3), 50% jó (4), 25% könnyű (5).
    await prisma.$executeRawUnsafe(
      `INSERT INTO review_logs (
         id, user_id, progress_id, grade, response_time_ms, reviewed_at, received_at,
         state_before, state_after, ease_factor_before, ease_factor_after,
         interval_days_before, interval_days_after, elapsed_days, scheduled_next_review_at)
       SELECT gen_random_uuid(), l.user_id, l.id,
              CASE WHEN l.g < 0.03 THEN 0 WHEN l.g < 0.06 THEN 1 WHEN l.g < 0.10 THEN 2
                   WHEN l.g < 0.25 THEN 3 WHEN l.g < 0.75 THEN 4 ELSE 5 END,
              1000 + floor(random() * 7000)::int,
              l.at, l.at,
              CASE WHEN l.i = 1 THEN 'NEW' ELSE 'REVIEW' END::card_state,
              CASE WHEN l.i = 1 THEN 'LEARNING' ELSE 'REVIEW' END::card_state,
              l.ease_factor, l.ease_factor,
              floor(l.interval_days * (l.i - 1)::numeric / $1::int)::int,
              floor(l.interval_days * l.i::numeric / $1::int)::int,
              CASE WHEN l.i = 1 THEN NULL
                   ELSE round((extract(epoch FROM (l.last_reviewed_at - l.created_at)) / 86400 / $1::int)::numeric, 4) END,
              l.at + floor(l.interval_days * l.i::numeric / $1::int) * interval '1 day'
       FROM (
         SELECT p.id, p.user_id, p.ease_factor, p.interval_days, p.created_at, p.last_reviewed_at, i, random() AS g,
                p.created_at + (p.last_reviewed_at - p.created_at) * (i::numeric / $1::int) AS at
         FROM user_progress p
         JOIN users u ON u.id = p.user_id AND u.email LIKE '%@${LOADTEST_EMAIL_DOMAIN}'
         CROSS JOIN generate_series(1, $1::int) AS i
         WHERE p.state <> 'NEW'
       ) l`,
      opt.reviews,
    );

    step('ANALYZE (friss statisztika a lekérdezéstervezőnek)…');
    await prisma.$executeRawUnsafe('ANALYZE users, user_progress, review_logs');

    const rows = await prisma.$queryRawUnsafe<{ progress: bigint; logs: bigint; due: bigint; size: string }[]>(
      `SELECT (SELECT count(*) FROM user_progress) AS progress,
              (SELECT count(*) FROM review_logs) AS logs,
              (SELECT count(*) FROM user_progress WHERE state <> 'NEW' AND next_review_at < now() + interval '1 day') AS due,
              pg_size_pretty(pg_database_size(current_database())) AS size`,
    );
    const stats = rows[0];
    step('Kész.');
    if (stats) {
      console.log(`  felhasználó (teszt):  ${opt.users}`);
      console.log(`  user_progress sor:    ${stats.progress}`);
      console.log(`  review_logs sor:      ${stats.logs}`);
      console.log(`  24 órán belül esedékes kártya / felhasználó (átlag): ${Math.round(Number(stats.due) / opt.users)}`);
      console.log(`  adatbázis mérete:     ${stats.size}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
