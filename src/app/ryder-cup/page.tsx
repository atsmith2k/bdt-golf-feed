import { BroadcastHeader } from '@/components/BroadcastHeader';
import { NavTabs } from '@/components/NavTabs';
import { Ticker } from '@/components/Ticker';
import { CupBoard } from '@/components/cup/CupBoard';
import { getCupState } from '@/lib/services/cup';
import { getViewer, toViewerDTO } from '@/lib/services/session';
import type { CupStateDTO, ViewerDTO } from '@/types/cup';

export const metadata = {
  title: 'Ryder Cup',
  description: 'BDT Ryder Cup: the score, the schedule, results and team records.',
};

// Rendered per request so the page arrives with the current score in it.
export const dynamic = 'force-dynamic';

const SIGNED_OUT: ViewerDTO = { signedIn: false, name: null, canReport: false, canManage: false, captainOfTeamId: null };

async function load(): Promise<{ state: CupStateDTO | null; viewer: ViewerDTO }> {
  try {
    const [state, viewer] = await Promise.all([getCupState(), getViewer()]);
    return { state, viewer: toViewerDTO(viewer) };
  } catch (err) {
    // Still serve the page; the client fetch reports the failure and retries.
    console.error('[ryder-cup] load failed:', err instanceof Error ? err.message : err);
    return { state: null, viewer: SIGNED_OUT };
  }
}

export default async function RyderCupPage() {
  const { state, viewer } = await load();

  return (
    <div className="min-h-screen flex flex-col">
      <BroadcastHeader />
      <NavTabs />

      <main className="relative z-10 flex-1 px-4 md:px-8 py-6 pb-20 w-full max-w-5xl mx-auto">
        <CupBoard initialState={state} initialViewer={viewer} />
      </main>

      <div className="sticky bottom-0 z-20">
        <Ticker />
      </div>
    </div>
  );
}
