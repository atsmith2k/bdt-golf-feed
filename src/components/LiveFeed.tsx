'use client';

import useSWR from 'swr';
import clsx from 'clsx';
import type { FeedEventDTO } from '@/types/golf';
import { timeAgo } from '@/lib/utils/format';

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

export function LiveFeed() {
  const { data, error, isLoading } = useSWR<FeedResponse>('/api/feed?limit=60', fetcher, {
    refreshInterval: 15_000,
    revalidateOnFocus: false,
    keepPreviousData: true,
  });
  const events = data?.events ?? [];

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="font-display tracking-[0.25em] text-2xl text-bdt-cream">
          <span className="bdt-rule" />
          LIVE FEED
        </h2>
        <span className="text-xs font-mono uppercase tracking-widest text-bdt-muted">
          {error
            ? 'Connection issue'
            : isLoading && events.length === 0
              ? 'Loading…'
              : `${events.length} stories · refresh 15s`}
        </span>
      </div>

      {error ? (
        <div className="bdt-card p-6 text-bdt-red font-mono text-sm">
          Couldn't load the feed: {error.message}. The page will retry automatically.
        </div>
      ) : events.length === 0 && !isLoading ? (
        <div className="bdt-card p-8 text-center text-bdt-muted">
          No events yet. Once the roster syncs, score posts and handicap moves will stream in here.
        </div>
      ) : (
        <ol className="flex flex-col gap-3">
          {events.map((e) => {
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
