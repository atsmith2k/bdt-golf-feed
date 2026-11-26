import { BroadcastHeader } from '@/components/BroadcastHeader';
import { NavTabs } from '@/components/NavTabs';
import { LiveFeed } from '@/components/LiveFeed';
import { Ticker } from '@/components/Ticker';

export default function HomePage() {
  return (
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
  );
}
