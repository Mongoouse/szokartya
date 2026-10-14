-- =============================================================================
-- 4. migráció: a jelzőmódosítások (felfüggesztés / törlés) LWW időbélyege.
--
-- Az ütközésfeloldás eddig az updated_at-hez (a szerverre érkezés idejéhez)
-- hasonlított. Hiba: ha B korábban módosított, de előbb szinkronizált, A későbbi
-- módosítása „régebbinek” tűnt, és elveszett. A flags_changed_at a módosítás
-- tényleges (órakülönbséggel korrigált) idejét tárolja.
-- GENERÁLT fájl: `prisma migrate diff`.
-- =============================================================================

-- AlterTable
ALTER TABLE "user_progress" ADD COLUMN     "flags_changed_at" TIMESTAMPTZ(3);
