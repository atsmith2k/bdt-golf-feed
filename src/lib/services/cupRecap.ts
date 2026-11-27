// src/lib/services/cupRecap.ts
//
// The weekly Ryder Cup recap: a feed story, a push and an email digest built
// from the week's results in the same broadcast voice as the rest of the feed.
//
// A week runs Monday to Sunday in the tour's time zone. The recap for a week
// goes out the morning after it ends (see the schedule in
// src/instrumentation-node.ts); the CupRecap table records each one so a
// restart or a second run never repeats it.

import { db, cupRecaps, feedEvents } from '@/lib/db';
import { getCupState } from '@/lib/services/cup';
import { emailSubscribers } from '@/lib/services/cupNotify';
import { sendPushToAll } from '@/lib/services/push';
import { siteOrigin } from '@/lib/services/session';
import { SYNC_TIME_ZONE } from '@/lib/syncSchedule';
import {
  formatCupDate,
  formatCupPoints,
  sideNames,
  type CupMatchDTO,
  type CupStateDTO,
} from '@/types/cup';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Today's calendar date in the tour's time zone, as YYYY-MM-DD. */
export function tourDate(at: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: SYNC_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at);
}

function addDays(iso: string, days: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** The last Sunday strictly before `today` (both YYYY-MM-DD). */
export function lastSundayBefore(today: string): string {
  const dow = new Date(`${today}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  return addDays(today, dow === 0 ? -7 : -dow);
}

/** The date a result counts for: when it was played, else when it was reported. */
function resultDate(match: CupMatchDTO): string | null {
  return match.playDate ?? (match.reportedAt ? tourDate(new Date(match.reportedAt)) : null);
}

export interface WeeklyRecap {
  headline: string;
  details: string;
  /** Plain-text body of the email digest. */
  text: string;
  /** False when nothing was played and nothing is coming up. */
  hasNews: boolean;
}

/**
 * Pure: the recap for the seven days ending on `weekEnding`, with what is
 * scheduled for the seven days after it.
 */
export function buildWeeklyRecap(state: CupStateDTO, weekEnding: string): WeeklyRecap | null {
  if (!state.season || state.teams.length !== 2) return null;
  const [a, b] = state.teams;
  const weekStart = addDays(weekEnding, -6);
  const nextEnd = addDays(weekEnding, 7);

  const played = state.matches.filter((m) => {
    if (m.status !== 'FINAL') return false;
    const d = resultDate(m);
    return d !== null && d >= weekStart && d <= weekEnding;
  });
  const upcoming = state.matches.filter(
    (m) =>
      m.status === 'SCHEDULED' && m.playDate !== null && m.playDate > weekEnding && m.playDate <= nextEnd,
  );

  // Points won this week, by team and by player.
  const weekPoints = new Map<string, number>([
    [a.id, 0],
    [b.id, 0],
  ]);
  const playerWeek = new Map<string, { name: string; points: number; wins: number }>();
  for (const m of played) {
    for (const side of m.sides) {
      const gained = m.winnerTeamId === null ? m.points / 2 : m.winnerTeamId === side.teamId ? m.points : 0;
      weekPoints.set(side.teamId, (weekPoints.get(side.teamId) ?? 0) + gained);
      for (const p of side.players) {
        const row = playerWeek.get(p.golferId) ?? { name: p.fullName, points: 0, wins: 0 };
        row.points += gained;
        if (m.winnerTeamId === side.teamId) row.wins += 1;
        playerWeek.set(p.golferId, row);
      }
    }
  }
  const star = [...playerWeek.values()].sort((x, y) => y.points - x.points || y.wins - x.wins)[0];

  const score = `${a.name} ${formatCupPoints(a.points)} – ${formatCupPoints(b.points)} ${b.name}`;
  const leader = a.points === b.points ? null : a.points > b.points ? a : b;
  const target = state.season.pointsToWin;
  const standing = !leader
    ? 'All square'
    : target !== null && leader.points >= target
      ? `${leader.name} have won the cup`
      : `${leader.name} lead by ${formatCupPoints(Math.abs(a.points - b.points))}`;

  const toGo =
    target !== null && Math.max(a.points, b.points) < target
      ? [a, b].map((t) => `${t.name} need ${formatCupPoints(target - t.points)}`).join(', ')
      : null;

  const weekLine =
    played.length === 0
      ? 'No matches this week'
      : `This week: ${a.name} ${formatCupPoints(weekPoints.get(a.id) ?? 0)} – ${formatCupPoints(weekPoints.get(b.id) ?? 0)} ${b.name} over ${played.length} ${played.length === 1 ? 'match' : 'matches'}`;

  const details = [
    weekLine,
    star && star.points > 0
      ? `Player of the week: ${star.name} (${formatCupPoints(star.points)} ${star.points === 1 ? 'pt' : 'pts'})`
      : null,
    toGo,
    upcoming.length > 0
      ? `Next up: ${upcoming.length} ${upcoming.length === 1 ? 'match' : 'matches'} scheduled`
      : null,
  ]
    .filter(Boolean)
    .join(' • ');

  const resultLines = played.map((m) => {
    const names = `${sideNames(m, a.id)} vs ${sideNames(m, b.id)}`;
    const outcome =
      m.winnerTeamId === null
        ? 'halved'
        : `${m.winnerTeamId === a.id ? a.name : b.name} won${m.margin ? ` ${m.margin}` : ''}`;
    return `  ${m.format} (${formatCupPoints(m.points)}): ${names} - ${outcome}`;
  });
  const upcomingLines = upcoming.map(
    (m) =>
      `  ${formatCupDate(m.playDate)}: ${m.format} (${formatCupPoints(m.points)}) - ${sideNames(m, a.id)} vs ${sideNames(m, b.id)}`,
  );

  const text = [
    `${state.season.name}: week ending ${formatCupDate(weekEnding)}`,
    '',
    score,
    standing + (toGo ? `. ${toGo}.` : '.'),
    '',
    played.length ? 'RESULTS' : 'No matches were played this week.',
    ...resultLines,
    ...(star && star.points > 0
      ? ['', `Player of the week: ${star.name}, ${formatCupPoints(star.points)} ${star.points === 1 ? 'point' : 'points'}.`]
      : []),
    ...(upcomingLines.length ? ['', 'COMING UP', ...upcomingLines] : []),
  ].join('\n');

  return {
    headline: `Ryder Cup weekly: ${score}`,
    details,
    text,
    hasNews: played.length > 0 || upcoming.length > 0,
  };
}

async function publish(recap: WeeklyRecap, origin: string): Promise<void> {
  await db.insert(feedEvents).values({
    type: 'CUP_RECAP',
    importance: 'MEDIUM',
    headline: recap.headline,
    details: recap.details,
  });
  await Promise.all([
    sendPushToAll({ title: recap.headline, body: recap.details, url: '/ryder-cup', tag: 'cup-recap' }),
    emailSubscribers(origin, 'weekly', {
      subject: recap.headline,
      text: `${recap.text}\n\nScoreboard: ${origin}/ryder-cup`,
    }),
  ]);
}

export type RecapOutcome = 'sent' | 'already_sent' | 'nothing_to_report' | 'no_season';

/**
 * Send the recap for the week that most recently ended, once. Safe to call
 * any number of times.
 */
export async function runWeeklyRecap(now: Date = new Date()): Promise<RecapOutcome> {
  const state = await getCupState();
  if (!state.season || state.season.status !== 'ACTIVE') return 'no_season';

  const weekEnding = lastSundayBefore(tourDate(now));
  const recap = buildWeeklyRecap(state, weekEnding);
  if (!recap) return 'no_season';

  // Claim the week first, so two runs cannot both publish it.
  const claimed = await db
    .insert(cupRecaps)
    .values({ seasonId: state.season.id, weekEnding })
    .onConflictDoNothing()
    .returning({ id: cupRecaps.id });
  if (claimed.length === 0) return 'already_sent';
  if (!recap.hasNews) return 'nothing_to_report';

  await publish(recap, siteOrigin());
  return 'sent';
}

/** What the recap would say if it went out now, for the seven days to today. */
export async function previewRecap(now: Date = new Date()): Promise<WeeklyRecap | null> {
  return buildWeeklyRecap(await getCupState(), tourDate(now));
}

/** Admin "send now": the seven days to today, outside the weekly ledger. */
export async function sendRecapNow(
  origin: string,
  now: Date = new Date(),
): Promise<WeeklyRecap | null> {
  const recap = await previewRecap(now);
  if (recap) await publish(recap, origin);
  return recap;
}
