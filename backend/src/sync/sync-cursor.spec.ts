import { BadRequestException } from '@nestjs/common';
import { decodeCursor, emptyCursor, encodeCursor, keysetStart, OVERLAP_MS, SyncCursor } from './sync-cursor';

const ID = '00000000-0000-4000-8000-000000000001';

describe('szinkronizációs kurzor', () => {
  it('kódolás és visszafejtés veszteségmentes', () => {
    const cursor: SyncCursor = { v: 1, final: true, streams: { progress: { t: '2026-01-01T00:00:00.000Z', id: ID } } };
    expect(decodeCursor(encodeCursor(cursor))).toEqual(cursor);
  });

  it('hiányzó kurzor → üres (teljes szinkron)', () => {
    expect(decodeCursor(undefined)).toEqual(emptyCursor());
    expect(keysetStart(emptyCursor(), 'words')).toEqual({ kind: 'all' });
  });

  it.each([
    ['nem base64 JSON', 'garbage!!'],
    ['ismeretlen verzió', Buffer.from(JSON.stringify({ v: 2, final: true, streams: {} })).toString('base64url')],
    ['hibás időbélyeg', Buffer.from(JSON.stringify({ v: 1, final: false, streams: { words: { t: 'x', id: ID } } })).toString('base64url')],
    [
      'hiányzó id',
      Buffer.from(JSON.stringify({ v: 1, final: false, streams: { words: { t: '2026-01-01T00:00:00Z' } } })).toString('base64url'),
    ],
  ])('érvénytelen kurzor (%s) → 400', (_label, raw) => {
    expect(() => decodeCursor(raw)).toThrow(BadRequestException);
  });

  it('lapozás közben (final = false): szigorúan a pozíció után, átfedés nélkül', () => {
    const t = '2026-01-01T12:00:00.000Z';
    expect(keysetStart({ v: 1, final: false, streams: { progress: { t, id: ID } } }, 'progress')).toEqual({
      kind: 'after',
      t: new Date(t),
      id: ID,
    });
  });

  it('lezárt pull után (final = true): átfedő ablakkal indul', () => {
    const t = '2026-01-01T12:00:00.000Z';
    expect(keysetStart({ v: 1, final: true, streams: { progress: { t, id: ID } } }, 'progress')).toEqual({
      kind: 'since',
      t: new Date(Date.parse(t) - OVERLAP_MS),
    });
  });

  it('folyamonként független pozíció', () => {
    const cursor: SyncCursor = { v: 1, final: false, streams: { words: { t: '2026-01-01T00:00:00.000Z', id: ID } } };
    expect(keysetStart(cursor, 'words').kind).toBe('after');
    expect(keysetStart(cursor, 'reviewLogs').kind).toBe('all');
  });
});
