'use client';

import useSWR from 'swr';
import { useMemo } from 'react';
import type { FeedEventDTO } from '@/types/golf';

interface FeedResponse {
  events: FeedEventDTO[];
  count?: number;
  error?: string;
  message?: string;
}

const fetcher = async (url: string): Promise<FeedResponse> => {
  const res = await fetch(url);
  const json = (await res.json().catch(() => ({}))) as FeedResponse;
  if (!res.ok) throw new Error(json.message ?? json.error ?? `Ticker request failed (${res.status})`);
  if (typeof window !== 'undefined') {
    // eslint-disable-next-line no-console
    console.debug('[ticker] fetched', url, '→', json.events?.length ?? 0, 'events');
  }
  return json;
};

function colorForType(type: FeedEventDTO['type']) {
  switch (type) {
    case 'LOW_ROUND_ALERT':
      return 'text-bdt-gold';
    case 'HANDICAP_CHANGED':
      return 'text-bdt-cream';
    case 'ADMIN_ANNOUNCEMENT':
      return 'text-bdt-red';
    case 'MILESTONE':
      return 'text-white';
    default:
      return 'text-white/90';
  }
}

function labelForType(type: FeedEventDTO['type']) {
  switch (type) {
    case 'LOW_ROUND_ALERT':
      return 'LOW ROUND';
    case 'HANDICAP_CHANGED':
      return 'INDEX MOVE';
    case 'SCORE_POSTED':
      return 'SCORE';
    case 'ADMIN_ANNOUNCEMENT':
      return 'BREAKING';
    case 'MILESTONE':
      return 'MILESTONE';
    default:
      return 'UPDATE';
  }
}

export function Ticker() {
  const { data, error } = useSWR<FeedResponse>('/api/feed?limit=40', fetcher, {
    refreshInterval: 15_000,
    revalidateOnFocus: false,
    keepPreviousData: true,
  });
  const events = data?.events ?? [];
  // Duplicate the track so the marquee loops seamlessly: animation translates -50%.
  const items = useMemo(() => [...events, ...events], [events]);

  return (
    <div className="relative z-10 border-t border-bdt-border bg-bdt-panel/95 overflow-hidden">
      <div className="h-1 bg-bdt-red" />
      <div className="flex items-stretch">
        <div className="shrink-0 bg-bdt-red text-white px-5 py-2 font-display tracking-[0.3em] text-lg flex items-center gap-2">
          <span className="inline-block h-2 w-2 rounded-full bg-white animate-flash" />
          LIVE
        </div>
        <div className="overflow-hidden flex-1 bg-bdt-panel">
          {error ? (
            <div className="px-6 py-2 text-bdt-red font-mono text-sm">
              Ticker offline · retrying…
            </div>
          ) : events.length === 0 ? (
            <div className="px-6 py-2 text-bdt-muted font-mono text-sm">
              Awaiting first sync. Add a golfer in the Admin CMS to start the feed.
            </div>
          ) : (
            <div className="ticker-track animate-marquee py-2 text-sm md:text-base font-mono">
              {items.map((e, idx) => (
                <span key={`${e.id}-${idx}`} className="inline-flex items-center gap-3">
                  <span className="text-bdt-muted">[{labelForType(e.type)}]</span>
                  <span className={colorForType(e.type)}>{e.headline}</span>
                  <span className="text-bdt-border">|</span>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
