-- =============================================================================
-- 2. migráció: a Prisma séma nyelvén nem kifejezhető adatbázis-objektumok.
--
--   1) CHECK kényszerek   – doménszabályok az adatbázis szintjén (utolsó
--                           védvonal: a nyers SQL / admin eszközök is betartják).
--   2) Egyedi indexek     – NULLS NOT DISTINCT és részleges UNIQUE.
--   3) Teljesítményindexek – részleges B-tree (esedékes / új kártyák).
--   4) Triggerek          – updated_at / version karbantartás, append-only napló.
--
-- KÉZZEL KARBANTARTOTT fájl. A Prisma (6.x) a részleges indexeket és a CHECK
-- kényszereket nem modellezi, de nem is generál rájuk DROP utasítást; új
-- migráció generálása után (`prisma migrate dev --create-only`) ezt érdemes
-- ellenőrizni.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) CHECK kényszerek
-- -----------------------------------------------------------------------------

-- users -----------------------------------------------------------------------
ALTER TABLE "users"
  ADD CONSTRAINT "users_email_format_chk"
    CHECK ("email" ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  ADD CONSTRAINT "users_daily_new_cards_limit_chk"
    CHECK ("daily_new_cards_limit" BETWEEN 0 AND 1000),
  ADD CONSTRAINT "users_daily_review_limit_chk"
    CHECK ("daily_review_limit" BETWEEN 0 AND 10000);

-- refresh_tokens --------------------------------------------------------------
ALTER TABLE "refresh_tokens"
  ADD CONSTRAINT "refresh_tokens_token_hash_format_chk"
    CHECK ("token_hash" ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT "refresh_tokens_expiry_chk"
    CHECK ("expires_at" > "created_at"),
  ADD CONSTRAINT "refresh_tokens_not_self_replaced_chk"
    CHECK ("replaced_by_id" IS DISTINCT FROM "id");

-- words -----------------------------------------------------------------------
ALTER TABLE "words"
  ADD CONSTRAINT "words_lemma_not_blank_chk"
    CHECK (btrim("lemma") <> ''),
  ADD CONSTRAINT "words_homograph_no_chk"
    CHECK ("homograph_no" >= 1),
  ADD CONSTRAINT "words_frequency_rank_chk"
    CHECK ("frequency_rank" IS NULL OR "frequency_rank" > 0),
  ADD CONSTRAINT "words_version_chk"
    CHECK ("version" >= 1);

-- noun_attributes -------------------------------------------------------------
-- A part_of_speech oszlop rögzített értéke + a (word_id, part_of_speech) kompozit
-- FK együtt garantálja, hogy főnévi attribútum csak NOUN szóhoz tartozhat.
ALTER TABLE "noun_attributes"
  ADD CONSTRAINT "noun_attributes_pos_chk"
    CHECK ("part_of_speech" = 'NOUN'),
  -- Csak többes számú főnévnek (die Leute) nincs nyelvtani neme.
  ADD CONSTRAINT "noun_attributes_gender_chk"
    CHECK (("number_type" = 'PLURAL_ONLY') = ("gender" IS NULL)),
  -- Rendes főnévnek kötelező a többes szám; egyes számúnak tilos.
  ADD CONSTRAINT "noun_attributes_plural_chk"
    CHECK (
      ("number_type" = 'REGULAR'       AND "plural_form" IS NOT NULL) OR
      ("number_type" = 'SINGULAR_ONLY' AND "plural_form" IS NULL) OR
      ("number_type" = 'PLURAL_ONLY')
    );

-- verb_attributes -------------------------------------------------------------
ALTER TABLE "verb_attributes"
  ADD CONSTRAINT "verb_attributes_pos_chk"
    CHECK ("part_of_speech" = 'VERB'),
  ADD CONSTRAINT "verb_attributes_separable_chk"
    CHECK ("is_separable" = ("separable_prefix" IS NOT NULL)),
  ADD CONSTRAINT "verb_attributes_forms_not_blank_chk"
    CHECK (
      btrim("present_3sg") <> '' AND
      btrim("preterite_3sg") <> '' AND
      btrim("past_participle") <> ''
    );

-- adjective_attributes --------------------------------------------------------
ALTER TABLE "adjective_attributes"
  ADD CONSTRAINT "adjective_attributes_pos_chk"
    CHECK ("part_of_speech" = 'ADJECTIVE'),
  -- Fokozható melléknévnél mindkét fok ismert, nem fokozhatónál egyik sem.
  ADD CONSTRAINT "adjective_attributes_comparison_chk"
    CHECK (("comparative" IS NULL) = ("superlative" IS NULL));

-- valencies -------------------------------------------------------------------
ALTER TABLE "valencies"
  -- Német elöljárószó soha nem vonz alanyesetet.
  ADD CONSTRAINT "valencies_prepositional_case_chk"
    CHECK ("preposition" IS NULL OR "governed_case" <> 'NOMINATIVE'),
  ADD CONSTRAINT "valencies_preposition_not_blank_chk"
    CHECK ("preposition" IS NULL OR btrim("preposition") <> ''),
  ADD CONSTRAINT "valencies_pattern_not_blank_chk"
    CHECK (btrim("pattern") <> '');

-- translations ----------------------------------------------------------------
ALTER TABLE "translations"
  ADD CONSTRAINT "translations_text_not_blank_chk"
    CHECK (btrim("text") <> '');

-- example_sentences -----------------------------------------------------------
ALTER TABLE "example_sentences"
  ADD CONSTRAINT "example_sentences_sentence_not_blank_chk"
    CHECK (btrim("sentence") <> '');

-- categories ------------------------------------------------------------------
ALTER TABLE "categories"
  ADD CONSTRAINT "categories_slug_format_chk"
    CHECK ("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  ADD CONSTRAINT "categories_not_own_parent_chk"
    CHECK ("parent_id" IS DISTINCT FROM "id");

-- user_progress ---------------------------------------------------------------
ALTER TABLE "user_progress"
  -- SM-2: EF alsó korlátja 1.3; a felső korlát a túlzott „elszállást” fogja meg.
  ADD CONSTRAINT "user_progress_ease_factor_chk"
    CHECK ("ease_factor" BETWEEN 1.30 AND 5.00),
  ADD CONSTRAINT "user_progress_counters_chk"
    CHECK (
      "interval_days"   >= 0 AND
      "repetitions"     >= 0 AND
      "learning_step"   >= 0 AND
      "lapses"          >= 0 AND
      "total_reviews"   >= 0 AND
      "correct_reviews" >= 0 AND
      "correct_reviews" <= "total_reviews" AND
      "version"         >= 1
    ),
  ADD CONSTRAINT "user_progress_metrics_chk"
    CHECK (
      ("avg_response_ms" IS NULL OR "avg_response_ms" >= 0) AND
      ("stability_days"  IS NULL OR "stability_days"  >  0)
    ),
  -- Állapotgép-invariáns: új kártya nincs ütemezve, minden más igen.
  ADD CONSTRAINT "user_progress_schedule_chk"
    CHECK (("state" = 'NEW') = ("next_review_at" IS NULL)),
  ADD CONSTRAINT "user_progress_new_card_chk"
    CHECK ("state" <> 'NEW' OR ("total_reviews" = 0 AND "last_reviewed_at" IS NULL));

-- review_logs -----------------------------------------------------------------
ALTER TABLE "review_logs"
  ADD CONSTRAINT "review_logs_grade_chk"
    CHECK ("grade" BETWEEN 0 AND 5),
  -- Felső korlát: 1 óránál hosszabb „reakcióidő” mérési hiba (app háttérben).
  ADD CONSTRAINT "review_logs_response_time_chk"
    CHECK ("response_time_ms" BETWEEN 0 AND 3600000),
  ADD CONSTRAINT "review_logs_ease_factor_chk"
    CHECK (
      "ease_factor_before" BETWEEN 1.30 AND 5.00 AND
      "ease_factor_after"  BETWEEN 1.30 AND 5.00
    ),
  ADD CONSTRAINT "review_logs_interval_chk"
    CHECK ("interval_days_before" >= 0 AND "interval_days_after" >= 0),
  ADD CONSTRAINT "review_logs_elapsed_chk"
    CHECK ("elapsed_days" IS NULL OR "elapsed_days" >= 0),
  -- Értékelés után a kártya soha nem lehet NEW állapotú.
  ADD CONSTRAINT "review_logs_state_after_chk"
    CHECK ("state_after" <> 'NEW'),
  ADD CONSTRAINT "review_logs_schedule_chk"
    CHECK ("scheduled_next_review_at" >= "reviewed_at");

-- -----------------------------------------------------------------------------
-- 2) Egyedi indexek
-- -----------------------------------------------------------------------------

-- A szó-identitás kulcs NULLS NOT DISTINCT változatra cserélve (PostgreSQL 15+):
-- alapértelmezésben két NULL owner_id „különböző”, így a központi szótárban
-- duplikált lemmák keletkezhetnének. Az index neve változatlan, így a Prisma
-- séma (words_identity_key) továbbra is egyezik vele.
DROP INDEX "words_identity_key";
CREATE UNIQUE INDEX "words_identity_key"
  ON "words" ("owner_id", "language", "lemma", "part_of_speech", "homograph_no")
  NULLS NOT DISTINCT;

-- Egy szónak ugyanazon vonzata (elöljáró + eset + reflexivitás) csak egyszer
-- szerepelhet; a NULL elöljáró (tiszta esetvonzat) is egyedinek számít.
CREATE UNIQUE INDEX "valencies_identity_key"
  ON "valencies" ("word_id", "preposition", "governed_case", "is_reflexive")
  NULLS NOT DISTINCT
  WHERE "deleted_at" IS NULL;

-- Szavanként és célnyelvenként legfeljebb egy elsődleges fordítás.
CREATE UNIQUE INDEX "translations_one_primary_key"
  ON "translations" ("word_id", "language")
  WHERE "is_primary" AND "deleted_at" IS NULL;

-- -----------------------------------------------------------------------------
-- 3) Teljesítményindexek
-- -----------------------------------------------------------------------------

-- ESEDÉKES KÁRTYÁK – a rendszer leggyakoribb lekérdezése:
--   SELECT … FROM user_progress
--    WHERE user_id = $1 AND next_review_at <= $2
--      AND state <> 'NEW' AND NOT is_suspended AND deleted_at IS NULL
--    ORDER BY next_review_at
--    LIMIT $3;
-- A (user_id, next_review_at) sorrend egyetlen index range scant ad, külön
-- rendezés nélkül. A részleges feltétel kizárja az új, felfüggesztett és törölt
-- kártyákat, így az index csak az aktívan ütemezett sorokat tartalmazza.
CREATE INDEX "user_progress_due_idx"
  ON "user_progress" ("user_id", "next_review_at")
  WHERE "state" <> 'NEW' AND NOT "is_suspended" AND "deleted_at" IS NULL;

-- ÚJ KÁRTYÁK – a napi „új kártya” keret feltöltése bevezetési sorrendben.
CREATE INDEX "user_progress_new_idx"
  ON "user_progress" ("user_id", "created_at")
  WHERE "state" = 'NEW' AND NOT "is_suspended" AND "deleted_at" IS NULL;

-- -----------------------------------------------------------------------------
-- 4) Triggerek
-- -----------------------------------------------------------------------------

-- Az updated_at és a version a szinkronizáció alapja (pull: „változott-e X óta”,
-- push: optimista konkurencia „UPDATE … WHERE id = $1 AND version = $2”), ezért
-- adatbázis szinten, szerveridővel kényszerítjük ki – a kliens vagy a Prisma
-- @updatedAt által küldött értékeket felülírjuk. Valódi adatváltozás nélküli
-- UPDATE egyiket sem lépteti, így nem generál fölösleges szinkronforgalmat.

-- Szinkronizált (verziózott) táblákhoz: updated_at + version.
CREATE OR REPLACE FUNCTION "touch_versioned_row"() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  NEW."updated_at" := OLD."updated_at";
  NEW."version"    := OLD."version";
  IF NEW IS DISTINCT FROM OLD THEN
    NEW."updated_at" := now();
    NEW."version"    := OLD."version" + 1;
  END IF;
  RETURN NEW;
END;
$$;

-- Csak updated_at mezővel rendelkező táblákhoz.
CREATE OR REPLACE FUNCTION "touch_row"() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  NEW."updated_at" := OLD."updated_at";
  IF NEW IS DISTINCT FROM OLD THEN
    NEW."updated_at" := now();
  END IF;
  RETURN NEW;
END;
$$;

-- Append-only napló: a review_logs sorai nem módosíthatók (auditálhatóság,
-- reprodukálható metrikák). Törlés megengedett (fiók törlése / GDPR).
CREATE OR REPLACE FUNCTION "forbid_update"() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'A(z) % tábla append-only, UPDATE nem engedélyezett', TG_TABLE_NAME
    USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE TRIGGER "touch_row" BEFORE UPDATE ON "words"
  FOR EACH ROW EXECUTE FUNCTION "touch_versioned_row"();
CREATE TRIGGER "touch_row" BEFORE UPDATE ON "valencies"
  FOR EACH ROW EXECUTE FUNCTION "touch_versioned_row"();
CREATE TRIGGER "touch_row" BEFORE UPDATE ON "translations"
  FOR EACH ROW EXECUTE FUNCTION "touch_versioned_row"();
CREATE TRIGGER "touch_row" BEFORE UPDATE ON "example_sentences"
  FOR EACH ROW EXECUTE FUNCTION "touch_versioned_row"();
CREATE TRIGGER "touch_row" BEFORE UPDATE ON "user_progress"
  FOR EACH ROW EXECUTE FUNCTION "touch_versioned_row"();
CREATE TRIGGER "touch_row" BEFORE UPDATE ON "users"
  FOR EACH ROW EXECUTE FUNCTION "touch_row"();
CREATE TRIGGER "touch_row" BEFORE UPDATE ON "categories"
  FOR EACH ROW EXECUTE FUNCTION "touch_row"();

CREATE TRIGGER "review_logs_append_only" BEFORE UPDATE ON "review_logs"
  FOR EACH ROW EXECUTE FUNCTION "forbid_update"();
