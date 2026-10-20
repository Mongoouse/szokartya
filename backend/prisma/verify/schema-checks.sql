-- =============================================================================
-- Séma-ellenőrző szkript: kényszerek, triggerek és indexhasználat.
--
-- Futtatás (migrált adatbázison, a seed után) – Windows, macOS, Linux:
--   npm run db:verify
-- (a `prisma db execute` futtatja, a .env DATABASE_URL-jével; psql nem kell).
-- Részletes, állításonkénti kimenethez psql-lel is futtatható:
--   psql "<kapcsolat ?schema=public nélkül>" -v ON_ERROR_STOP=1 -f prisma/verify/schema-checks.sql
--
-- Minden ellenőrzés egyetlen tranzakcióban fut, ROLLBACK-kel zárul, így az
-- adatbázis állapota nem változik. Bármely sikertelen állítás kivételt dob,
-- és a parancs nem nulla kilépési kóddal ér véget.
-- Csak szabványos SQL: psql-specifikus meta-parancs (\o, \set …) ne kerüljön bele.
-- =============================================================================

BEGIN;

-- Segédfüggvény: a megadott utasításnak a várt SQLSTATE-tel kell elbuknia.
CREATE FUNCTION pg_temp.expect_error(stmt text, expected_state text, label text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE stmt;
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE = expected_state THEN
      RAISE NOTICE 'OK   %', label;
      RETURN;
    END IF;
    RAISE EXCEPTION 'HIBA % – váratlan SQLSTATE % (%): %', label, SQLSTATE, expected_state, SQLERRM;
  END;
  RAISE EXCEPTION 'HIBA % – az utasítás nem bukott el', label;
END;
$$;

-- Tesztadatok ------------------------------------------------------------------
INSERT INTO users (id, email, password_hash)
VALUES ('00000000-0000-4000-8000-000000000001', 'Teszt@Example.hu', '$argon2id$v=19$m=65536,t=3,p=4$x$y');

INSERT INTO words (id, lemma, part_of_speech, cefr_level)
VALUES ('00000000-0000-4000-8000-0000000000a1', 'Testverb', 'VERB', 'A1'),
       ('00000000-0000-4000-8000-0000000000a2', 'Testnomen', 'NOUN', 'A1');

-- 1) Szófaji konzisztencia (kompozit FK + CHECK) ------------------------------
SELECT pg_temp.expect_error(
  $q$INSERT INTO noun_attributes (word_id, gender, plural_form)
     VALUES ('00000000-0000-4000-8000-0000000000a1', 'MASCULINE', 'Testverbe')$q$,
  '23503', 'főnévi attribútum nem köthető igéhez (kompozit FK)');

SELECT pg_temp.expect_error(
  $q$INSERT INTO noun_attributes (word_id, part_of_speech, gender, plural_form)
     VALUES ('00000000-0000-4000-8000-0000000000a1', 'VERB', 'MASCULINE', 'X')$q$,
  '23514', 'noun_attributes.part_of_speech csak NOUN lehet');

SELECT pg_temp.expect_error(
  $q$UPDATE words SET part_of_speech = 'VERB' WHERE id = (
       SELECT w.id FROM words w JOIN noun_attributes n ON n.word_id = w.id LIMIT 1)$q$,
  '23503', 'attribútummal rendelkező szó szófaja nem módosítható (ON UPDATE RESTRICT)');

-- 2) Főnévi szabályok -----------------------------------------------------------
SELECT pg_temp.expect_error(
  $q$INSERT INTO noun_attributes (word_id, gender, number_type)
     VALUES ('00000000-0000-4000-8000-0000000000a2', 'NEUTER', 'REGULAR')$q$,
  '23514', 'REGULAR főnévhez kötelező a többes szám');

SELECT pg_temp.expect_error(
  $q$INSERT INTO noun_attributes (word_id, gender, number_type, plural_form)
     VALUES ('00000000-0000-4000-8000-0000000000a2', 'NEUTER', 'PLURAL_ONLY', 'Testnomen')$q$,
  '23514', 'PLURAL_ONLY főnévnek nincs neme');

-- 3) Ige: elváló igekötő ------------------------------------------------------
SELECT pg_temp.expect_error(
  $q$INSERT INTO verb_attributes (word_id, conjugation_type, auxiliary, present_3sg,
       preterite_3sg, past_participle, is_separable)
     VALUES ('00000000-0000-4000-8000-0000000000a1', 'REGULAR', 'HABEN', 'a', 'b', 'c', true)$q$,
  '23514', 'elváló igéhez kötelező az igekötő');

-- 4) Vonzatok -----------------------------------------------------------------
SELECT pg_temp.expect_error(
  $q$INSERT INTO valencies (word_id, preposition, governed_case, pattern)
     VALUES ('00000000-0000-4000-8000-0000000000a1', 'auf', 'NOMINATIVE', 'x auf + Nom.')$q$,
  '23514', 'elöljárós vonzat nem lehet alanyeset');

INSERT INTO valencies (word_id, preposition, governed_case, pattern)
VALUES ('00000000-0000-4000-8000-0000000000a1', NULL, 'DATIVE', 'testverb + Dat.');
SELECT pg_temp.expect_error(
  $q$INSERT INTO valencies (word_id, preposition, governed_case, pattern)
     VALUES ('00000000-0000-4000-8000-0000000000a1', NULL, 'DATIVE', 'duplikátum')$q$,
  '23505', 'azonos esetvonzat NULL elöljáróval sem duplikálható (NULLS NOT DISTINCT)');

-- 5) Szó-identitás a központi szótárban (owner_id IS NULL) ----------------------
SELECT pg_temp.expect_error(
  $q$INSERT INTO words (lemma, part_of_speech) VALUES ('Testverb', 'VERB')$q$,
  '23505', 'központi szótárban nincs duplikált lemma (NULLS NOT DISTINCT)');

-- 6) Fordítások -----------------------------------------------------------------
INSERT INTO translations (word_id, text, is_primary)
VALUES ('00000000-0000-4000-8000-0000000000a1', 'tesztel', true);
SELECT pg_temp.expect_error(
  $q$INSERT INTO translations (word_id, text, is_primary)
     VALUES ('00000000-0000-4000-8000-0000000000a1', 'próbál', true)$q$,
  '23505', 'legfeljebb egy elsődleges fordítás');

-- 7) Felhasználók ------------------------------------------------------------
SELECT pg_temp.expect_error(
  $q$INSERT INTO users (email, password_hash) VALUES ('teszt@example.HU', 'h')$q$,
  '23505', 'e-mail egyediség kis-/nagybetűtől függetlenül (citext)');

-- 8) Tanulási állapot ---------------------------------------------------------
SELECT pg_temp.expect_error(
  $q$INSERT INTO user_progress (user_id, word_id, state, ease_factor, next_review_at)
     VALUES ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a1',
             'REVIEW', 1.0, now())$q$,
  '23514', 'ease_factor >= 1.30');

SELECT pg_temp.expect_error(
  $q$INSERT INTO user_progress (user_id, word_id, state)
     VALUES ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a1', 'REVIEW')$q$,
  '23514', 'ütemezett állapotban kötelező a next_review_at');

INSERT INTO user_progress (id, user_id, word_id, state, interval_days, repetitions,
                           total_reviews, correct_reviews, last_reviewed_at, next_review_at)
VALUES ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-000000000001',
        '00000000-0000-4000-8000-0000000000a1', 'REVIEW', 3, 2, 2, 2,
        now() - interval '3 days', now() - interval '1 hour');

-- 9) review_logs --------------------------------------------------------------
SELECT pg_temp.expect_error(
  $q$INSERT INTO review_logs (id, user_id, progress_id, grade, response_time_ms, reviewed_at,
       state_before, state_after, ease_factor_before, ease_factor_after,
       interval_days_before, interval_days_after, scheduled_next_review_at)
     VALUES (gen_random_uuid(), '00000000-0000-4000-8000-000000000001',
             '00000000-0000-4000-8000-0000000000b1', 7, 1200, now(),
             'REVIEW', 'REVIEW', 2.5, 2.6, 3, 8, now() + interval '8 days')$q$,
  '23514', 'grade 0–5 tartományban');

INSERT INTO review_logs (id, user_id, progress_id, grade, response_time_ms, reviewed_at,
                         state_before, state_after, ease_factor_before, ease_factor_after,
                         interval_days_before, interval_days_after, scheduled_next_review_at)
VALUES ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-000000000001',
        '00000000-0000-4000-8000-0000000000b1', 4, 1500, now(),
        'REVIEW', 'REVIEW', 2.5, 2.5, 3, 8, now() + interval '8 days');

SELECT pg_temp.expect_error(
  $q$UPDATE review_logs SET grade = 5 WHERE id = '00000000-0000-4000-8000-0000000000c1'$q$,
  '23001', 'review_logs append-only');

-- 10) Triggerek: version és updated_at ----------------------------------------
-- Tranzakción belül now() állandó, ezért az updated_at-et (a trigger ideiglenes
-- kikapcsolásával) a múltba állítjuk, hogy a változás kimutatható legyen.
ALTER TABLE user_progress DISABLE TRIGGER touch_row;
UPDATE user_progress SET updated_at = '2000-01-01', version = 1
 WHERE id = '00000000-0000-4000-8000-0000000000b1';
ALTER TABLE user_progress ENABLE TRIGGER touch_row;

DO $$
DECLARE r record;
BEGIN
  -- Valódi változás nélküli UPDATE: sem version, sem updated_at nem változik.
  UPDATE user_progress SET interval_days = interval_days
   WHERE id = '00000000-0000-4000-8000-0000000000b1';
  SELECT version, updated_at INTO r FROM user_progress
   WHERE id = '00000000-0000-4000-8000-0000000000b1';
  IF r.version <> 1 OR r.updated_at <> '2000-01-01' THEN
    RAISE EXCEPTION 'HIBA no-op UPDATE léptette a verziót / időbélyeget (%, %)', r.version, r.updated_at;
  END IF;

  -- Valódi változás: version + 1, a kliens által küldött version figyelmen kívül marad.
  UPDATE user_progress SET interval_days = 8, version = 99
   WHERE id = '00000000-0000-4000-8000-0000000000b1';
  SELECT version, updated_at INTO r FROM user_progress
   WHERE id = '00000000-0000-4000-8000-0000000000b1';
  IF r.version <> 2 OR r.updated_at < '2001-01-01' THEN
    RAISE EXCEPTION 'HIBA version/updated_at trigger (version=%, updated_at=%)', r.version, r.updated_at;
  END IF;
  RAISE NOTICE 'OK   version / updated_at triggerek';
END;
$$;

-- 11) Indexhasználat: esedékes kártyák ----------------------------------------
-- Kis adathalmazon a tervező seq scant választana, ezért azt letiltjuk; a cél
-- annak igazolása, hogy a lekérdezés alakja illeszkedik a részleges indexre.
SET LOCAL enable_seqscan = off;
DO $$
DECLARE
  line record;
  plan text := '';
BEGIN
  FOR line IN EXECUTE $q$EXPLAIN (FORMAT TEXT)
    SELECT id FROM user_progress
     WHERE user_id = '00000000-0000-4000-8000-000000000001'
       AND next_review_at <= now()
       AND state <> 'NEW' AND NOT is_suspended AND deleted_at IS NULL
     ORDER BY next_review_at
     LIMIT 50$q$
  LOOP
    plan := plan || line."QUERY PLAN" || E'\n';
  END LOOP;
  IF plan NOT LIKE '%Index Scan using user_progress_due_idx%' OR plan LIKE '%Sort%' THEN
    RAISE EXCEPTION 'HIBA az esedékes-kártya lekérdezés nem rendezésmentes index scan: %', plan;
  END IF;
  RAISE NOTICE 'OK   esedékes kártyák: index scan a user_progress_due_idx indexen, külön rendezés nélkül';
END;
$$;

ROLLBACK;
