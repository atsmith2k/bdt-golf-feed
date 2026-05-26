import { and, asc, count, eq } from 'drizzle-orm';
import {
  db,
  golfers,
  scores as scoresTbl,
  handicapRevisions as revisionsTbl,
  feedEvents,
  type Score as ScoreRow,
} from '@/lib/db';
import {
  searchGolferByGhin,
  getGolferScores,
  getGolferHandicapRevisions,
} from '@/lib/api/ghin';
import { parseHandicapIndex } from '@/lib/utils/format';
import type { GhinScore } from '@/types/golf';
import {
  buildScorePostedEvent,
  buildHandicapChangedEvent,
  buildLowRoundEvent,
  buildRevisionFromHistoryEvent,
  type DraftFeedEvent,
} from './newsGenerator';

export interface SyncResult {
  ghinNumber: string;
  golferId: string;
  fullName: string;
  newScores: number;
  newRevisions: number;
  feedEventsCreated: number;
  isNewGolfer: boolean;
  /** Subset of feedEventsCreated attributable to historical-score backfill. */
  backfilledScoreEvents: number;
}

interface TimedDraft {
  draft: DraftFeedEvent;
  createdAt: Date;
}

const NOW = (): Date => new Date();

/**
 * Add a new golfer by GHIN number. Performs the initial data pull, seeds
 * Score / HandicapRevision caches, and emits backdated SCORE_POSTED +
 * LOW_ROUND_ALERT entries so the feed has immediate context. Idempotent:
 * re-adding an existing golfer just re-syncs.
 */
export async function addGolferByGhin(ghinNumber: string): Promise<SyncResult> {
  console.log(`[sync] addGolferByGhin: ${ghinNumber}`);
  const [existing] = await db
    .select({ id: golfers.id })
    .from(golfers)
    .where(eq(golfers.ghinNumber, ghinNumber))
    .limit(1);
  if (existing) {
    console.log(`[sync] ${ghinNumber} already on roster — falling through to syncGolfer`);
    return syncGolfer(ghinNumber);
  }

  const details = await searchGolferByGhin(ghinNumber);
  console.log(
    `[sync] ${ghinNumber}: GHIN profile fetched — ${details.fullName} • Index ${details.handicapIndex}`,
  );

  const [created] = await db
    .insert(golfers)
    .values({
      ghinNumber: details.ghinNumber,
      firstName: details.firstName,
      lastName: details.lastName,
      fullName: details.fullName,
      handicapIndex: details.handicapIndex,
      handicapIndexValue: details.handicapIndexValue,
      lowHandicapIndex: details.lowHandicapIndex ?? null,
      club: details.club ?? null,
      association: details.association ?? null,
      status: details.status ?? 'Active',
      revisionDate: details.revisionDate ?? null,
    })
    .returning();
  console.log(`[sync] ${ghinNumber}: golfer row inserted (${created.id})`);

  // Persist the welcome MILESTONE first and on its own, so even if score
  // fetches fail later the feed has *something* about the new golfer.
  await persistDrafts(created.id, [
    {
      createdAt: NOW(),
      draft: {
        type: 'MILESTONE',
        headline: `${created.fullName} joins the BDT Golf Network roster`,
        details: `Tracking GHIN ${created.ghinNumber} • Index ${created.handicapIndex}`,
        importance: 'HIGH',
      },
    },
  ]);

  let scoresResp: GhinScore[] = [];
  try {
    scoresResp = await getGolferScores(ghinNumber);
    console.log(`[sync] ${ghinNumber}: GHIN scores fetched — ${scoresResp.length} rounds`);
  } catch (err) {
    console.error(
      `[sync] ${ghinNumber}: GHIN scores fetch FAILED:`,
      err instanceof Error ? err.message : err,
    );
  }

  let revisionsResp: Awaited<ReturnType<typeof getGolferHandicapRevisions>> = [];
  try {
    revisionsResp = await getGolferHandicapRevisions(ghinNumber);
    console.log(`[sync] ${ghinNumber}: GHIN revisions fetched — ${revisionsResp.length} entries`);
  } catch (err) {
    console.error(
      `[sync] ${ghinNumber}: GHIN revisions fetch FAILED:`,
      err instanceof Error ? err.message : err,
    );
  }

  if (scoresResp.length > 0) {
    try {
      await db.insert(scoresTbl).values(
        scoresResp.map((s) => ({
          id: s.id,
          golferId: created.id,
          datePlayed: s.date,
          courseName: s.courseName,
          score: s.score,
          adjustedGrossScore: s.adjustedGrossScore,
          netScore: s.netScore,
          courseRating: s.courseRating ?? null,
          courseSlope: s.courseSlope ?? null,
          teeColor: s.teeColor ?? null,
          numberOfHoles: s.numberOfHoles ?? null,
          toParDisplay: s.toParDisplay ?? null,
          handicapIndexAtTime: s.handicapIndexAtTime ?? null,
        })),
      );
      console.log(`[sync] ${ghinNumber}: persisted ${scoresResp.length} score rows`);
    } catch (err) {
      console.error(
        `[sync] ${ghinNumber}: score insert FAILED:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  if (revisionsResp.length > 0) {
    try {
      await db.insert(revisionsTbl).values(
        revisionsResp.map((r) => ({
          golferId: created.id,
          revisionDate: r.date,
          handicapIndex: r.handicap,
          club: r.club ?? null,
        })),
      );
      console.log(
        `[sync] ${ghinNumber}: persisted ${revisionsResp.length} handicap revisions`,
      );
    } catch (err) {
      console.error(
        `[sync] ${ghinNumber}: revision insert FAILED:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  let scoreDrafts: TimedDraft[] = [];
  try {
    scoreDrafts = await emitMissingScoreFeedEvents(created.id, created.fullName);
    console.log(
      `[sync] ${ghinNumber}: emitted ${scoreDrafts.length} score-derived feed drafts`,
    );
  } catch (err) {
    console.error(
      `[sync] ${ghinNumber}: emitMissingScoreFeedEvents FAILED:`,
      err instanceof Error ? err.message : err,
    );
  }

  await persistDrafts(created.id, scoreDrafts);

  return {
    ghinNumber,
    golferId: created.id,
    fullName: created.fullName,
    newScores: scoresResp.length,
    newRevisions: revisionsResp.length,
    feedEventsCreated: 1 + scoreDrafts.length,
    backfilledScoreEvents: scoreDrafts.length,
    isNewGolfer: true,
  };
}

/**
 * Re-sync an existing golfer. Performs delta detection and emits feed events
 * for any genuinely new scores, low rounds, or handicap movements.
 */
export async function syncGolfer(ghinNumber: string): Promise<SyncResult> {
  console.log(`[sync] syncGolfer: ${ghinNumber}`);
  const [golfer] = await db
    .select()
    .from(golfers)
    .where(eq(golfers.ghinNumber, ghinNumber))
    .limit(1);
  if (!golfer) {
    throw new Error(`Golfer with GHIN ${ghinNumber} is not on the roster.`);
  }

  const [existingScores, existingRevisions] = await Promise.all([
    db.select().from(scoresTbl).where(eq(scoresTbl.golferId, golfer.id)),
    db.select().from(revisionsTbl).where(eq(revisionsTbl.golferId, golfer.id)),
  ]);
  console.log(
    `[sync] ${ghinNumber}: cached ${existingScores.length} scores, ${existingRevisions.length} revisions`,
  );

  const details = await searchGolferByGhin(ghinNumber);
  console.log(
    `[sync] ${ghinNumber}: GHIN profile fetched — index ${details.handicapIndex} (was ${golfer.handicapIndex})`,
  );

  let scoresResp: GhinScore[] = [];
  try {
    scoresResp = await getGolferScores(ghinNumber);
    console.log(`[sync] ${ghinNumber}: GHIN returned ${scoresResp.length} scores`);
  } catch (err) {
    console.error(
      `[sync] ${ghinNumber}: GHIN scores fetch FAILED:`,
      err instanceof Error ? err.message : err,
    );
  }

  let revisionsResp: Awaited<ReturnType<typeof getGolferHandicapRevisions>> = [];
  try {
    revisionsResp = await getGolferHandicapRevisions(ghinNumber);
    console.log(`[sync] ${ghinNumber}: GHIN returned ${revisionsResp.length} revisions`);
  } catch (err) {
    console.error(
      `[sync] ${ghinNumber}: GHIN revisions fetch FAILED:`,
      err instanceof Error ? err.message : err,
    );
  }

  // --- New scores ---
  const knownScoreIds = new Set(existingScores.map((s) => s.id));
  const sortedNewScores = scoresResp
    .filter((s) => !knownScoreIds.has(s.id))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  let newScoreCount = 0;
  if (sortedNewScores.length > 0) {
    try {
      await db.insert(scoresTbl).values(
        sortedNewScores.map((s) => ({
          id: s.id,
          golferId: golfer.id,
          datePlayed: s.date,
          courseName: s.courseName,
          score: s.score,
          adjustedGrossScore: s.adjustedGrossScore,
          netScore: s.netScore,
          courseRating: s.courseRating ?? null,
          courseSlope: s.courseSlope ?? null,
          teeColor: s.teeColor ?? null,
          numberOfHoles: s.numberOfHoles ?? null,
          toParDisplay: s.toParDisplay ?? null,
          handicapIndexAtTime: s.handicapIndexAtTime ?? null,
        })),
      );
      newScoreCount = sortedNewScores.length;
      console.log(`[sync] ${ghinNumber}: inserted ${newScoreCount} new scores`);
    } catch (err) {
      console.error(
        `[sync] ${ghinNumber}: score insert FAILED:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  // --- New revisions + revision-history events ---
  const drafts: TimedDraft[] = [];
  const knownRevisionDates = new Set(existingRevisions.map((r) => r.revisionDate));
  const sortedRevisions = [...revisionsResp].sort((a, b) => (a.date < b.date ? -1 : 1));
  let previousRevisionValue: number | null = null;
  if (existingRevisions.length > 0) {
    const latestKnown = [...existingRevisions].sort((a, b) =>
      a.revisionDate < b.revisionDate ? 1 : -1,
    )[0];
    const parsed = parseHandicapIndex(latestKnown.handicapIndex);
    previousRevisionValue = Number.isNaN(parsed) ? null : parsed;
  }

  let newRevisionCount = 0;
  for (const r of sortedRevisions) {
    if (knownRevisionDates.has(r.date)) {
      const parsed = parseHandicapIndex(r.handicap);
      if (!Number.isNaN(parsed)) previousRevisionValue = parsed;
      continue;
    }
    await db.insert(revisionsTbl).values({
      golferId: golfer.id,
      revisionDate: r.date,
      handicapIndex: r.handicap,
      club: r.club ?? null,
    });
    newRevisionCount += 1;
    const draft = buildRevisionFromHistoryEvent(golfer, r, previousRevisionValue);
    if (draft) drafts.push({ draft, createdAt: NOW() });
    const parsed = parseHandicapIndex(r.handicap);
    if (!Number.isNaN(parsed)) previousRevisionValue = parsed;
  }

  // --- Score-derived events: idempotent backfill ---
  let scoreDrafts: TimedDraft[] = [];
  try {
    scoreDrafts = await emitMissingScoreFeedEvents(golfer.id, golfer.fullName);
    console.log(`[sync] ${ghinNumber}: emitted ${scoreDrafts.length} score-derived drafts`);
  } catch (err) {
    console.error(
      `[sync] ${ghinNumber}: emitMissingScoreFeedEvents FAILED:`,
      err instanceof Error ? err.message : err,
    );
  }
  drafts.push(...scoreDrafts);

  // --- Live handicap snapshot delta ---
  const handicapDraft = buildHandicapChangedEvent(
    golfer,
    {
      handicapIndexValue: golfer.handicapIndexValue,
      revisionDate: golfer.revisionDate,
    },
    {
      handicapIndexValue: details.handicapIndexValue,
      handicapIndex: details.handicapIndex,
      revisionDate: details.revisionDate,
    },
  );
  if (handicapDraft) {
    const alreadyFired = drafts.some(
      ({ draft }) =>
        draft.type === 'HANDICAP_CHANGED' &&
        draft.payload &&
        Math.round(((draft.payload.next as number) ?? 0) * 10) ===
          Math.round(details.handicapIndexValue * 10),
    );
    if (!alreadyFired) drafts.push({ draft: handicapDraft, createdAt: NOW() });
  }

  // --- Persist golfer-level updates ---
  await db
    .update(golfers)
    .set({
      firstName: details.firstName,
      lastName: details.lastName,
      fullName: details.fullName,
      handicapIndex: details.handicapIndex,
      handicapIndexValue: details.handicapIndexValue,
      lowHandicapIndex: details.lowHandicapIndex ?? golfer.lowHandicapIndex,
      club: details.club ?? golfer.club,
      association: details.association ?? golfer.association,
      status: details.status ?? golfer.status,
      revisionDate: details.revisionDate ?? golfer.revisionDate,
      lastSyncedAt: NOW(),
    })
    .where(eq(golfers.id, golfer.id));

  await persistDrafts(golfer.id, drafts);

  return {
    ghinNumber,
    golferId: golfer.id,
    fullName: golfer.fullName,
    newScores: newScoreCount,
    newRevisions: newRevisionCount,
    feedEventsCreated: drafts.length,
    backfilledScoreEvents: scoreDrafts.length,
    isNewGolfer: false,
  };
}

/**
 * Sync every golfer on the roster with bounded concurrency.
 */
export async function syncAllGolfers(concurrency = 3): Promise<SyncResult[]> {
  const all = await db.select({ ghinNumber: golfers.ghinNumber }).from(golfers);
  const results: SyncResult[] = [];
  let cursor = 0;

  async function worker() {
    while (cursor < all.length) {
      const idx = cursor++;
      const ghinNumber = all[idx].ghinNumber;
      try {
        results.push(await syncGolfer(ghinNumber));
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error(`[sync] failed for GHIN ${ghinNumber}`, err);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, all.length) }, worker));
  return results;
}

export interface BackfillResult {
  ghinNumber: string;
  fullName: string;
  feedEventsCreated: number;
}

export async function backfillGolferFeed(ghinNumber: string): Promise<BackfillResult> {
  const [golfer] = await db
    .select({ id: golfers.id, fullName: golfers.fullName })
    .from(golfers)
    .where(eq(golfers.ghinNumber, ghinNumber))
    .limit(1);
  if (!golfer) throw new Error(`Golfer with GHIN ${ghinNumber} is not on the roster.`);
  const drafts = await emitMissingScoreFeedEvents(golfer.id, golfer.fullName);
  await persistDrafts(golfer.id, drafts);
  return {
    ghinNumber,
    fullName: golfer.fullName,
    feedEventsCreated: drafts.length,
  };
}

export async function backfillRosterFeed(): Promise<BackfillResult[]> {
  const all = await db.select({ ghinNumber: golfers.ghinNumber }).from(golfers);
  const out: BackfillResult[] = [];
  for (const g of all) {
    try {
      out.push(await backfillGolferFeed(g.ghinNumber));
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`[backfill] failed for GHIN ${g.ghinNumber}`, err);
    }
  }
  return out;
}

export async function removeGolfer(ghinNumber: string): Promise<void> {
  await db.delete(golfers).where(eq(golfers.ghinNumber, ghinNumber));
}

export async function postAdminAnnouncement(input: {
  headline: string;
  details?: string | null;
  importance?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}): Promise<void> {
  await db.insert(feedEvents).values({
    type: 'ADMIN_ANNOUNCEMENT',
    headline: input.headline,
    details: input.details ?? null,
    importance: input.importance ?? 'HIGH',
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function emitMissingScoreFeedEvents(
  golferId: string,
  fullName: string,
): Promise<TimedDraft[]> {
  const [scoreRows, publishedScorePosted, publishedLowRound, publishedHandicapKeys] =
    await Promise.all([
      db
        .select()
        .from(scoresTbl)
        .where(eq(scoresTbl.golferId, golferId))
        .orderBy(asc(scoresTbl.datePlayed)),
      getPublishedScoreIds(golferId, 'SCORE_POSTED'),
      getPublishedScoreIds(golferId, 'LOW_ROUND_ALERT'),
      getPublishedHandicapKeys(golferId),
    ]);

  const drafts: TimedDraft[] = [];
  let runningLowest9: number | null = null;
  let runningLowest18: number | null = null;
  let lastSeenIndex: number | null = null;

  for (const row of scoreRows) {
    const ghinScore = scoreRowToGhinScore(row);
    const createdAt = parseDateOrNow(row.datePlayed);
    const holes = ghinScore.numberOfHoles ?? (row.adjustedGrossScore < 60 ? 9 : 18);
    const peer = holes === 9 ? runningLowest9 : runningLowest18;

    if (!publishedScorePosted.has(row.id)) {
      drafts.push({ draft: buildScorePostedEvent({ fullName }, ghinScore), createdAt });
    }
    if (!publishedLowRound.has(row.id)) {
      const lowDraft = buildLowRoundEvent({ fullName }, ghinScore, peer);
      if (lowDraft) drafts.push({ draft: lowDraft, createdAt });
    }

    // Derive a HANDICAP_CHANGED event whenever the index recorded on this
    // score differs from the previous score's index. GHIN's
    // /handicap_revisions.json endpoint is unavailable for many accounts
    // (404), so we rebuild revision history from the score history instead.
    const currIndex = parseHandicapIndex(row.handicapIndexAtTime ?? '');
    if (Number.isFinite(currIndex)) {
      if (lastSeenIndex !== null && Number.isFinite(lastSeenIndex)) {
        const prevRounded = Math.round(lastSeenIndex * 10) / 10;
        const nextRounded = Math.round(currIndex * 10) / 10;
        if (prevRounded !== nextRounded) {
          const dedupeKey = `${row.id}:${nextRounded}`;
          if (!publishedHandicapKeys.has(dedupeKey)) {
            const draft = buildIndexMovementFromScores(
              { fullName },
              prevRounded,
              nextRounded,
              row.datePlayed,
              row.id,
            );
            drafts.push({ draft, createdAt });
          }
        }
      }
      lastSeenIndex = currIndex;
    }

    if (holes === 9) {
      if (runningLowest9 == null || row.adjustedGrossScore < runningLowest9) {
        runningLowest9 = row.adjustedGrossScore;
      }
    } else {
      if (runningLowest18 == null || row.adjustedGrossScore < runningLowest18) {
        runningLowest18 = row.adjustedGrossScore;
      }
    }
  }

  return drafts;
}

/**
 * Build a HANDICAP_CHANGED draft from a score-to-score index movement.
 */
function buildIndexMovementFromScores(
  golfer: { fullName: string },
  prevRounded: number,
  nextRounded: number,
  scoreDate: string,
  scoreId: string,
): DraftFeedEvent {
  const delta = Math.round((nextRounded - prevRounded) * 10) / 10;
  const direction = delta < 0 ? 'dropped' : 'climbed';
  const sign = delta < 0 ? '−' : '+';
  const importance: DraftFeedEvent['importance'] =
    Math.abs(delta) >= 1 ? 'HIGH' : Math.abs(delta) >= 0.3 ? 'MEDIUM' : 'LOW';
  return {
    type: 'HANDICAP_CHANGED',
    headline: `${golfer.fullName}'s handicap index ${direction} to ${formatHandicapForHeadline(nextRounded)} (${sign}${Math.abs(delta).toFixed(1)})`,
    details: `Previous ${formatHandicapForHeadline(prevRounded)} • after round on ${scoreDate}`,
    importance,
    payload: { previous: prevRounded, next: nextRounded, delta, scoreId },
  };
}

function formatHandicapForHeadline(value: number): string {
  if (value < 0) return `+${Math.abs(value).toFixed(1)}`;
  return value.toFixed(1);
}

/**
 * Set of "scoreId:nextRoundedIndex" keys for HANDICAP_CHANGED events we've
 * already published — used to dedupe the score-derived index movements.
 */
async function getPublishedHandicapKeys(golferId: string): Promise<Set<string>> {
  const events = await db
    .select({ payload: feedEvents.payload })
    .from(feedEvents)
    .where(and(eq(feedEvents.golferId, golferId), eq(feedEvents.type, 'HANDICAP_CHANGED')));
  const out = new Set<string>();
  for (const e of events) {
    if (!e.payload) continue;
    try {
      const parsed = JSON.parse(e.payload) as { scoreId?: unknown; next?: unknown };
      if (typeof parsed.scoreId === 'string' && typeof parsed.next === 'number') {
        out.add(`${parsed.scoreId}:${parsed.next}`);
      }
    } catch {
      /* malformed payload — ignore */
    }
  }
  return out;
}

async function getPublishedScoreIds(
  golferId: string,
  type: 'SCORE_POSTED' | 'LOW_ROUND_ALERT',
): Promise<Set<string>> {
  const events = await db
    .select({ payload: feedEvents.payload })
    .from(feedEvents)
    .where(and(eq(feedEvents.golferId, golferId), eq(feedEvents.type, type)));
  const out = new Set<string>();
  for (const e of events) {
    if (!e.payload) continue;
    try {
      const parsed = JSON.parse(e.payload) as { scoreId?: unknown };
      if (typeof parsed.scoreId === 'string') out.add(parsed.scoreId);
    } catch {
      /* malformed payload — ignore */
    }
  }
  return out;
}

function scoreRowToGhinScore(row: ScoreRow): GhinScore {
  return {
    id: row.id,
    date: row.datePlayed,
    courseName: row.courseName,
    score: row.score,
    adjustedGrossScore: row.adjustedGrossScore,
    netScore: row.netScore,
    courseRating: row.courseRating ?? undefined,
    courseSlope: row.courseSlope ?? undefined,
    teeColor: row.teeColor ?? undefined,
    numberOfHoles: row.numberOfHoles ?? undefined,
    toParDisplay: row.toParDisplay ?? undefined,
    handicapIndexAtTime: row.handicapIndexAtTime ?? undefined,
  };
}

function parseDateOrNow(iso: string): Date {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return NOW();
  return new Date(t + 12 * 60 * 60 * 1000);
}

async function persistDrafts(
  golferId: string | null,
  drafts: TimedDraft[],
): Promise<void> {
  if (drafts.length === 0) return;
  try {
    await db.insert(feedEvents).values(
      drafts.map(({ draft, createdAt }) => ({
        golferId,
        type: draft.type,
        headline: draft.headline,
        details: draft.details ?? null,
        importance: draft.importance,
        payload: draft.payload ? JSON.stringify(draft.payload) : null,
        createdAt,
      })),
    );
    console.log(
      `[sync] persisted ${drafts.length} feed event(s)${golferId ? ` for golfer ${golferId}` : ''}`,
    );
  } catch (err) {
    console.error(
      `[sync] feed event insert FAILED${golferId ? ` for golfer ${golferId}` : ''}:`,
      err instanceof Error ? err.message : err,
    );
    // Re-throw so callers can include the failure in their HTTP response.
    throw err;
  }
}
