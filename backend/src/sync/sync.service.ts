import { ConflictException, HttpException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { RepetitionService } from '../repetition/repetition.service';
import { UsersRepository } from '../users/users.repository';
import { isCardTypeApplicable } from '../words/card-applicability';
import { CustomWordStatus } from '../words/dto/custom-word.dto';
import { WordsRepository } from '../words/words.repository';
import { WordsService } from '../words/words.service';
import {
  CardChangeDto,
  CardChangeResultDto,
  ChangeStatus,
  CustomWordPushResultDto,
  EnrollmentChangeDto,
  EnrollmentResultDto,
  EnrollmentStatus,
  ProgressSyncDto,
  PullResponseDto,
  PushRequestDto,
  PushResponseDto,
  ReviewLogSyncDto,
  ReviewResultItemDto,
  ReviewStatus,
  WordSyncDto,
} from './dto/sync.dto';
import { decodeCursor, encodeCursor, keysetStart, SyncCursor, SyncStream } from './sync-cursor';
import { SyncRepository } from './sync.repository';

/** E alatti órakülönbséget nem korrigálunk (hálózati késleltetés nagyságrendje). */
const CLOCK_OFFSET_THRESHOLD_MS = 2_000;

/**
 * Offline-first szinkronizáció.
 *
 * Konfliktuskezelési modell:
 *  - Ütemezési állapot (ease factor, intervallum, esedékesség): a SZERVER az
 *    egyetlen igazságforrás. A kliens az értékeléseket eseményként küldi fel
 *    (review_logs), a szerver időrendben újrajátssza őket az SM-2 ütemezővel.
 *    A kliens helyben számolt állapota ideiglenes, a pull felülírja. Így két
 *    eszköz offline értékelései sem veszítik el egymást (nincs „last write
 *    wins” az ütemezési mezőkön).
 *  - Felhasználói jelzők (felfüggesztés, törlés): időbélyeg-alapú „last write
 *    wins”, verzióellenőrzéssel. Ha a kliens a legfrissebb verzión dolgozott,
 *    a módosítás alkalmazódik; ha közben máshol is változott a kártya, a
 *    későbbi (órakülönbséggel korrigált) időbélyeg nyer.
 *  - Szókatalógus: a központi szavak csak lefelé szinkronizálnak (szerver →
 *    kliens), a felhasználó választott szintjeire szűkítve; a saját szavak
 *    a kliensen is létrehozhatók (push: customWords).
 */
@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);

  constructor(
    private readonly repo: SyncRepository,
    private readonly words: WordsRepository,
    private readonly repetition: RepetitionService,
    private readonly users: UsersRepository,
    private readonly wordsService: WordsService,
  ) {}

  // -------------------------------------------------------------------------
  // Pull
  // -------------------------------------------------------------------------

  async pull(userId: string, rawCursor: string | undefined, limit: number): Promise<PullResponseDto> {
    const serverTime = new Date();
    const cursor = decodeCursor(rawCursor);

    const user = await this.users.findActiveById(userId);
    const [progress, words, logs] = await Promise.all([
      this.repo.progressChanges(userId, keysetStart(cursor, 'progress'), limit),
      this.repo.wordChanges(userId, keysetStart(cursor, 'words'), limit, user?.catalogLevels ?? []),
      this.repo.reviewLogChanges(userId, keysetStart(cursor, 'reviewLogs'), limit),
    ]);

    const hasMore = progress.length === limit || words.length === limit || logs.length === limit;
    const next: SyncCursor = { v: 1, final: !hasMore, streams: { ...cursor.streams } };
    advance(next, 'progress', progress.at(-1), (r) => r.updatedAt);
    advance(next, 'words', words.at(-1), (r) => r.updatedAt);
    advance(next, 'reviewLogs', logs.at(-1), (r) => r.receivedAt);

    return {
      serverTime,
      cursor: encodeCursor(next),
      hasMore,
      progress: progress.map(ProgressSyncDto.fromEntity),
      words: words.map(WordSyncDto.fromWord),
      reviewLogs: logs.map(ReviewLogSyncDto.fromEntity),
    };
  }

  // -------------------------------------------------------------------------
  // Push
  // -------------------------------------------------------------------------

  /**
   * A kliens kimenő sorának (outbox) feldolgozása. Sorrend: saját szavak → kártyafelvételek →
   * jelzőmódosítások → értékelések (időrendben), mert a későbbiek hivatkozhatnak
   * az offline létrehozott kártyákra. Minden tétel önállóan sikerül vagy bukik;
   * az eredményt tételenként adjuk vissza. Infrastruktúra-hiba (pl. adatbázis
   * nem elérhető) viszont az egész kérést elbuktatja, hogy a kliens újrapróbálja.
   */
  async push(userId: string, dto: PushRequestDto, now: Date = new Date()): Promise<PushResponseDto> {
    const rawOffset = now.getTime() - dto.clientTime.getTime();
    const offset = Math.abs(rawOffset) > CLOCK_OFFSET_THRESHOLD_MS ? rawOffset : 0;
    const toServerTime = (t: Date): Date => new Date(Math.min(t.getTime() + offset, now.getTime()));

    // Kliens-azonosító → szerver-azonosító (ha a kártya más eszközről már létezett).
    const idMap = new Map<string, string>();
    const resolve = (id: string): string => idMap.get(id) ?? id;

    // Saját szavak elsőként: a kártyafelvételek hivatkozhatnak rájuk.
    const customWords: CustomWordPushResultDto[] = [];
    for (const w of dto.customWords) {
      if (!w.id) {
        customWords.push({ wordId: '', status: CustomWordStatus.REJECTED, reason: 'id_required' });
        continue;
      }
      const { wordId, status, reason } = await this.wordsService.createCustom(userId, w);
      customWords.push({ wordId, status, ...(reason ? { reason } : {}) });
    }

    const enrollments: EnrollmentResultDto[] = [];
    for (const e of dto.enrollments) {
      const result = await this.applyEnrollment(userId, e);
      if (result.serverProgressId && result.serverProgressId !== e.progressId) {
        idMap.set(e.progressId, result.serverProgressId);
      }
      enrollments.push(result);
    }

    const cardChanges: CardChangeResultDto[] = [];
    for (const c of dto.cardChanges) {
      cardChanges.push(
        await this.applyCardChange(userId, { ...c, progressId: resolve(c.progressId) }, toServerTime(c.changedAt), c.progressId),
      );
    }

    const reviews: ReviewResultItemDto[] = [];
    const ordered = [...dto.reviews].sort((a, b) => a.reviewedAt.getTime() - b.reviewedAt.getTime());
    for (const r of ordered) {
      reviews.push(
        await this.applyReviewEvent(userId, r.reviewId, resolve(r.progressId), r, toServerTime(r.reviewedAt), dto.deviceId, now),
      );
    }

    return { serverTime: now, clockOffsetMs: rawOffset, customWords, enrollments, cardChanges, reviews };
  }

  private async applyEnrollment(userId: string, e: EnrollmentChangeDto): Promise<EnrollmentResultDto> {
    const [word] = await this.words.findVisibleForEnrollment(userId, [e.wordId]);
    if (!word) {
      return { progressId: e.progressId, status: EnrollmentStatus.REJECTED, reason: 'unknown_word' };
    }
    if (!isCardTypeApplicable(word, e.cardType)) {
      return { progressId: e.progressId, status: EnrollmentStatus.REJECTED, reason: `${e.cardType.toLowerCase()}_not_applicable` };
    }

    const existing = await this.repo.findCardByNaturalKey(userId, e.wordId, e.cardType);
    if (existing) {
      if (existing.deletedAt) {
        await this.repo.restoreCard(existing.id);
      }
      return { progressId: e.progressId, status: EnrollmentStatus.EXISTS, serverProgressId: existing.id };
    }

    try {
      const created = await this.repo.createCard({ id: e.progressId, userId, wordId: e.wordId, cardType: e.cardType });
      return { progressId: e.progressId, status: EnrollmentStatus.CREATED, serverProgressId: created.id };
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        // Párhuzamos push ugyanarra a kártyára, vagy azonosító-ütközés.
        const raced = await this.repo.findCardByNaturalKey(userId, e.wordId, e.cardType);
        return raced
          ? { progressId: e.progressId, status: EnrollmentStatus.EXISTS, serverProgressId: raced.id }
          : { progressId: e.progressId, status: EnrollmentStatus.REJECTED, reason: 'id_conflict' };
      }
      throw err;
    }
  }

  private async applyCardChange(userId: string, c: CardChangeDto, changedAt: Date, clientProgressId: string): Promise<CardChangeResultDto> {
    const result = (status: ChangeStatus, reason?: string): CardChangeResultDto => ({
      progressId: clientProgressId,
      status,
      ...(reason ? { reason } : {}),
    });

    if (c.isSuspended === undefined && c.deleted === undefined) {
      return result(ChangeStatus.REJECTED, 'empty_change');
    }
    const card = await this.repo.findOwnedCardIncludingDeleted(userId, c.progressId);
    if (!card) {
      return result(ChangeStatus.REJECTED, 'card_not_found');
    }

    // Verzióegyezés → nincs párhuzamos módosítás. Különben LWW: a jelzők
    // utolsó MÓDOSÍTÁSÁNAK ideje dönt (nem az updated_at, ami a szerverre
    // érkezés ideje – egy korábban módosító, de előbb szinkronizáló eszköz
    // azzal jogtalanul nyerne).
    const lastFlagChange = card.flagsChangedAt ?? card.createdAt;
    const clientWins = card.version === c.baseVersion || changedAt > lastFlagChange;
    if (!clientWins) {
      return result(ChangeStatus.CONFLICT, 'server_newer');
    }
    const data: { isSuspended?: boolean; deletedAt?: Date | null; flagsChangedAt: Date } = {
      // Verzióegyezésnél is a későbbi időpont marad meg (sorrenden kívüli feltöltés).
      flagsChangedAt: card.flagsChangedAt && card.flagsChangedAt > changedAt ? card.flagsChangedAt : changedAt,
    };
    if (c.isSuspended !== undefined) {
      data.isSuspended = c.isSuspended;
    }
    if (c.deleted !== undefined) {
      data.deletedAt = c.deleted ? changedAt : null;
    }
    const applied = await this.repo.updateCardIfVersion(card.id, card.version, data);
    return applied ? result(ChangeStatus.APPLIED) : result(ChangeStatus.CONFLICT, 'concurrent_update');
  }

  private async applyReviewEvent(
    userId: string,
    reviewId: string,
    progressId: string,
    r: { grade: number; responseTimeMs: number },
    reviewedAt: Date,
    deviceId: string | undefined,
    now: Date,
  ): Promise<ReviewResultItemDto> {
    try {
      const outcome = await this.repetition.applyReview(
        userId,
        progressId,
        { reviewId, grade: r.grade, responseTimeMs: r.responseTimeMs, reviewedAt, deviceId: deviceId ?? null },
        now,
      );
      return { reviewId, status: outcome.duplicate ? ReviewStatus.DUPLICATE : ReviewStatus.APPLIED };
    } catch (err) {
      if (err instanceof NotFoundException) {
        return { reviewId, status: ReviewStatus.REJECTED, reason: 'card_not_found' };
      }
      if (err instanceof ConflictException) {
        return { reviewId, status: ReviewStatus.REJECTED, reason: err.message };
      }
      if (err instanceof HttpException) {
        this.logger.warn(`Szinkron értékelés elutasítva (${reviewId}): ${err.message}`);
        return { reviewId, status: ReviewStatus.REJECTED, reason: err.message };
      }
      throw err;
    }
  }
}

function advance<T extends { id: string }>(cursor: SyncCursor, stream: SyncStream, last: T | undefined, ts: (row: T) => Date): void {
  if (last) {
    cursor.streams[stream] = { t: ts(last).toISOString(), id: last.id };
  }
}
