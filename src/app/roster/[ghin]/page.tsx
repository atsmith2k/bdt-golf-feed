import { notFound } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { BroadcastHeader } from '@/components/BroadcastHeader';
import { NavTabs } from '@/components/NavTabs';
import { Ticker } from '@/components/Ticker';
import { GolferProfile } from '@/components/GolferProfile';
import { db, golfers } from '@/lib/db';

export const dynamic = 'force-dynamic';

interface Props {
  params: { ghin: string };
}

export async function generateMetadata({ params }: Props) {
  const ghin = decodeURIComponent(params.ghin ?? '').trim();
  if (!ghin) return { title: 'Player' };
  const [g] = await db
    .select({ fullName: golfers.fullName, handicapIndex: golfers.handicapIndex })
    .from(golfers)
    .where(eq(golfers.ghinNumber, ghin))
    .limit(1);
  if (!g) return { title: 'Player' };
  return {
    title: `${g.fullName} · Index ${g.handicapIndex}`,
    description: `BDT Golf Network player profile for ${g.fullName}. Handicap index ${g.handicapIndex}, recent rounds, scoring trends, and career stats sourced from GHIN.`,
  };
}

export default async function GolferProfilePage({ params }: Props) {
  const ghin = decodeURIComponent(params.ghin ?? '').trim();
  if (!ghin) notFound();

  // Pre-flight existence check so we 404 server-side rather than render an
  // empty shell while the client fetch resolves to "not found".
  const [exists] = await db
    .select({ id: golfers.id })
    .from(golfers)
    .where(eq(golfers.ghinNumber, ghin))
    .limit(1);
  if (!exists) notFound();

  return (
    <div className="min-h-screen flex flex-col">
      <BroadcastHeader />
      <NavTabs />

      <main className="relative z-10 flex-1 px-4 md:px-8 py-6 pb-20">
        <GolferProfile ghinNumber={ghin} />
      </main>

      <div className="sticky bottom-0 z-20">
        <Ticker />
      </div>
    </div>
  );
}
