-- =============================================================================
-- 6. migráció: adminisztráció és hibabejelentések.
--
--  - users.role: USER / ADMIN. Az admin ellenőrzi a központi szókincset és
--    kezeli a bejelentéseket. Szerepkört a `npm run user:role` parancs ad.
--  - words.review_status (+ reviewed_at, reviewed_by_id): a központi szótár
--    emberi ellenőrzöttsége. A REJECTED szó a felhasználóknak nem jelenik meg,
--    a szinkron törölt szóként (tombstone) küldi le. A státusz módosítása a
--    meglévő touch_versioned_row() trigger miatt a szó verzióját is lépteti,
--    így a változás eljut minden eszközre.
--  - word_reports: a felhasználók szabad szöveges hibabejelentései egy szóról.
--    Az azonosítót a kliens adja (offline rögzítés, idempotens feltöltés).
-- Az első blokk GENERÁLT (`prisma migrate diff`), a CHECK-ek kéziek.
-- =============================================================================

-- CreateEnum
CREATE TYPE "user_role" AS ENUM ('USER', 'ADMIN');

-- CreateEnum
CREATE TYPE "word_review_status" AS ENUM ('UNREVIEWED', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "report_category" AS ENUM ('TRANSLATION', 'GRAMMAR', 'SPELLING', 'OTHER');

-- CreateEnum
CREATE TYPE "report_status" AS ENUM ('OPEN', 'RESOLVED', 'DISMISSED');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "role" "user_role" NOT NULL DEFAULT 'USER';

-- AlterTable
ALTER TABLE "words" ADD COLUMN     "review_status" "word_review_status" NOT NULL DEFAULT 'UNREVIEWED',
ADD COLUMN     "reviewed_at" TIMESTAMPTZ(3),
ADD COLUMN     "reviewed_by_id" UUID;

-- CreateTable
CREATE TABLE "word_reports" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "word_id" UUID NOT NULL,
    "card_type" "card_type",
    "category" "report_category" NOT NULL DEFAULT 'OTHER',
    "message" VARCHAR(1000) NOT NULL,
    "status" "report_status" NOT NULL DEFAULT 'OPEN',
    "admin_note" VARCHAR(1000),
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "received_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMPTZ(3),
    "resolved_by_id" UUID,

    CONSTRAINT "word_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "word_reports_status_received_at_idx" ON "word_reports"("status", "received_at");

-- CreateIndex
CREATE INDEX "word_reports_word_id_idx" ON "word_reports"("word_id");

-- CreateIndex
CREATE INDEX "word_reports_user_id_idx" ON "word_reports"("user_id");

-- CreateIndex
CREATE INDEX "words_review_status_owner_id_idx" ON "words"("review_status", "owner_id");

-- AddForeignKey
ALTER TABLE "words" ADD CONSTRAINT "words_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "word_reports" ADD CONSTRAINT "word_reports_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "word_reports" ADD CONSTRAINT "word_reports_word_id_fkey" FOREIGN KEY ("word_id") REFERENCES "words"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "word_reports" ADD CONSTRAINT "word_reports_resolved_by_id_fkey" FOREIGN KEY ("resolved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Kézi kényszerek -----------------------------------------------------------------
ALTER TABLE "word_reports"
  ADD CONSTRAINT "word_reports_message_not_blank_chk"
    CHECK (length(btrim("message")) > 0),
  ADD CONSTRAINT "word_reports_admin_note_not_blank_chk"
    CHECK ("admin_note" IS NULL OR length(btrim("admin_note")) > 0),
  -- Lezárt bejelentésnek van lezárási ideje, nyitottnak nincs.
  ADD CONSTRAINT "word_reports_resolution_chk"
    CHECK (("status" = 'OPEN') = ("resolved_at" IS NULL));

-- Ellenőrzött / elutasított szónál az ellenőrzés ideje kötelező.
ALTER TABLE "words"
  ADD CONSTRAINT "words_review_consistency_chk"
    CHECK (("review_status" = 'UNREVIEWED') = ("reviewed_at" IS NULL));
