-- =============================================================================
-- 5. migráció: nyelvtani kártyatípusok és felhasználói tanulási preferenciák.
--
--  - card_type: PLURAL (többes szám), VERB_FORMS (igei alapalakok), VALENCY
--    (vonzat). Az alkalmazhatóságot (pl. csak megszámlálható főnévnél van
--    többes szám) a szolgáltatásréteg ellenőrzi kártyafelvételkor.
--  - users.target_retention: cél felidézési valószínűség (0.70–0.97), ebből
--    skálázódik az ismétlési intervallum.
--  - users.catalog_levels: a szinkronizált katalógus CEFR szintjei (üres = mind).
-- Az első két blokk GENERÁLT (`prisma migrate diff`), a CHECK kézi.
-- =============================================================================

-- AlterEnum
ALTER TYPE "card_type" ADD VALUE 'PLURAL';
ALTER TYPE "card_type" ADD VALUE 'VERB_FORMS';
ALTER TYPE "card_type" ADD VALUE 'VALENCY';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "catalog_levels" "cefr_level"[] DEFAULT ARRAY[]::"cefr_level"[],
ADD COLUMN     "target_retention" DECIMAL(3,2) NOT NULL DEFAULT 0.90;

-- Kézi kényszer -----------------------------------------------------------------
ALTER TABLE "users"
  ADD CONSTRAINT "users_target_retention_chk"
    CHECK ("target_retention" BETWEEN 0.70 AND 0.97);
