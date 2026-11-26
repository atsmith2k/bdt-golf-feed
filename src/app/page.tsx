import { BroadcastHeader } from '@/components/BroadcastHeader';
import { NavTabs } from '@/components/NavTabs';
import { LiveFeed } from '@/components/LiveFeed';
import { Ticker } from '@/components/Ticker';
import { FeedFallback } from '@/components/FeedFallback';
import { getFeedEvents } from '@/lib/services/feed';
import { FEED_PAGE_SIZE } from '@/lib/feedKey';
import type { FeedEventDTO } from '@/types/golf';

// Rendered per request so the HTML carries the current feed (one indexed
// query, a few milliseconds) and the page paints with its stories in place.
export const dynamic = 'force-dynamic';

async function loadFeed(): Promise<FeedEventDTO[] | null> {
  try {
    return await getFeedEvents(FEED_PAGE_SIZE);
  } catch (err) {
    // Still serve the page; the client fetch reports the failure and retries.
    console.error('[home] feed query failed:', err instanceof Error ? err.message : err);
    return null;
  }
}

export default async function HomePage() {
  const events = await loadFeed();

  return (
    <FeedFallback events={events}>
      <div className="min-h-screen flex flex-col">
        <BroadcastHeader />
        <NavTabs />

        <main className="relative z-10 flex-1 px-4 md:px-8 py-6 pb-20">
          <LiveFeed />
        </main>

        <div className="sticky bottom-0 z-20">
          <Ticker />
        </div>
      </div>
    </FeedFallback>
  );
}
