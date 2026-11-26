// Shared by the server render (src/app/page.tsx) and the client hook
// (src/lib/hooks/useFeed.ts), so it lives in a module with no client or
// server-only imports.

/** How many events the public pages load: the feed shows all, the ticker the newest part. */
export const FEED_PAGE_SIZE = 60;

/** The SWR cache key, which is also the URL the client fetches. */
export const FEED_KEY = `/api/feed?limit=${FEED_PAGE_SIZE}`;
