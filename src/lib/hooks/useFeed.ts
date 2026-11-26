'use client';

import { useSyncExternalStore } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import type { FeedEventDTO } from '@/types/golf';
import { FEED_KEY } from '@/lib/feedKey';

export interface FeedResponse {
  events: FeedEventDTO[];
  count?: number;
  error?: string;
  message?: string;
}

const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;

async function fetchFeed(url: string): Promise<FeedResponse> {
  const res = await fetch(url);
  const json = (await res.json().catch(() => ({}))) as FeedResponse;
  if (!res.ok) {
    throw new Error(json.message ?? json.error ?? `Feed request failed (${res.status})`);
  }
  return json;
}

// One request serves every consumer on the page: the live feed shows all of
// it and the ticker the newest part. SWR shares the result by key, so mounting
// both costs a single fetch.
//
// On the home page the server has already rendered the feed and handed the
// same data down through <FeedFallback>, so a fresh page load fetches nothing.
// A later in-app navigation finds an older copy in SWR's cache and refreshes
// it, as before.
export function useFeed() {
  const { cache } = useSWRConfig();
  const hasCachedCopy = cache.get(FEED_KEY)?.data !== undefined;

  return useSWR<FeedResponse>(FEED_KEY, fetchFeed, {
    refreshInterval: FOUR_HOURS_MS,
    revalidateOnFocus: false,
    keepPreviousData: true,
    // With no data at all SWR always fetches. With only the server's copy
    // (seconds old) it does not; with a cached copy (any age) it does.
    revalidateIfStale: false,
    revalidateOnMount: hasCachedCopy ? true : undefined,
  });
}

// False during the server render and hydration, true afterwards. For output
// that depends on the visitor's clock or locale.
const subscribe = () => () => {};
export function useHydrated(): boolean {
  return useSyncExternalStore(subscribe, () => true, () => false);
}
