'use client';

import useSWR from 'swr';
import type { FeedEventDTO } from '@/types/golf';

export interface FeedResponse {
  events: FeedEventDTO[];
  count?: number;
  error?: string;
  message?: string;
}

// One request serves every consumer on the page: the live feed shows all of
// it and the ticker the newest part. SWR shares the result by key, so mounting
// both costs a single fetch.
const FEED_KEY = '/api/feed?limit=60';
const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;

async function fetchFeed(url: string): Promise<FeedResponse> {
  const res = await fetch(url);
  const json = (await res.json().catch(() => ({}))) as FeedResponse;
  if (!res.ok) {
    throw new Error(json.message ?? json.error ?? `Feed request failed (${res.status})`);
  }
  return json;
}

export function useFeed() {
  return useSWR<FeedResponse>(FEED_KEY, fetchFeed, {
    refreshInterval: FOUR_HOURS_MS,
    revalidateOnFocus: false,
    keepPreviousData: true,
  });
}
