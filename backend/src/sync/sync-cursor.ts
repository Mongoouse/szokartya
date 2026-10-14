import { BadRequestException } from '@nestjs/common';

/**
 * Szinkronizációs kurzor.
 *
 * Adatfolyamonként (progress, words, reviewLogs) külön keyset pozíció:
 * (időbélyeg, id). Az id holtversenyt bont azonos időbélyegnél, így a lapozás
 * sem kihagyni, sem ismételni nem tud sort.
 *
 * `final = true`: az előző pull végigért minden folyamon. A következő pull
 * ilyenkor átfedő ablakkal (OVERLAP_MS) indul, mert a `now()` a tranzakció
 * KEZDETÉT adja: egy hosszabb tranzakció a kurzornál „korábbi” időbélyeggel
 * véglegesedhet. Az átfedés miatt ismétlődő sorokat a kliens a `version`
 * alapján szűri ki. Lapozás közben (final = false) nincs átfedés.
 *
 * Átlátszatlan (base64url JSON) – a kliens nem értelmezi, csak visszaküldi.
 */
export interface StreamPosition {
  t: string; // ISO időbélyeg
  id: string;
}

export type SyncStream = 'progress' | 'words' | 'reviewLogs';

export interface SyncCursor {
  v: 1;
  final: boolean;
  streams: Partial<Record<SyncStream, StreamPosition>>;
}

export const OVERLAP_MS = 10_000;

export function emptyCursor(): SyncCursor {
  return { v: 1, final: false, streams: {} };
}

export function encodeCursor(cursor: SyncCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

export function decodeCursor(raw: string | undefined): SyncCursor {
  if (!raw) {
    return emptyCursor();
  }
  try {
    const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as SyncCursor;
    if (parsed.v !== 1 || typeof parsed.final !== 'boolean' || typeof parsed.streams !== 'object') {
      throw new Error('verzió / szerkezet');
    }
    for (const pos of Object.values(parsed.streams)) {
      if (!pos || Number.isNaN(Date.parse(pos.t)) || typeof pos.id !== 'string') {
        throw new Error('pozíció');
      }
    }
    return parsed;
  } catch {
    throw new BadRequestException('Érvénytelen szinkronizációs kurzor – teljes újraszinkron szükséges');
  }
}

/** Keyset feltétel bemenete egy folyamra. */
export type KeysetStart =
  | { kind: 'all' }
  | { kind: 'after'; t: Date; id: string } // lapozás: szigorúan a pozíció után
  | { kind: 'since'; t: Date }; // átfedő újraindulás: t-től (id nélkül)

export function keysetStart(cursor: SyncCursor, stream: SyncStream): KeysetStart {
  const pos = cursor.streams[stream];
  if (!pos) {
    return { kind: 'all' };
  }
  const t = new Date(pos.t);
  return cursor.final ? { kind: 'since', t: new Date(t.getTime() - OVERLAP_MS) } : { kind: 'after', t, id: pos.id };
}
