/**
 * B2 szintű szókincs: főnevek névelővel, igék és melléknevek vonzattal,
 * főnév-ige kapcsolatok, elöljárók, kötő- és határozószók.
 *
 * Minden szó a `b2-wortschatz` gyűjtőkategóriába és egy tematikus
 * alkategóriába kerül.
 */
import { CefrLevel } from '@prisma/client';
import { parseAdjectives, ParseOptions, parseNouns, parseOther, parsePhrases, parseVerbs } from '../dsl';
import { SeedCategory, SeedSet } from '../types';
import { B2_ADJECTIVES } from './adjectives';
import { B2_NOUNS } from './nouns';
import { B2_OTHER, B2_PHRASES } from './phrases';
import { B2_VERBS } from './verbs';

const BASE = 'b2-wortschatz';

/**
 * A tematikus kategóriák egy része már az alap készletben is létezik
 * (alltag, bildung, verkehr, gefuehle, menschen); ezeket itt nem kell újra
 * felvenni, a seed a két készlet kategóriáit együtt kezeli.
 */
const CATEGORIES: SeedCategory[] = [
  { slug: BASE, nameHu: 'B2 szókincs', nameDe: 'B2-Wortschatz' },
  { slug: 'arbeit', nameHu: 'Munka és hivatás', nameDe: 'Arbeit und Beruf' },
  { slug: 'wirtschaft', nameHu: 'Gazdaság és pénzügyek', nameDe: 'Wirtschaft und Finanzen' },
  { slug: 'gesellschaft', nameHu: 'Társadalom', nameDe: 'Gesellschaft' },
  { slug: 'politik', nameHu: 'Politika és közigazgatás', nameDe: 'Politik und Verwaltung' },
  { slug: 'umwelt', nameHu: 'Környezet és klíma', nameDe: 'Umwelt und Klima' },
  { slug: 'gesundheit', nameHu: 'Egészség', nameDe: 'Gesundheit' },
  { slug: 'wissenschaft', nameHu: 'Tudomány és technika', nameDe: 'Wissenschaft und Technik' },
  { slug: 'medien', nameHu: 'Média', nameDe: 'Medien' },
  { slug: 'kommunikation', nameHu: 'Kommunikáció', nameDe: 'Kommunikation' },
  { slug: 'recht', nameHu: 'Jog és biztonság', nameDe: 'Recht und Sicherheit' },
  { slug: 'kultur', nameHu: 'Kultúra és szabadidő', nameDe: 'Kultur und Freizeit' },
  { slug: 'wohnen', nameHu: 'Lakás és háztartás', nameDe: 'Wohnen' },
  { slug: 'abstrakt', nameHu: 'Elvont fogalmak', nameDe: 'Abstrakte Begriffe' },
];

function options(source: string): ParseOptions {
  return { level: CefrLevel.B2, baseCategory: BASE, source: `b2/${source}` };
}

export const B2_SET: SeedSet = {
  name: 'b2',
  categories: CATEGORIES,
  words: [
    ...parseNouns(B2_NOUNS, options('nouns')),
    ...parseVerbs(B2_VERBS, options('verbs')),
    ...parseAdjectives(B2_ADJECTIVES, options('adjectives')),
    ...parsePhrases(B2_PHRASES, options('phrases')),
    ...parseOther(B2_OTHER, options('other')),
  ],
};
