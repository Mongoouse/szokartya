/**
 * Az értékelési napló (review_logs) beolvasása felhasználó → kártya →
 * időrendi értékelések szerkezetbe. Csak olvas.
 */
import { PrismaClient } from '@prisma/client';
import { ReviewEvent } from './scheduler-evaluation';

export type UserHistories = Map<string, Map<string, ReviewEvent[]>>;

export async function loadReviewLogs(prisma: PrismaClient, userId?: string): Promise<UserHistories> {
  const logs = await prisma.reviewLog.findMany({
    where: userId ? { userId } : {},
    select: { userId: true, progressId: true, grade: true, responseTimeMs: true, reviewedAt: true },
    orderBy: [{ progressId: 'asc' }, { reviewedAt: 'asc' }],
  });
  const users: UserHistories = new Map();
  for (const l of logs) {
    const cards = users.get(l.userId) ?? new Map<string, ReviewEvent[]>();
    const list = cards.get(l.progressId) ?? [];
    list.push({ grade: l.grade, responseTimeMs: l.responseTimeMs, reviewedAt: l.reviewedAt });
    cards.set(l.progressId, list);
    users.set(l.userId, cards);
  }
  return users;
}
