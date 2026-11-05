-- =============================================================================
-- Logikai törlés: `deleted_at` (időbélyeg) helyett `is_active` (logikai érték)
-- =============================================================================
--
-- A sor továbbra sem törlődik fizikailag – a hivatkozások (napló, statisztika,
-- szinkron) épek maradnak –, csak inaktív lesz. A törlés időpontja helyett az
-- `updated_at` mutatja, mikor változott a sor (a szinkron is ezt használja).
--
-- Az átírás alatt a felhasználói triggerek (updated_at, version) ki vannak
-- kapcsolva: a már törölt sorok állapota nem változik, ezért a kliensnek sem
-- kell újra letöltenie őket.

-- 1) Az új oszlop és a meglévő állapot átvétele -----------------------------

ALTER TABLE "users" ADD COLUMN "is_active" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "words" ADD COLUMN "is_active" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "valencies" ADD COLUMN "is_active" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "translations" ADD COLUMN "is_active" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "example_sentences" ADD COLUMN "is_active" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "user_progress" ADD COLUMN "is_active" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "users" DISABLE TRIGGER USER;
ALTER TABLE "words" DISABLE TRIGGER USER;
ALTER TABLE "valencies" DISABLE TRIGGER USER;
ALTER TABLE "translations" DISABLE TRIGGER USER;
ALTER TABLE "example_sentences" DISABLE TRIGGER USER;
ALTER TABLE "user_progress" DISABLE TRIGGER USER;

UPDATE "users" SET "is_active" = false WHERE "deleted_at" IS NOT NULL;
UPDATE "words" SET "is_active" = false WHERE "deleted_at" IS NOT NULL;
UPDATE "valencies" SET "is_active" = false WHERE "deleted_at" IS NOT NULL;
UPDATE "translations" SET "is_active" = false WHERE "deleted_at" IS NOT NULL;
UPDATE "example_sentences" SET "is_active" = false WHERE "deleted_at" IS NOT NULL;
UPDATE "user_progress" SET "is_active" = false WHERE "deleted_at" IS NOT NULL;

ALTER TABLE "users" ENABLE TRIGGER USER;
ALTER TABLE "words" ENABLE TRIGGER USER;
ALTER TABLE "valencies" ENABLE TRIGGER USER;
ALTER TABLE "translations" ENABLE TRIGGER USER;
ALTER TABLE "example_sentences" ENABLE TRIGGER USER;
ALTER TABLE "user_progress" ENABLE TRIGGER USER;

-- 2) A deleted_at-re épülő részleges indexek újra, is_active feltétellel -----

DROP INDEX "valencies_identity_key";
CREATE UNIQUE INDEX "valencies_identity_key"
  ON "valencies" ("word_id", "preposition", "governed_case", "is_reflexive")
  NULLS NOT DISTINCT
  WHERE "is_active";

DROP INDEX "translations_one_primary_key";
CREATE UNIQUE INDEX "translations_one_primary_key"
  ON "translations" ("word_id", "language")
  WHERE "is_primary" AND "is_active";

DROP INDEX "user_progress_due_idx";
CREATE INDEX "user_progress_due_idx"
  ON "user_progress" ("user_id", "next_review_at")
  WHERE "state" <> 'NEW' AND NOT "is_suspended" AND "is_active";

DROP INDEX "user_progress_new_idx";
CREATE INDEX "user_progress_new_idx"
  ON "user_progress" ("user_id", "created_at")
  WHERE "state" = 'NEW' AND NOT "is_suspended" AND "is_active";

-- 3) A régi oszlop elhagyása -------------------------------------------------

ALTER TABLE "users" DROP COLUMN "deleted_at";
ALTER TABLE "words" DROP COLUMN "deleted_at";
ALTER TABLE "valencies" DROP COLUMN "deleted_at";
ALTER TABLE "translations" DROP COLUMN "deleted_at";
ALTER TABLE "example_sentences" DROP COLUMN "deleted_at";
ALTER TABLE "user_progress" DROP COLUMN "deleted_at";
