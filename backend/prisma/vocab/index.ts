/**
 * A betölthető szókészletek nyilvántartása és kiválasztása.
 */
import { B2_SET } from './b2';
import { CORE_SET } from './core';
import { SeedCategory, SeedSet, SeedWord, wordKey } from './types';

export const SEED_SETS: readonly SeedSet[] = [CORE_SET, B2_SET];

export interface SelectedSets {
  names: string[];
  /** Egyedi slugok, szülők a gyermekeik előtt. */
  categories: SeedCategory[];
  words: SeedWord[];
}

/**
 * @param spec vesszővel elválasztott készletnevek (`core,b2`); üres = mind.
 * Kivételt dob ismeretlen készletnévre és két készlet közti kulcsütközésre
 * (azonos szó vagy eltérően definiált kategória), mert az upsert csendben
 * felülírná az egyiket.
 */
export function selectSets(spec: string | undefined): SelectedSets {
  const wanted = (spec ?? '').split(',').map((s) => s.trim()).filter((s) => s !== '');
  const sets = wanted.length === 0 ? [...SEED_SETS] : wanted.map((name) => {
    const set = SEED_SETS.find((s) => s.name === name);
    if (!set) throw new Error(`Ismeretlen szókészlet: ${name} (elérhető: ${SEED_SETS.map((s) => s.name).join(', ')})`);
    return set;
  });

  const categories = new Map<string, SeedCategory>();
  const words = new Map<string, SeedWord>();
  for (const set of sets) {
    for (const c of set.categories) {
      const prev = categories.get(c.slug);
      if (prev && JSON.stringify(prev) !== JSON.stringify(c)) throw new Error(`Ütköző kategória: ${c.slug} (${set.name})`);
      categories.set(c.slug, c);
    }
    for (const w of set.words) {
      const key = wordKey(w);
      if (words.has(key)) throw new Error(`Ismétlődő szó: ${key} (${set.name})`);
      words.set(key, w);
    }
  }
  return { names: sets.map((s) => s.name), categories: [...categories.values()], words: [...words.values()] };
}
