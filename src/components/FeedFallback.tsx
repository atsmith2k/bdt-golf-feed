'use client';

import type { ReactNode } from 'react';
import { SWRConfig } from 'swr';
import type { FeedEventDTO } from '@/types/golf';
import { FEED_KEY } from '@/lib/feedKey';

/**
 * Hands the feed the server already loaded to every useFeed() below it, so
 * the first paint has the stories and the ticker instead of a loading state.
 * `events` is null when the server could not load them; the components then
 * fetch for themselves and show their usual loading and error states.
 */
export function FeedFallback({
  events,
  children,
}: {
  events: FeedEventDTO[] | null;
  children: ReactNode;
}) {
  if (!events) return <>{children}</>;
  return (
    <SWRConfig value={{ fallback: { [FEED_KEY]: { events, count: events.length } } }}>
      {children}
    </SWRConfig>
  );
}
