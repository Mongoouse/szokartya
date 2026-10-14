-- =============================================================================
-- 3. migráció: szinkronizációs támogatás a szókatalógushoz.
--
-- Probléma: a kliens a szavakat `words.updated_at` alapján húzza le (pull). Ha
-- csak egy gyermekrekord változik (fordítás, vonzat, példamondat, nyelvtani
-- attribútum, kategória-hozzárendelés), a szó maga nem módosul, így a változás
-- nem jutna el az eszközökre.
--
-- Megoldás: a gyermektáblák minden INSERT / UPDATE / DELETE műveletére a szülő
-- szó `updated_at` és `version` mezője is lép. Mivel a touch_versioned_row()
-- trigger a valódi változás nélküli UPDATE-et kiszűri, egy tranzakció-lokális
-- jelzővel („szokartya.force_touch”) kényszerítjük ki a léptetést.
--
-- KÉZZEL KARBANTARTOTT fájl.
-- =============================================================================

CREATE OR REPLACE FUNCTION "touch_versioned_row"() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  NEW."updated_at" := OLD."updated_at";
  NEW."version"    := OLD."version";
  IF NEW IS DISTINCT FROM OLD
     OR current_setting('szokartya.force_touch', true) = 'on' THEN
    NEW."updated_at" := now();
    NEW."version"    := OLD."version" + 1;
  END IF;
  RETURN NEW;
END;
$$;

-- A gyermekrekord szülő szavának (szavainak) „megérintése”.
CREATE OR REPLACE FUNCTION "touch_parent_word"() RETURNS trigger
  LANGUAGE plpgsql AS $$
DECLARE
  word_ids uuid[];
BEGIN
  IF TG_OP = 'INSERT' THEN
    word_ids := ARRAY[NEW."word_id"];
  ELSIF TG_OP = 'DELETE' THEN
    word_ids := ARRAY[OLD."word_id"];
  ELSE
    -- Valódi változás nélküli UPDATE (pl. idempotens seed) nem érinti a szülőt.
    -- AFTER triggerben a NEW már a BEFORE triggerek által normalizált sor.
    IF NEW IS NOT DISTINCT FROM OLD THEN
      RETURN NULL;
    END IF;
    word_ids := ARRAY[NEW."word_id", OLD."word_id"];
  END IF;

  PERFORM set_config('szokartya.force_touch', 'on', true);
  UPDATE "words" SET "updated_at" = "updated_at" WHERE "id" = ANY (word_ids);
  PERFORM set_config('szokartya.force_touch', '', true);
  RETURN NULL;
END;
$$;

CREATE TRIGGER "touch_parent_word" AFTER INSERT OR UPDATE OR DELETE ON "translations"
  FOR EACH ROW EXECUTE FUNCTION "touch_parent_word"();
CREATE TRIGGER "touch_parent_word" AFTER INSERT OR UPDATE OR DELETE ON "valencies"
  FOR EACH ROW EXECUTE FUNCTION "touch_parent_word"();
CREATE TRIGGER "touch_parent_word" AFTER INSERT OR UPDATE OR DELETE ON "example_sentences"
  FOR EACH ROW EXECUTE FUNCTION "touch_parent_word"();
CREATE TRIGGER "touch_parent_word" AFTER INSERT OR UPDATE OR DELETE ON "noun_attributes"
  FOR EACH ROW EXECUTE FUNCTION "touch_parent_word"();
CREATE TRIGGER "touch_parent_word" AFTER INSERT OR UPDATE OR DELETE ON "verb_attributes"
  FOR EACH ROW EXECUTE FUNCTION "touch_parent_word"();
CREATE TRIGGER "touch_parent_word" AFTER INSERT OR UPDATE OR DELETE ON "adjective_attributes"
  FOR EACH ROW EXECUTE FUNCTION "touch_parent_word"();
CREATE TRIGGER "touch_parent_word" AFTER INSERT OR UPDATE OR DELETE ON "word_categories"
  FOR EACH ROW EXECUTE FUNCTION "touch_parent_word"();
