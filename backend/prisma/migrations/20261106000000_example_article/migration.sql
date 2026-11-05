-- =============================================================================
-- Névelőtáblázat a főnévi példamondatokhoz
-- =============================================================================
--
-- A példamondat a főnév előtt álló névelő esetét, fajtáját, számát és pontos
-- alakját is tárolhatja (pl. „Zum Essen trinken wir einen Wein.” → ACCUSATIVE,
-- INDEFINITE, SINGULAR, „einen”). Ebből rajzolja a kliens a der/ein/kein
-- táblázatot, kiemelve azt a cellát, amelyből a mondatbeli alak származik.
-- A négy oszlop együtt értelmes: vagy mind ki van töltve, vagy egyik sem.

CREATE TYPE "article_type" AS ENUM ('DEFINITE', 'INDEFINITE', 'NEGATIVE', 'POSSESSIVE');
CREATE TYPE "grammatical_number" AS ENUM ('SINGULAR', 'PLURAL');

ALTER TABLE "example_sentences"
  ADD COLUMN "article_case" "grammatical_case",
  ADD COLUMN "article_type" "article_type",
  ADD COLUMN "article_number" "grammatical_number",
  ADD COLUMN "article_form" VARCHAR(30);

ALTER TABLE "example_sentences" ADD CONSTRAINT "example_sentences_article_all_or_none" CHECK (
  ("article_case" IS NULL AND "article_type" IS NULL AND "article_number" IS NULL AND "article_form" IS NULL)
  OR ("article_case" IS NOT NULL AND "article_type" IS NOT NULL AND "article_number" IS NOT NULL AND "article_form" IS NOT NULL)
);

-- Határozatlan névelőnek nincs többes száma (ein → —).
ALTER TABLE "example_sentences" ADD CONSTRAINT "example_sentences_article_no_indefinite_plural" CHECK (
  NOT ("article_type" = 'INDEFINITE' AND "article_number" = 'PLURAL')
);
