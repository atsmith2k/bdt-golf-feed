import { BroadcastHeader } from '@/components/BroadcastHeader';
import { LiveFeed } from '@/components/LiveFeed';
import { Leaderboard } from '@/components/Leaderboard';
import { Ticker } from '@/components/Ticker';

export const dynamic = 'force-dynamic';

export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col">
      <BroadcastHeader />

      <main className="relative z-10 flex-1 px-4 md:px-8 py-6 grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6 pb-20">
        <LiveFeed />
        <Leaderboard />
      </main>

      <div className="sticky bottom-0 z-20">
        <Ticker />
      </div>
    </div>
  );
}
