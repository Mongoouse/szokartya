-- =============================================================================
-- 1. migráció: táblák, enumok, kulcsok, Prisma által kezelt indexek.
-- GENERÁLT fájl: `prisma migrate diff --from-empty --to-schema-datamodel`.
-- Kézi kiegészítések: 20261014000100_constraints_indexes.
-- =============================================================================

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "citext";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- CreateEnum
CREATE TYPE "cefr_level" AS ENUM ('A1', 'A2', 'B1', 'B2', 'C1', 'C2');

-- CreateEnum
CREATE TYPE "part_of_speech" AS ENUM ('NOUN', 'VERB', 'ADJECTIVE', 'ADVERB', 'PREPOSITION', 'CONJUNCTION', 'PRONOUN', 'PHRASE', 'OTHER');

-- CreateEnum
CREATE TYPE "grammatical_gender" AS ENUM ('MASCULINE', 'FEMININE', 'NEUTER');

-- CreateEnum
CREATE TYPE "number_type" AS ENUM ('REGULAR', 'SINGULAR_ONLY', 'PLURAL_ONLY');

-- CreateEnum
CREATE TYPE "conjugation_type" AS ENUM ('REGULAR', 'IRREGULAR', 'MIXED');

-- CreateEnum
CREATE TYPE "auxiliary_verb" AS ENUM ('HABEN', 'SEIN', 'BOTH');

-- CreateEnum
CREATE TYPE "reflexive_type" AS ENUM ('NONE', 'ACCUSATIVE', 'DATIVE');

-- CreateEnum
CREATE TYPE "grammatical_case" AS ENUM ('NOMINATIVE', 'ACCUSATIVE', 'DATIVE', 'GENITIVE');

-- CreateEnum
CREATE TYPE "card_type" AS ENUM ('RECOGNITION', 'PRODUCTION', 'GENDER');

-- CreateEnum
CREATE TYPE "card_state" AS ENUM ('NEW', 'LEARNING', 'REVIEW', 'RELEARNING');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" CITEXT NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "display_name" VARCHAR(100),
    "native_language" VARCHAR(8) NOT NULL DEFAULT 'hu',
    "timezone" VARCHAR(64) NOT NULL DEFAULT 'Europe/Budapest',
    "daily_new_cards_limit" SMALLINT NOT NULL DEFAULT 20,
    "daily_review_limit" SMALLINT NOT NULL DEFAULT 200,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "family_id" UUID NOT NULL,
    "replaced_by_id" UUID,
    "device_id" VARCHAR(128),
    "user_agent" VARCHAR(512),
    "ip_address" INET,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "words" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "language" VARCHAR(8) NOT NULL DEFAULT 'de',
    "lemma" VARCHAR(200) NOT NULL,
    "part_of_speech" "part_of_speech" NOT NULL,
    "homograph_no" SMALLINT NOT NULL DEFAULT 1,
    "cefr_level" "cefr_level",
    "ipa" VARCHAR(200),
    "audio_url" VARCHAR(1024),
    "frequency_rank" INTEGER,
    "owner_id" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "words_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "noun_attributes" (
    "word_id" UUID NOT NULL,
    "part_of_speech" "part_of_speech" NOT NULL DEFAULT 'NOUN',
    "gender" "grammatical_gender",
    "number_type" "number_type" NOT NULL DEFAULT 'REGULAR',
    "plural_form" VARCHAR(200),
    "genitive_singular" VARCHAR(200),
    "is_n_declension" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "noun_attributes_pkey" PRIMARY KEY ("word_id")
);

-- CreateTable
CREATE TABLE "verb_attributes" (
    "word_id" UUID NOT NULL,
    "part_of_speech" "part_of_speech" NOT NULL DEFAULT 'VERB',
    "conjugation_type" "conjugation_type" NOT NULL,
    "auxiliary" "auxiliary_verb" NOT NULL,
    "present_3sg" VARCHAR(200) NOT NULL,
    "preterite_3sg" VARCHAR(200) NOT NULL,
    "past_participle" VARCHAR(200) NOT NULL,
    "is_separable" BOOLEAN NOT NULL DEFAULT false,
    "separable_prefix" VARCHAR(20),
    "reflexive_type" "reflexive_type" NOT NULL DEFAULT 'NONE',

    CONSTRAINT "verb_attributes_pkey" PRIMARY KEY ("word_id")
);

-- CreateTable
CREATE TABLE "adjective_attributes" (
    "word_id" UUID NOT NULL,
    "part_of_speech" "part_of_speech" NOT NULL DEFAULT 'ADJECTIVE',
    "comparative" VARCHAR(200),
    "superlative" VARCHAR(200),
    "is_irregular_comparison" BOOLEAN NOT NULL DEFAULT false,
    "is_predicative_only" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "adjective_attributes_pkey" PRIMARY KEY ("word_id")
);

-- CreateTable
CREATE TABLE "valencies" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "word_id" UUID NOT NULL,
    "preposition" VARCHAR(30),
    "governed_case" "grammatical_case" NOT NULL,
    "is_reflexive" BOOLEAN NOT NULL DEFAULT false,
    "pattern" VARCHAR(200) NOT NULL,
    "meaning" VARCHAR(300),
    "sort_order" SMALLINT NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "valencies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "translations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "word_id" UUID NOT NULL,
    "language" VARCHAR(8) NOT NULL DEFAULT 'hu',
    "text" VARCHAR(300) NOT NULL,
    "sense_note" VARCHAR(300),
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" SMALLINT NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "translations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "example_sentences" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "word_id" UUID NOT NULL,
    "valency_id" UUID,
    "sentence" VARCHAR(1000) NOT NULL,
    "translation" VARCHAR(1000),
    "cefr_level" "cefr_level",
    "sort_order" SMALLINT NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "example_sentences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "slug" VARCHAR(100) NOT NULL,
    "name_hu" VARCHAR(100) NOT NULL,
    "name_de" VARCHAR(100) NOT NULL,
    "parent_id" UUID,
    "sort_order" SMALLINT NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "word_categories" (
    "word_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,

    CONSTRAINT "word_categories_pkey" PRIMARY KEY ("word_id","category_id")
);

-- CreateTable
CREATE TABLE "user_progress" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "word_id" UUID NOT NULL,
    "card_type" "card_type" NOT NULL DEFAULT 'RECOGNITION',
    "state" "card_state" NOT NULL DEFAULT 'NEW',
    "ease_factor" DECIMAL(4,2) NOT NULL DEFAULT 2.50,
    "interval_days" INTEGER NOT NULL DEFAULT 0,
    "repetitions" INTEGER NOT NULL DEFAULT 0,
    "learning_step" SMALLINT NOT NULL DEFAULT 0,
    "lapses" INTEGER NOT NULL DEFAULT 0,
    "total_reviews" INTEGER NOT NULL DEFAULT 0,
    "correct_reviews" INTEGER NOT NULL DEFAULT 0,
    "avg_response_ms" INTEGER,
    "stability_days" DECIMAL(10,4),
    "last_reviewed_at" TIMESTAMPTZ(3),
    "next_review_at" TIMESTAMPTZ(3),
    "is_suspended" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "user_progress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_logs" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "progress_id" UUID NOT NULL,
    "grade" SMALLINT NOT NULL,
    "response_time_ms" INTEGER NOT NULL,
    "reviewed_at" TIMESTAMPTZ(3) NOT NULL,
    "received_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "device_id" VARCHAR(128),
    "state_before" "card_state" NOT NULL,
    "state_after" "card_state" NOT NULL,
    "ease_factor_before" DECIMAL(4,2) NOT NULL,
    "ease_factor_after" DECIMAL(4,2) NOT NULL,
    "interval_days_before" INTEGER NOT NULL,
    "interval_days_after" INTEGER NOT NULL,
    "elapsed_days" DECIMAL(10,4),
    "scheduled_next_review_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "review_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_replaced_by_id_key" ON "refresh_tokens"("replaced_by_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_family_id_idx" ON "refresh_tokens"("family_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_expires_at_idx" ON "refresh_tokens"("expires_at");

-- CreateIndex
CREATE INDEX "words_language_cefr_level_part_of_speech_idx" ON "words"("language", "cefr_level", "part_of_speech");

-- CreateIndex
CREATE INDEX "words_updated_at_idx" ON "words"("updated_at");

-- CreateIndex
CREATE INDEX "words_lemma_trgm_idx" ON "words" USING GIN ("lemma" gin_trgm_ops);

-- CreateIndex
CREATE UNIQUE INDEX "words_id_part_of_speech_key" ON "words"("id", "part_of_speech");

-- CreateIndex
CREATE UNIQUE INDEX "words_identity_key" ON "words"("owner_id", "language", "lemma", "part_of_speech", "homograph_no");

-- CreateIndex
CREATE UNIQUE INDEX "noun_attributes_word_id_part_of_speech_key" ON "noun_attributes"("word_id", "part_of_speech");

-- CreateIndex
CREATE UNIQUE INDEX "verb_attributes_word_id_part_of_speech_key" ON "verb_attributes"("word_id", "part_of_speech");

-- CreateIndex
CREATE UNIQUE INDEX "adjective_attributes_word_id_part_of_speech_key" ON "adjective_attributes"("word_id", "part_of_speech");

-- CreateIndex
CREATE INDEX "valencies_word_id_idx" ON "valencies"("word_id");

-- CreateIndex
CREATE INDEX "translations_text_trgm_idx" ON "translations" USING GIN ("text" gin_trgm_ops);

-- CreateIndex
CREATE UNIQUE INDEX "translations_word_id_language_text_key" ON "translations"("word_id", "language", "text");

-- CreateIndex
CREATE INDEX "example_sentences_word_id_idx" ON "example_sentences"("word_id");

-- CreateIndex
CREATE INDEX "example_sentences_valency_id_idx" ON "example_sentences"("valency_id");

-- CreateIndex
CREATE UNIQUE INDEX "categories_slug_key" ON "categories"("slug");

-- CreateIndex
CREATE INDEX "categories_parent_id_idx" ON "categories"("parent_id");

-- CreateIndex
CREATE INDEX "word_categories_category_id_word_id_idx" ON "word_categories"("category_id", "word_id");

-- CreateIndex
CREATE INDEX "user_progress_user_id_updated_at_idx" ON "user_progress"("user_id", "updated_at");

-- CreateIndex
CREATE INDEX "user_progress_word_id_idx" ON "user_progress"("word_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_progress_user_id_word_id_card_type_key" ON "user_progress"("user_id", "word_id", "card_type");

-- CreateIndex
CREATE INDEX "review_logs_progress_id_reviewed_at_idx" ON "review_logs"("progress_id", "reviewed_at");

-- CreateIndex
CREATE INDEX "review_logs_user_id_reviewed_at_idx" ON "review_logs"("user_id", "reviewed_at");

-- CreateIndex
CREATE INDEX "review_logs_user_id_received_at_idx" ON "review_logs"("user_id", "received_at");

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_replaced_by_id_fkey" FOREIGN KEY ("replaced_by_id") REFERENCES "refresh_tokens"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "words" ADD CONSTRAINT "words_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "noun_attributes" ADD CONSTRAINT "noun_attributes_word_id_part_of_speech_fkey" FOREIGN KEY ("word_id", "part_of_speech") REFERENCES "words"("id", "part_of_speech") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "verb_attributes" ADD CONSTRAINT "verb_attributes_word_id_part_of_speech_fkey" FOREIGN KEY ("word_id", "part_of_speech") REFERENCES "words"("id", "part_of_speech") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "adjective_attributes" ADD CONSTRAINT "adjective_attributes_word_id_part_of_speech_fkey" FOREIGN KEY ("word_id", "part_of_speech") REFERENCES "words"("id", "part_of_speech") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "valencies" ADD CONSTRAINT "valencies_word_id_fkey" FOREIGN KEY ("word_id") REFERENCES "words"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "translations" ADD CONSTRAINT "translations_word_id_fkey" FOREIGN KEY ("word_id") REFERENCES "words"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "example_sentences" ADD CONSTRAINT "example_sentences_word_id_fkey" FOREIGN KEY ("word_id") REFERENCES "words"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "example_sentences" ADD CONSTRAINT "example_sentences_valency_id_fkey" FOREIGN KEY ("valency_id") REFERENCES "valencies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "word_categories" ADD CONSTRAINT "word_categories_word_id_fkey" FOREIGN KEY ("word_id") REFERENCES "words"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "word_categories" ADD CONSTRAINT "word_categories_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_progress" ADD CONSTRAINT "user_progress_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_progress" ADD CONSTRAINT "user_progress_word_id_fkey" FOREIGN KEY ("word_id") REFERENCES "words"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_logs" ADD CONSTRAINT "review_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_logs" ADD CONSTRAINT "review_logs_progress_id_fkey" FOREIGN KEY ("progress_id") REFERENCES "user_progress"("id") ON DELETE CASCADE ON UPDATE CASCADE;

