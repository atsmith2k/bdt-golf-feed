import { BroadcastHeader } from '@/components/BroadcastHeader';
import { NavTabs } from '@/components/NavTabs';
import { Leaderboard } from '@/components/Leaderboard';
import { Ticker } from '@/components/Ticker';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Roster',
  description: 'Full BDT Tour roster with handicap index and recent trend.',
};

export default function RosterPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <BroadcastHeader />
      <NavTabs />

      <main className="relative z-10 flex-1 px-4 md:px-8 py-6 pb-20">
        <Leaderboard />
      </main>

      <div className="sticky bottom-0 z-20">
        <Ticker />
      </div>
    </div>
  );
}
