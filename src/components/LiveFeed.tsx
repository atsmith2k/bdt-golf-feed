'use client';

import { useMemo, useState, useCallback } from 'react';
import useSWR from 'swr';
import clsx from 'clsx';
import type { FeedEventDTO, FeedEventType } from '@/types/golf';
import { timeAgo } from '@/lib/utils/format';

const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;

interface FeedResponse {
  events: FeedEventDTO[];
  count?: number;
  error?: string;
  message?: string;
}

const fetcher = async (url: string): Promise<FeedResponse> => {
  const res = await fetch(url);
  const json = (await res.json().catch(() => ({}))) as FeedResponse;
  if (!res.ok) {
    throw new Error(json.message ?? json.error ?? `Feed request failed (${res.status})`);
  }
  // Surface in the browser console so it's obvious whether the fetch is
  // firing and what it returned. Trimmed to keep DevTools tidy.
  if (typeof window !== 'undefined') {
    // eslint-disable-next-line no-console
    console.debug('[live-feed] fetched', url, '→', json.events?.length ?? 0, 'events');
  }
  return json;
};

function badgeStyles(type: FeedEventDTO['type']) {
  switch (type) {
    case 'LOW_ROUND_ALERT':
      return 'bg-bdt-gold text-black';
    case 'HANDICAP_CHANGED':
      return 'bg-bdt-cream text-bdt-bg';
    case 'ADMIN_ANNOUNCEMENT':
      return 'bg-bdt-red text-white animate-flash';
    case 'MILESTONE':
      return 'bg-white text-bdt-bg';
    default:
      return 'bg-bdt-border text-white';
  }
}

function badgeLabel(type: FeedEventDTO['type']) {
  return type.replace('_', ' ');
}

/**
 * Strip a few sentinel substrings GHIN occasionally returns:
 *   - "Net 999" → no net score recorded for the round (away rounds, etc.)
 *   - "Course Rating null" / "Slope null" — already filtered upstream, but
 *     defensive cleanup in case of older rows.
 *
 * Returns null when the cleaned details would be empty so the component
 * can hide the line entirely.
 */
function cleanDetails(details: string | null | undefined): string | null {
  if (!details) return null;
  const parts = details
    .split('•')
    .map((p) => p.trim())
    .filter((p) => {
      if (!p) return false;
      if (/Net\s+999\b/i.test(p)) return false;
      if (/(Course Rating|Slope|Played)\s+(null|undefined)/i.test(p)) return false;
      return true;
    });
  return parts.length > 0 ? parts.join(' • ') : null;
}

type FilterValue = 'ALL' | FeedEventType;
type SortValue = 'NEWEST' | 'OLDEST' | 'IMPORTANCE';

const FILTER_OPTIONS: { value: FilterValue; label: string }[] = [
  { value: 'ALL', label: 'All Events' },
  { value: 'SCORE_POSTED', label: 'Score Posted' },
  { value: 'HANDICAP_CHANGED', label: 'Handicap Changed' },
  { value: 'LOW_ROUND_ALERT', label: 'Low Round Alert' },
  { value: 'MILESTONE', label: 'Milestone' },
  { value: 'ADMIN_ANNOUNCEMENT', label: 'Announcement' },
];

const SORT_OPTIONS: { value: SortValue; label: string }[] = [
  { value: 'NEWEST', label: 'Newest first' },
  { value: 'OLDEST', label: 'Oldest first' },
  { value: 'IMPORTANCE', label: 'Most important' },
];

const IMPORTANCE_RANK: Record<FeedEventDTO['importance'], number> = {
  CRITICAL: 4,
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
};

const SELECT_CLASS =
  'bg-bdt-panel border border-bdt-border rounded-sm px-2 py-1 text-xs font-mono uppercase tracking-widest text-bdt-cream focus:outline-none focus:ring-1 focus:ring-bdt-red focus:border-bdt-red';

export function LiveFeed() {
  const { data, error, isLoading, mutate } = useSWR<FeedResponse>('/api/feed?limit=60', fetcher, {
    refreshInterval: FOUR_HOURS_MS,
    revalidateOnFocus: false,
    keepPreviousData: true,
  });

  const [filter, setFilter] = useState<FilterValue>('ALL');
  const [sort, setSort] = useState<SortValue>('NEWEST');

  const handleRefresh = useCallback(() => {
    mutate();
  }, [mutate]);

  const events = useMemo(() => data?.events ?? [], [data?.events]);

  const visibleEvents = useMemo(() => {
    const filtered = filter === 'ALL' ? events : events.filter((e) => e.type === filter);
    const sorted = [...filtered];
    switch (sort) {
      case 'OLDEST':
        sorted.sort(
          (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
        );
        break;
      case 'IMPORTANCE':
        sorted.sort((a, b) => {
          const diff = IMPORTANCE_RANK[b.importance] - IMPORTANCE_RANK[a.importance];
          if (diff !== 0) return diff;
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        });
        break;
      case 'NEWEST':
      default:
        sorted.sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        );
        break;
    }
    return sorted;
  }, [events, filter, sort]);

  const statusText = error
    ? 'Connection issue'
    : isLoading && events.length === 0
      ? 'Loading…'
      : `${visibleEvents.length}${
          filter === 'ALL' ? '' : ` of ${events.length}`
        } stories`;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display tracking-[0.25em] text-2xl text-bdt-cream">
          <span className="bdt-rule" />
          LIVE FEED
        </h2>
        <div className="flex items-center gap-3">
          <span className="text-xs font-mono uppercase tracking-widest text-bdt-muted">
            {statusText}
          </span>
          <button
            type="button"
            onClick={handleRefresh}
            disabled={isLoading}
            className="text-[10px] font-mono uppercase tracking-widest text-bdt-cream border border-bdt-border rounded-sm px-2 py-1 hover:bg-bdt-border/40 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            aria-label="Refresh feed"
          >
            {isLoading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-bdt-muted">
          <span>Filter</span>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as FilterValue)}
            className={SELECT_CLASS}
            aria-label="Filter feed by event type"
          >
            {FILTER_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-bdt-muted">
          <span>Sort</span>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortValue)}
            className={SELECT_CLASS}
            aria-label="Sort feed"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        {filter !== 'ALL' && (
          <button
            type="button"
            onClick={() => setFilter('ALL')}
            className="text-[10px] font-mono uppercase tracking-widest text-bdt-muted hover:text-bdt-cream underline-offset-4 hover:underline"
          >
            Clear filter
          </button>
        )}
      </div>

      {error ? (
        <div className="bdt-card p-6 text-bdt-red font-mono text-sm">
          Couldn&apos;t load the feed: {error.message}. The page will retry automatically.
        </div>
      ) : visibleEvents.length === 0 && !isLoading ? (
        <div className="bdt-card p-8 text-center text-bdt-muted">
          {events.length === 0
            ? 'No events yet. Once the roster syncs, score posts and handicap moves will stream in here.'
            : 'No events match this filter. Try a different category or clear the filter.'}
        </div>
      ) : (
        <ol className="flex flex-col gap-3">
          {visibleEvents.map((e) => {
            const cleanedDetails = cleanDetails(e.details);
            return (
              <li key={e.id} className="bdt-card p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={clsx('bdt-chip', badgeStyles(e.type))}>
                      {badgeLabel(e.type)}
                    </span>
                    {e.importance === 'CRITICAL' && (
                      <span className="bdt-chip bg-bdt-red text-white">Alert</span>
                    )}
                    {e.golferName && (
                      <span className="text-xs font-mono text-bdt-muted uppercase tracking-widest">
                        {e.golferName}
                      </span>
                    )}
                  </div>
                  <span
                    className="text-xs font-mono text-bdt-muted shrink-0"
                    title={new Date(e.createdAt).toLocaleString()}
                  >
                    {timeAgo(e.createdAt)}
                  </span>
                </div>
                <h3 className="mt-2 font-display tracking-wide text-xl md:text-2xl text-white leading-tight">
                  {e.headline}
                </h3>
                {cleanedDetails && (
                  <p className="mt-1 text-sm text-bdt-muted font-mono">{cleanedDetails}</p>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
