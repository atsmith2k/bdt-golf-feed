'use client';

import Link from 'next/link';
import useSWR from 'swr';
import clsx from 'clsx';
import { useMemo } from 'react';
import type {
  GolferProfileDTO,
  ProfileFeedEventDTO,
  ProfileHandicapPointDTO,
  ProfileScoreDTO,
  ProfileStatisticsDTO,
} from '@/types/golf';
import {
  formatHandicapIndex,
  formatIndexMovement,
  shortDate,
  timeAgo,
} from '@/lib/utils/format';

interface ProfileResponse {
  profile?: GolferProfileDTO;
  error?: string;
  message?: string;
}

const fetcher = async (url: string): Promise<ProfileResponse> => {
  const res = await fetch(url);
  const json = (await res.json().catch(() => ({}))) as ProfileResponse;
  if (!res.ok) {
    throw new Error(json.message ?? json.error ?? `Profile request failed (${res.status})`);
  }
  return json;
};

export function GolferProfile({ ghinNumber }: { ghinNumber: string }) {
  const { data, error, isLoading } = useSWR<ProfileResponse>(
    `/api/roster/${encodeURIComponent(ghinNumber)}`,
    fetcher,
    {
      refreshInterval: 4 * 60 * 60 * 1000,
      revalidateOnFocus: false,
      keepPreviousData: true,
    },
  );

  const profile = data?.profile;

  if (error) {
    return (
      <ProfileShell>
        <div className="bdt-card p-6 text-bdt-red font-mono text-sm">
          Couldn&apos;t load this profile: {error.message}.
        </div>
      </ProfileShell>
    );
  }

  if (!profile) {
    return (
      <ProfileShell>
        <div className="bdt-card p-8 text-center text-bdt-muted font-mono text-sm">
          {isLoading ? 'Loading profile…' : 'Profile unavailable.'}
        </div>
      </ProfileShell>
    );
  }

  return (
    <ProfileShell>
      <ProfileHero profile={profile} />
      <KeyStatsRow profile={profile} />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <HandicapTrendCard
          history={profile.handicapHistory}
          current={profile.handicapIndexValue}
          low={profile.lowHandicapIndex}
        />
        <ScoringStatsCard profile={profile} />
        <PlayerInfoCard profile={profile} />
      </div>
      {profile.statistics && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2">
            <ScoringMixCard statistics={profile.statistics} />
          </div>
          <AdvancedStatsCard statistics={profile.statistics} />
        </div>
      )}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <RecentRoundsCard scores={profile.recentScores} />
        </div>
        <CourseBreakdownCard breakdown={profile.courseBreakdown} />
      </div>
      <RevisionTimelineCard revisions={profile.revisions} />
      <ProfileFeedCard events={profile.events} fullName={profile.fullName} />
    </ProfileShell>
  );
}

// ---------------------------------------------------------------------------
// Layout shell
// ---------------------------------------------------------------------------

function ProfileShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-4">
      <Link
        href="/roster"
        className="self-start text-[10px] font-mono uppercase tracking-[0.3em] text-bdt-muted hover:text-bdt-cream"
      >
        ← Roster
      </Link>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Hero
// ---------------------------------------------------------------------------

function ProfileHero({ profile }: { profile: GolferProfileDTO }) {
  const initials = (profile.firstName?.[0] ?? '') + (profile.lastName?.[0] ?? '');
  const trendColor =
    profile.trend === 'DOWN'
      ? 'text-bdt-gold'
      : profile.trend === 'UP'
        ? 'text-bdt-red'
        : 'text-bdt-muted';
  const trendGlyph =
    profile.trend === 'DOWN' ? '▼' : profile.trend === 'UP' ? '▲' : '—';
  // `trendDelta` is signed using our internal lower-is-better convention,
  // not the on-screen "+N.N" plus-handicap convention. Render with the
  // movement helper so the description always reads correctly: a plus
  // golfer going +3.6 → +4.2 is "improved by 0.6", a normal golfer
  // going 10.5 → 9.0 is "improved by 1.5", etc.
  const movement = formatIndexMovement(profile.trendDelta);
  const trendLabel = movement.changed
    ? `${movement.verb} ${movement.magnitude}`
    : 'no change';

  return (
    <section className="bdt-card overflow-hidden">
      <div className="h-1 bg-bdt-bar bg-gradient-to-r from-bdt-red via-bdt-red to-bdt-redDeep" />
      <div className="grid grid-cols-1 md:grid-cols-[auto,1fr,auto] gap-6 items-center p-6">
        <div
          aria-hidden
          className="hidden md:flex items-center justify-center w-24 h-24 rounded-full border border-bdt-border bg-bdt-panelAlt font-display text-4xl tracking-[0.18em] text-bdt-cream glow-cream"
        >
          {initials.toUpperCase() || '—'}
        </div>

        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-[10px] font-mono uppercase tracking-[0.3em] text-bdt-muted">
            <span className="bdt-chip bg-bdt-red text-white">Player</span>
            <span>GHIN {profile.ghinNumber}</span>
            {profile.status && profile.status !== 'Active' && (
              <span className="bdt-chip bg-bdt-border text-white">{profile.status}</span>
            )}
            {profile.activeCap === 'SOFT' && (
              <span
                className="bdt-chip bg-bdt-gold text-black"
                title="GHIN soft cap currently limiting upward index movement"
              >
                Soft Cap
              </span>
            )}
            {profile.activeCap === 'HARD' && (
              <span
                className="bdt-chip bg-bdt-red text-white"
                title="GHIN hard cap currently limiting upward index movement"
              >
                Hard Cap
              </span>
            )}
          </div>
          <h1 className="mt-1 font-display tracking-[0.06em] text-4xl md:text-5xl text-white leading-tight">
            {profile.fullName}
          </h1>
          <div className="mt-2 text-sm text-bdt-muted font-mono">
            {[profile.club, profile.association].filter(Boolean).join(' · ') ||
              'Club not on file'}
          </div>
        </div>

        <div className="flex flex-col items-start md:items-end gap-1 font-mono">
          <span className="text-[10px] uppercase tracking-[0.3em] text-bdt-muted">
            Handicap Index
          </span>
          <span className="font-display text-5xl md:text-6xl text-bdt-cream glow-cream tabular-nums">
            {profile.handicapIndex}
          </span>
          <span className={clsx('text-xs font-mono', trendColor)}>
            <span className="mr-1">{trendGlyph}</span>
            {trendLabel}
            <span className="text-bdt-muted ml-2">
              · last sync {timeAgo(profile.lastSyncedAt)}
            </span>
          </span>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Key stat tiles
// ---------------------------------------------------------------------------

function KeyStatsRow({ profile }: { profile: GolferProfileDTO }) {
  const { stats } = profile;
  const tiles: Array<{ label: string; value: string; sub?: string }> = [
    {
      label: 'Rounds Posted',
      value: String(stats.rounds.total),
      sub: `${stats.rounds.eighteenHole}× 18 · ${stats.rounds.nineHole}× 9`,
    },
    {
      label: 'Low Index',
      value: profile.lowHandicapIndex ?? '—',
      sub: 'Career best',
    },
    {
      label: 'Avg AGS (18)',
      value: stats.averages.adjustedGross18 != null ? stats.averages.adjustedGross18.toFixed(1) : '—',
      sub:
        stats.averages.differentialLast20 != null
          ? `Diff (last 20) ${stats.averages.differentialLast20.toFixed(1)}`
          : 'Adjusted gross average',
    },
    {
      label: 'Best Round (18)',
      value: stats.lowest.adjustedGross18 != null ? String(stats.lowest.adjustedGross18) : '—',
      sub:
        stats.bestVsRating != null
          ? `${stats.bestVsRating.diff > 0 ? '+' : ''}${stats.bestVsRating.diff} vs rating`
          : 'Adjusted gross',
    },
    {
      label: 'Best Round (9)',
      value: stats.lowest.adjustedGross9 != null ? String(stats.lowest.adjustedGross9) : '—',
      sub: 'Adjusted gross',
    },
    {
      label: 'Courses Played',
      value: String(stats.uniqueCourses),
      sub: stats.lastPlayedAt ? `Last round ${shortDate(stats.lastPlayedAt)}` : 'No rounds yet',
    },
  ];

  return (
    <section className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
      {tiles.map((tile) => (
        <div key={tile.label} className="bdt-card p-4 flex flex-col gap-1">
          <span className="text-[10px] font-mono uppercase tracking-[0.25em] text-bdt-muted">
            {tile.label}
          </span>
          <span className="font-display text-3xl md:text-4xl text-bdt-cream glow-cream tabular-nums leading-none">
            {tile.value}
          </span>
          {tile.sub && (
            <span className="text-[11px] font-mono text-bdt-muted">{tile.sub}</span>
          )}
        </div>
      ))}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Handicap sparkline
// ---------------------------------------------------------------------------

function HandicapTrendCard({
  history,
  current,
  low,
}: {
  history: ProfileHandicapPointDTO[];
  current: number;
  low: string | null;
}) {
  const chart = useMemo(() => buildSparkline(history), [history]);

  return (
    <section className="bdt-card p-4">
      <header className="flex items-center justify-between">
        <h2 className="font-display tracking-[0.22em] text-lg text-bdt-cream">
          <span className="bdt-rule" />
          INDEX TREND
        </h2>
        <span className="text-[10px] font-mono uppercase tracking-widest text-bdt-muted">
          {history.length === 0
            ? 'No history yet'
            : `${history.length} point${history.length === 1 ? '' : 's'}`}
        </span>
      </header>
      <div className="mt-3">
        {chart ? (
          <svg
            viewBox={`0 0 ${chart.width} ${chart.height}`}
            preserveAspectRatio="none"
            className="w-full h-32"
            role="img"
            aria-label="Handicap index trend"
          >
            <defs>
              <linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#E5B335" stopOpacity="0.45" />
                <stop offset="100%" stopColor="#E5B335" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={chart.fillPath} fill="url(#sparkFill)" />
            <path
              d={chart.linePath}
              fill="none"
              stroke="#E5B335"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {chart.points.map((p, i) => (
              <circle
                key={i}
                cx={p.x}
                cy={p.y}
                r={i === chart.points.length - 1 ? 3.5 : 2}
                fill={i === chart.points.length - 1 ? '#F5EFE0' : '#E5B335'}
              />
            ))}
          </svg>
        ) : (
          <div className="h-32 flex items-center justify-center text-bdt-muted text-sm font-mono">
            No revision history on file yet — sync this golfer to populate.
          </div>
        )}
      </div>
      <dl className="grid grid-cols-3 gap-3 mt-3 text-center text-xs font-mono">
        <div>
          <dt className="text-[10px] uppercase tracking-widest text-bdt-muted">Current</dt>
          <dd className="text-bdt-cream font-display text-xl tabular-nums">
            {formatHandicapIndex(current)}
          </dd>
        </div>
        <div>
          <dt className="text-[10px] uppercase tracking-widest text-bdt-muted">Low</dt>
          <dd className="text-bdt-cream font-display text-xl tabular-nums">{low ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-[10px] uppercase tracking-widest text-bdt-muted">Range</dt>
          <dd className="text-bdt-cream font-display text-xl tabular-nums">
            {chart
              ? // Order the displayed range from "higher index" to "lower
                // index" so it reads scratch-side first regardless of
                // whether the player is a plus or conventional handicap.
                // `chart.max` is the largest internal value (worst index);
                // `chart.min` is the smallest (best, possibly a plus).
                `${formatHandicapIndex(chart.max)} – ${formatHandicapIndex(chart.min)}`
              : '—'}
          </dd>
        </div>
      </dl>
    </section>
  );
}

interface SparkChart {
  width: number;
  height: number;
  linePath: string;
  fillPath: string;
  points: { x: number; y: number }[];
  min: number;
  max: number;
}

function buildSparkline(points: ProfileHandicapPointDTO[]): SparkChart | null {
  if (points.length === 0) return null;
  const width = 320;
  const height = 96;
  const padX = 4;
  const padY = 8;
  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  // Pad the y-domain so a flat-ish line still reads as a horizontal stripe
  // rather than glued to the top/bottom edge.
  const range = Math.max(max - min, 0.5);
  const domainMin = min - range * 0.1;
  const domainMax = max + range * 0.1;
  const span = Math.max(domainMax - domainMin, 0.5);

  // With a single data point we still want to draw something — a flat
  // horizontal bar across the chart at that value reads correctly as
  // "this is the current index, no historical movement on file yet".
  const denom = points.length === 1 ? 1 : points.length - 1;
  const stepX = (width - padX * 2) / denom;
  const mapped = points.map((p, i) => {
    const x = points.length === 1 ? width / 2 : padX + i * stepX;
    const y = padY + ((domainMax - p.value) / span) * (height - padY * 2);
    return { x, y };
  });

  let linePath: string;
  if (mapped.length === 1) {
    const only = mapped[0];
    linePath = `M ${padX} ${only.y.toFixed(2)} L ${(width - padX).toFixed(2)} ${only.y.toFixed(2)}`;
  } else {
    linePath = mapped
      .map((pt, i) => `${i === 0 ? 'M' : 'L'} ${pt.x.toFixed(2)} ${pt.y.toFixed(2)}`)
      .join(' ');
  }

  const fillStartX = mapped.length === 1 ? padX : mapped[0].x;
  const fillEndX = mapped.length === 1 ? width - padX : mapped[mapped.length - 1].x;
  const fillPath = `${linePath} L ${fillEndX.toFixed(2)} ${height - padY} L ${fillStartX.toFixed(2)} ${height - padY} Z`;

  return { width, height, linePath, fillPath, points: mapped, min, max };
}

// ---------------------------------------------------------------------------
// Scoring stats card
// ---------------------------------------------------------------------------

function ScoringStatsCard({ profile }: { profile: GolferProfileDTO }) {
  const { stats } = profile;
  const trend = stats.scoringTrend.deltaLast5VsPrior5;
  const trendStr =
    trend == null
      ? '—'
      : trend === 0
        ? '±0.0 strokes'
        : `${trend < 0 ? '−' : '+'}${Math.abs(trend).toFixed(1)} strokes`;
  const trendNote =
    trend == null
      ? 'Need 10+ rounds for a comparison'
      : trend < 0
        ? 'Scoring better than recent baseline'
        : trend > 0
          ? 'Scoring above recent baseline'
          : 'Holding steady';

  const rows: Array<{ label: string; value: string }> = [
    {
      label: 'Avg Adjusted Gross (18)',
      value:
        stats.averages.adjustedGross18 != null
          ? stats.averages.adjustedGross18.toFixed(1)
          : '—',
    },
    {
      label: 'Avg Net (18)',
      value: stats.averages.net18 != null ? stats.averages.net18.toFixed(1) : '—',
    },
    {
      label: 'Avg Differential (last 20)',
      value:
        stats.averages.differentialLast20 != null
          ? stats.averages.differentialLast20.toFixed(1)
          : '—',
    },
    {
      label: 'Lowest Net (18)',
      value: stats.lowest.net18 != null ? String(stats.lowest.net18) : '—',
    },
  ];

  return (
    <section className="bdt-card p-4 flex flex-col gap-3">
      <header className="flex items-center justify-between">
        <h2 className="font-display tracking-[0.22em] text-lg text-bdt-cream">
          <span className="bdt-rule" />
          SCORING
        </h2>
        <span className="text-[10px] font-mono uppercase tracking-widest text-bdt-muted">
          Recent form
        </span>
      </header>

      <div className="bdt-card p-3 bg-bdt-panelAlt/40 border-bdt-border/80">
        <div className="text-[10px] uppercase tracking-widest text-bdt-muted font-mono">
          Last 5 vs prior 5
        </div>
        <div
          className={clsx(
            'font-display text-3xl tabular-nums',
            trend == null
              ? 'text-bdt-muted'
              : trend < 0
                ? 'text-bdt-gold glow-cream'
                : trend > 0
                  ? 'text-bdt-red glow-red'
                  : 'text-bdt-cream',
          )}
        >
          {trendStr}
        </div>
        <div className="text-xs text-bdt-muted font-mono">{trendNote}</div>
      </div>

      <dl className="grid grid-cols-1 gap-1.5 text-sm font-mono">
        {rows.map((r) => (
          <div
            key={r.label}
            className="flex items-baseline justify-between gap-3 border-b border-bdt-border/40 pb-1.5 last:border-b-0 last:pb-0"
          >
            <dt className="text-[11px] uppercase tracking-widest text-bdt-muted">
              {r.label}
            </dt>
            <dd className="text-bdt-cream tabular-nums">{r.value}</dd>
          </div>
        ))}
      </dl>

      {stats.bestVsRating && (
        <div className="text-xs font-mono text-bdt-muted border-t border-bdt-border/40 pt-2">
          <span className="text-bdt-cream">Career best vs rating:</span>{' '}
          {stats.bestVsRating.adjustedGross} at {stats.bestVsRating.courseName}{' '}
          ({stats.bestVsRating.diff > 0 ? '+' : ''}
          {stats.bestVsRating.diff}) on {shortDate(stats.bestVsRating.datePlayed)}
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Player info card
// ---------------------------------------------------------------------------

function PlayerInfoCard({ profile }: { profile: GolferProfileDTO }) {
  const rows: Array<{ label: string; value: string }> = [
    { label: 'Full Name', value: profile.fullName },
    { label: 'GHIN Number', value: profile.ghinNumber },
    { label: 'Home Club', value: profile.club ?? '—' },
    { label: 'Association', value: profile.association ?? '—' },
    { label: 'Status', value: profile.status },
    {
      label: 'Last Revision',
      value: profile.revisionDate ? shortDate(profile.revisionDate) : '—',
    },
    {
      label: 'On Roster Since',
      value: shortDate(profile.createdAt),
    },
    {
      label: 'Last Synced',
      value: timeAgo(profile.lastSyncedAt),
    },
  ];

  return (
    <section className="bdt-card p-4 flex flex-col gap-3">
      <header className="flex items-center justify-between">
        <h2 className="font-display tracking-[0.22em] text-lg text-bdt-cream">
          <span className="bdt-rule" />
          PROFILE
        </h2>
      </header>
      <dl className="grid grid-cols-1 gap-1.5 text-sm font-mono">
        {rows.map((r) => (
          <div
            key={r.label}
            className="flex items-baseline justify-between gap-3 border-b border-bdt-border/40 pb-1.5 last:border-b-0 last:pb-0"
          >
            <dt className="text-[11px] uppercase tracking-widest text-bdt-muted">
              {r.label}
            </dt>
            <dd className="text-bdt-cream text-right break-words">{r.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Recent rounds
// ---------------------------------------------------------------------------

function RecentRoundsCard({ scores }: { scores: ProfileScoreDTO[] }) {
  return (
    <section className="bdt-card p-4">
      <header className="flex items-center justify-between mb-3">
        <h2 className="font-display tracking-[0.22em] text-lg text-bdt-cream">
          <span className="bdt-rule" />
          RECENT ROUNDS
        </h2>
        <span className="text-[10px] font-mono uppercase tracking-widest text-bdt-muted">
          {scores.length === 0
            ? 'No scores posted'
            : `Last ${scores.length} round${scores.length === 1 ? '' : 's'}`}
        </span>
      </header>
      {scores.length === 0 ? (
        <p className="text-bdt-muted text-sm font-mono">
          No rounds have synced from GHIN yet.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-[10px] uppercase tracking-widest text-bdt-muted">
              <tr>
                <th className="text-left py-1">Date</th>
                <th className="text-left py-1">Course</th>
                <th className="text-right py-1">AGS</th>
                <th className="text-right py-1 hidden sm:table-cell">Net</th>
                <th className="text-right py-1 hidden md:table-cell">Tee · CR / Slope</th>
                <th className="text-right py-1">vs Rating</th>
                <th className="text-right py-1 hidden md:table-cell">Index</th>
              </tr>
            </thead>
            <tbody>
              {scores.map((s) => {
                const holes = s.numberOfHoles ?? (s.adjustedGrossScore < 60 ? 9 : 18);
                return (
                  <tr key={s.id} className="border-t border-bdt-border/60">
                    <td className="py-2 font-mono text-bdt-muted whitespace-nowrap">
                      {shortDate(s.datePlayed)}
                      {holes === 9 && (
                        <span className="ml-1 text-[10px] uppercase tracking-widest text-bdt-gold">
                          9
                        </span>
                      )}
                    </td>
                    <td className="py-2 text-white">
                      <div className="font-display tracking-wide">{s.courseName}</div>
                      {s.toParDisplay && (
                        <div className="text-[11px] text-bdt-muted font-mono">
                          {s.toParDisplay} to par
                        </div>
                      )}
                    </td>
                    <td className="py-2 text-right font-mono tabular-nums text-bdt-cream">
                      {s.adjustedGrossScore}
                    </td>
                    <td className="py-2 text-right font-mono tabular-nums text-bdt-muted hidden sm:table-cell">
                      {s.netScore && s.netScore < 200 ? s.netScore : '—'}
                    </td>
                    <td className="py-2 text-right font-mono text-[11px] text-bdt-muted hidden md:table-cell">
                      {[s.teeColor, s.courseRating, s.courseSlope]
                        .map((v, i) =>
                          i === 0
                            ? v
                            : v
                              ? i === 1
                                ? `${v}`
                                : `/${v}`
                              : '',
                        )
                        .filter(Boolean)
                        .join(' · ')}
                    </td>
                    <td className="py-2 text-right font-mono tabular-nums">
                      <span
                        className={clsx(
                          s.vsRating === 'E'
                            ? 'text-bdt-cream'
                            : s.vsRating?.startsWith('-')
                              ? 'text-bdt-gold'
                              : s.vsRating?.startsWith('+')
                                ? 'text-bdt-red'
                                : 'text-bdt-muted',
                        )}
                      >
                        {s.vsRating ?? '—'}
                      </span>
                    </td>
                    <td className="py-2 text-right font-mono text-[11px] text-bdt-muted hidden md:table-cell">
                      {s.handicapIndexAtTime ?? '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Course breakdown
// ---------------------------------------------------------------------------

function CourseBreakdownCard({
  breakdown,
}: {
  breakdown: GolferProfileDTO['courseBreakdown'];
}) {
  return (
    <section className="bdt-card p-4">
      <header className="flex items-center justify-between mb-3">
        <h2 className="font-display tracking-[0.22em] text-lg text-bdt-cream">
          <span className="bdt-rule" />
          COURSES
        </h2>
        <span className="text-[10px] font-mono uppercase tracking-widest text-bdt-muted">
          By round volume
        </span>
      </header>
      {breakdown.length === 0 ? (
        <p className="text-bdt-muted text-sm font-mono">No course history yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {breakdown.map((c) => (
            <li
              key={c.courseName}
              className="flex items-baseline justify-between gap-3 border-b border-bdt-border/40 pb-2 last:border-b-0 last:pb-0"
            >
              <div className="min-w-0">
                <div className="font-display tracking-wide text-white truncate">
                  {c.courseName}
                </div>
                <div className="text-[11px] font-mono text-bdt-muted uppercase tracking-widest">
                  {c.rounds} round{c.rounds === 1 ? '' : 's'} · avg{' '}
                  {c.averageAdjustedGross.toFixed(1)}
                </div>
              </div>
              <span className="font-mono tabular-nums text-bdt-cream">
                {c.bestAdjustedGross}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Player feed
// ---------------------------------------------------------------------------

function ProfileFeedCard({
  events,
  fullName,
}: {
  events: ProfileFeedEventDTO[];
  fullName: string;
}) {
  return (
    <section className="bdt-card p-4">
      <header className="flex items-center justify-between mb-3">
        <h2 className="font-display tracking-[0.22em] text-lg text-bdt-cream">
          <span className="bdt-rule" />
          PLAYER FEED
        </h2>
        <span className="text-[10px] font-mono uppercase tracking-widest text-bdt-muted">
          {events.length === 0 ? 'No events yet' : `${events.length} story stream`}
        </span>
      </header>
      {events.length === 0 ? (
        <p className="text-bdt-muted text-sm font-mono">
          {fullName} has no broadcast events on file yet — once a round posts, it&apos;ll
          show here.
        </p>
      ) : (
        <ol className="flex flex-col gap-2">
          {events.map((e) => (
            <li
              key={e.id}
              className="border-l-2 border-bdt-border pl-3 py-1.5 hover:border-bdt-red transition-colors"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className={clsx('bdt-chip', eventBadgeClass(e.type))}>
                  {e.type.replace('_', ' ')}
                </span>
                {e.importance === 'CRITICAL' && (
                  <span className="bdt-chip bg-bdt-red text-white">Alert</span>
                )}
                <span
                  className="text-[11px] font-mono text-bdt-muted"
                  title={new Date(e.createdAt).toLocaleString()}
                >
                  {timeAgo(e.createdAt)}
                </span>
              </div>
              <div className="font-display tracking-wide text-white text-base mt-0.5">
                {e.headline}
              </div>
              {e.details && (
                <div className="text-xs text-bdt-muted font-mono mt-0.5">{e.details}</div>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function eventBadgeClass(type: ProfileFeedEventDTO['type']): string {
  switch (type) {
    case 'LOW_ROUND_ALERT':
      return 'bg-bdt-gold text-black';
    case 'HANDICAP_CHANGED':
      return 'bg-bdt-cream text-bdt-bg';
    case 'ADMIN_ANNOUNCEMENT':
      return 'bg-bdt-red text-white';
    case 'MILESTONE':
      return 'bg-white text-bdt-bg';
    default:
      return 'bg-bdt-border text-white';
  }
}

// ---------------------------------------------------------------------------
// Scoring mix (round distribution)
// ---------------------------------------------------------------------------

interface MixSlice {
  key: string;
  label: string;
  percent: number;
  color: string;
}

function ScoringMixCard({ statistics }: { statistics: ProfileStatisticsDTO }) {
  const summary = statistics.scoreSummary;
  const slices: MixSlice[] = [
    {
      key: 'birdies',
      label: 'Birdie or better',
      percent: summary.birdiesOrBetterPercent ?? 0,
      color: '#E5B335',
    },
    {
      key: 'pars',
      label: 'Par',
      percent: summary.parsPercent ?? 0,
      color: '#F5EFE0',
    },
    {
      key: 'bogeys',
      label: 'Bogey',
      percent: summary.bogeysPercent ?? 0,
      color: '#3B5A98',
    },
    {
      key: 'doubles',
      label: 'Double bogey',
      percent: summary.doubleBogeysPercent ?? 0,
      color: '#A8121F',
    },
    {
      key: 'triples',
      label: 'Triple+',
      percent: summary.tripleBogeysOrWorsePercent ?? 0,
      color: '#D41F2F',
    },
  ];
  const total = slices.reduce((sum, s) => sum + s.percent, 0);
  const hasData = total > 0 && statistics.totalSummaryRounds > 0;
  const parsOrBetter = summary.parsOrBetter;
  const parAverages = [
    { label: 'Par 3', value: summary.par3sAverage },
    { label: 'Par 4', value: summary.par4sAverage },
    { label: 'Par 5', value: summary.par5sAverage },
  ].filter((p) => p.value != null) as { label: string; value: number }[];

  return (
    <section className="bdt-card p-4 flex flex-col gap-3">
      <header className="flex items-center justify-between">
        <h2 className="font-display tracking-[0.22em] text-lg text-bdt-cream">
          <span className="bdt-rule" />
          SCORING MIX
        </h2>
        <span className="text-[10px] font-mono uppercase tracking-widest text-bdt-muted">
          {statistics.totalSummaryRounds} rounds analyzed
        </span>
      </header>

      {hasData ? (
        <>
          <div
            className="flex h-4 w-full overflow-hidden rounded-sm border border-bdt-border"
            role="img"
            aria-label="Scoring distribution by hole result"
          >
            {slices.map((s) =>
              s.percent > 0 ? (
                <span
                  key={s.key}
                  className="h-full"
                  style={{
                    width: `${(s.percent / total) * 100}%`,
                    backgroundColor: s.color,
                  }}
                  title={`${s.label}: ${s.percent.toFixed(0)}%`}
                />
              ) : null,
            )}
          </div>

          <ul className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs font-mono">
            {slices.map((s) => (
              <li key={s.key} className="flex items-center gap-2">
                <span
                  aria-hidden
                  className="inline-block w-2.5 h-2.5 rounded-sm"
                  style={{ backgroundColor: s.color }}
                />
                <span className="text-bdt-muted uppercase tracking-widest text-[10px]">
                  {s.label}
                </span>
                <span className="ml-auto text-bdt-cream tabular-nums">
                  {s.percent.toFixed(0)}%
                </span>
              </li>
            ))}
          </ul>

          {(parsOrBetter != null || parAverages.length > 0) && (
            <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2 mt-1 pt-3 border-t border-bdt-border/40 text-xs font-mono">
              {parsOrBetter != null && (
                <div>
                  <span className="text-[10px] uppercase tracking-widest text-bdt-muted">
                    Pars or better
                  </span>{' '}
                  <span className="text-bdt-cream font-display text-lg tabular-nums ml-1">
                    {parsOrBetter}
                  </span>
                </div>
              )}
              {parAverages.map((p) => (
                <div key={p.label}>
                  <span className="text-[10px] uppercase tracking-widest text-bdt-muted">
                    {p.label} avg
                  </span>{' '}
                  <span className="text-bdt-cream font-display text-lg tabular-nums ml-1">
                    {p.value.toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <p className="text-bdt-muted text-sm font-mono">
          GHIN hasn&apos;t computed a scoring distribution for this player yet — that
          requires a few posted rounds.
        </p>
      )}

      <p className="text-[10px] font-mono uppercase tracking-widest text-bdt-muted">
        Refreshed {timeAgo(statistics.updatedAt)}
      </p>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Advanced stats (only meaningful when GHIN shot tracking is on)
// ---------------------------------------------------------------------------

function AdvancedStatsCard({ statistics }: { statistics: ProfileStatisticsDTO }) {
  const a = statistics.advancedStats;
  const fields = [
    { label: 'Fairways', value: a.fairwayHitsPercent, suffix: '%' },
    { label: 'GIR', value: a.girPercent, suffix: '%' },
    { label: '1-Putt or better', value: a.onePuttOrBetterPercent, suffix: '%' },
    { label: '3-Putt or worse', value: a.threePuttOrWorsePercent, suffix: '%' },
    { label: 'Putts / Round', value: a.putts, suffix: '' },
    { label: 'Up & Downs', value: a.upAndDownsTotal, suffix: '' },
  ];
  const hasAny = fields.some((f) => f.value != null && f.value > 0);

  return (
    <section className="bdt-card p-4 flex flex-col gap-3">
      <header className="flex items-center justify-between">
        <h2 className="font-display tracking-[0.22em] text-lg text-bdt-cream">
          <span className="bdt-rule" />
          ADVANCED
        </h2>
        <span className="text-[10px] font-mono uppercase tracking-widest text-bdt-muted">
          {statistics.totalStatsRounds} tracked
        </span>
      </header>
      {hasAny ? (
        <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm font-mono">
          {fields.map((f) => (
            <div key={f.label} className="flex flex-col">
              <dt className="text-[10px] uppercase tracking-widest text-bdt-muted">
                {f.label}
              </dt>
              <dd className="text-bdt-cream font-display text-xl tabular-nums">
                {f.value != null
                  ? `${f.suffix === '%' ? f.value.toFixed(0) : f.value.toFixed(1)}${f.suffix}`
                  : '—'}
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="text-bdt-muted text-sm font-mono">
          No shot-tracked rounds on file — advanced stats activate once a player
          enters fairways, GIR, and putt counts in GHIN.
        </p>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Revision timeline (raw data view of /handicap_history.json)
// ---------------------------------------------------------------------------

function RevisionTimelineCard({
  revisions,
}: {
  revisions: GolferProfileDTO['revisions'];
}) {
  if (revisions.length === 0) return null;
  // Show only revisions where the displayed index actually changed from the
  // prior row, so the table reads like real movements rather than a wall of
  // identical numbers.
  const movements = revisions.filter((r, i, arr) => {
    const prev = arr[i + 1];
    if (!prev) return true;
    return Math.round(r.handicapIndexValue * 10) !== Math.round(prev.handicapIndexValue * 10);
  });
  const visible = movements.slice(0, 14);

  return (
    <section className="bdt-card p-4">
      <header className="flex items-center justify-between mb-3">
        <h2 className="font-display tracking-[0.22em] text-lg text-bdt-cream">
          <span className="bdt-rule" />
          REVISION HISTORY
        </h2>
        <span className="text-[10px] font-mono uppercase tracking-widest text-bdt-muted">
          {revisions.length} revisions tracked
        </span>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-[10px] uppercase tracking-widest text-bdt-muted">
            <tr>
              <th className="text-left py-1">Date</th>
              <th className="text-right py-1">Index</th>
              <th className="text-right py-1">Δ</th>
              <th className="text-right py-1 hidden sm:table-cell">Low HI</th>
              <th className="text-right py-1 hidden md:table-cell">Cap</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r, i) => {
              const prev = visible[i + 1];
              const delta =
                prev != null
                  ? Math.round((r.handicapIndexValue - prev.handicapIndexValue) * 10) / 10
                  : null;
              // Internal delta convention: negative = improvement (smaller
              // handicap, whether 10.5→9.0 or +3.6→+4.2). Render with the
              // movement helper so the table reads "improved 0.6" rather
              // than "−0.6" against a +4.2 index.
              const movement =
                delta != null ? formatIndexMovement(delta) : null;
              const cap = r.isHardCap ? 'Hard' : r.isSoftCap ? 'Soft' : null;
              return (
                <tr key={`${r.revisionDate}-${i}`} className="border-t border-bdt-border/60">
                  <td className="py-2 font-mono text-bdt-muted whitespace-nowrap">
                    {shortDate(r.revisionDate)}
                  </td>
                  <td className="py-2 text-right font-mono tabular-nums text-bdt-cream">
                    {r.handicapIndex}
                  </td>
                  <td
                    className={clsx(
                      'py-2 text-right font-mono tabular-nums',
                      movement == null || movement.verb === 'held'
                        ? 'text-bdt-muted'
                        : movement.verb === 'improved'
                          ? 'text-bdt-gold'
                          : 'text-bdt-red',
                    )}
                    title={
                      movement && movement.changed
                        ? `${movement.verb} by ${movement.magnitude}`
                        : undefined
                    }
                  >
                    {movement == null
                      ? '—'
                      : !movement.changed
                        ? '±0.0'
                        : `${movement.verb === 'improved' ? '▼' : '▲'} ${movement.magnitude}`}
                  </td>
                  <td className="py-2 text-right font-mono text-bdt-muted hidden sm:table-cell">
                    {r.lowHandicapIndex ?? '—'}
                  </td>
                  <td className="py-2 text-right font-mono hidden md:table-cell">
                    {cap ? (
                      <span
                        className={clsx(
                          'bdt-chip',
                          cap === 'Hard'
                            ? 'bg-bdt-red text-white'
                            : 'bg-bdt-gold text-black',
                        )}
                      >
                        {cap}
                        {r.hiBeforeSoftCap ? ` · ${r.hiBeforeSoftCap}` : ''}
                      </span>
                    ) : (
                      <span className="text-bdt-muted">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
