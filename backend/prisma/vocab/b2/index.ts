/**
 * B2 szintű szókincs: főnevek névelővel, igék és melléknevek vonzattal,
 * főnév-ige kapcsolatok, elöljárók, kötő- és határozószók.
 *
 * Minden szó a `b2-wortschatz` gyűjtőkategóriába és egy tematikus
 * alkategóriába kerül.
 */
import { CefrLevel } from '@prisma/client';
import { parseAdjectives, ParseOptions, parseNouns, parseOther, parsePhrases, parseVerbs } from '../dsl';
import { SeedCategory, SeedWord } from '../../seed-writer';
import { B2_ADJECTIVES } from './adjectives';
import { B2_NOUNS } from './nouns';
import { B2_OTHER, B2_PHRASES } from './phrases';
import { B2_VERBS } from './verbs';

const BASE = 'b2-wortschatz';

/**
 * Csak az új kategóriák: az alap seedben már meglévőket (arbeit, gesundheit,
 * kommunikation, bildung, verkehr, gefuehle, menschen) a B2 szavak is használják.
 */
export const B2_CATEGORIES: SeedCategory[] = [
  { slug: BASE, nameHu: 'B2 szókincs', nameDe: 'B2-Wortschatz' },
  { slug: 'wirtschaft', nameHu: 'Gazdaság és pénzügyek', nameDe: 'Wirtschaft und Finanzen' },
  { slug: 'gesellschaft', nameHu: 'Társadalom', nameDe: 'Gesellschaft' },
  { slug: 'politik', nameHu: 'Politika és közigazgatás', nameDe: 'Politik und Verwaltung' },
  { slug: 'umwelt', nameHu: 'Környezet és klíma', nameDe: 'Umwelt und Klima' },
  { slug: 'wissenschaft', nameHu: 'Tudomány és technika', nameDe: 'Wissenschaft und Technik' },
  { slug: 'medien', nameHu: 'Média', nameDe: 'Medien' },
  { slug: 'recht', nameHu: 'Jog és biztonság', nameDe: 'Recht und Sicherheit' },
  { slug: 'kultur', nameHu: 'Kultúra és szabadidő', nameDe: 'Kultur und Freizeit' },
  { slug: 'wohnen', nameHu: 'Lakás és háztartás', nameDe: 'Wohnen' },
  { slug: 'abstrakt', nameHu: 'Elvont fogalmak', nameDe: 'Abstrakte Begriffe' },
];

function options(source: string): ParseOptions {
  return { level: CefrLevel.B2, baseCategory: BASE, source: `b2/${source}` };
}

/**
 * Az A1–B1 szólistában (`data/wortschatz.txt`) már szereplő szavak itt nem
 * ismétlődnek: a seed az ismétlődő kulcsot hibának tekinti.
 */
export const B2_WORDS: SeedWord[] = [
  ...parseNouns(B2_NOUNS, options('nouns')),
  ...parseVerbs(B2_VERBS, options('verbs')),
  ...parseAdjectives(B2_ADJECTIVES, options('adjectives')),
  ...parsePhrases(B2_PHRASES, options('phrases')),
  ...parseOther(B2_OTHER, options('other')),
];
