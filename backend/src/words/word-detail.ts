import { Prisma } from '@prisma/client';

/**
 * A kártyán megjelenő teljes szóadat betöltési terve (egyetlen Prisma
 * lekérdezés, JOIN-okkal). Törölt (soft delete) gyermekrekordok nélkül.
 */
export const WORD_DETAIL_INCLUDE = {
  nounAttributes: true,
  verbAttributes: true,
  adjectiveAttributes: true,
  translations: { where: { deletedAt: null }, orderBy: [{ sortOrder: 'asc' }, { text: 'asc' }] },
  valencies: { where: { deletedAt: null }, orderBy: { sortOrder: 'asc' } },
  examples: { where: { deletedAt: null }, orderBy: { sortOrder: 'asc' } },
  categories: { include: { category: true } },
} satisfies Prisma.WordInclude;

export type WordWithDetails = Prisma.WordGetPayload<{ include: typeof WORD_DETAIL_INCLUDE }>;

/**
 * Láthatóság: a központi szótár (owner_id IS NULL) és a felhasználó saját szavai.
 */
export function visibleWordsWhere(userId: string): Prisma.WordWhereInput {
  return { deletedAt: null, OR: [{ ownerId: null }, { ownerId: userId }] };
}
