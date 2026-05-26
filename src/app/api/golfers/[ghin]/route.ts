import { NextResponse } from 'next/server';
import { desc, eq } from 'drizzle-orm';
import { db, golfers, scores, handicapRevisions } from '@/lib/db';
import { removeGolfer } from '@/lib/services/syncEngine';
import { isAppError } from '@/lib/utils/error';

export const dynamic = 'force-dynamic';

interface Ctx {
  params: { ghin: string };
}

export async function GET(_req: Request, { params }: Ctx) {
  const [golfer] = await db
    .select()
    .from(golfers)
    .where(eq(golfers.ghinNumber, params.ghin))
    .limit(1);
  if (!golfer) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const [recentScores, recentRevisions] = await Promise.all([
    db
      .select()
      .from(scores)
      .where(eq(scores.golferId, golfer.id))
      .orderBy(desc(scores.datePlayed))
      .limit(25),
    db
      .select()
      .from(handicapRevisions)
      .where(eq(handicapRevisions.golferId, golfer.id))
      .orderBy(desc(handicapRevisions.revisionDate))
      .limit(12),
  ]);

  return NextResponse.json({
    golfer: { ...golfer, scores: recentScores, revisions: recentRevisions },
  });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  try {
    await removeGolfer(params.ghin);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (isAppError(err)) {
      return NextResponse.json({ error: err.message }, { status: err.status ?? 500 });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
