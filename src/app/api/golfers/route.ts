import { NextResponse } from 'next/server';
import { z } from 'zod';
import { asc } from 'drizzle-orm';
import { db, golfers } from '@/lib/db';
import { addGolferByGhin } from '@/lib/services/syncEngine';
import { isAppError } from '@/lib/utils/error';

export const dynamic = 'force-dynamic';

const createSchema = z.object({
  ghinNumber: z.string().trim().min(3, 'GHIN number is too short').max(20),
});

export async function GET() {
  const rows = await db
    .select({
      id: golfers.id,
      ghinNumber: golfers.ghinNumber,
      fullName: golfers.fullName,
      handicapIndex: golfers.handicapIndex,
      club: golfers.club,
      lastSyncedAt: golfers.lastSyncedAt,
    })
    .from(golfers)
    .orderBy(asc(golfers.fullName));
  return NextResponse.json({
    golfers: rows.map((g) => ({
      ...g,
      lastSyncedAt: g.lastSyncedAt.toISOString(),
    })),
  });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid payload', issues: parsed.error.issues },
      { status: 400 },
    );
  }
  try {
    const result = await addGolferByGhin(parsed.data.ghinNumber);
    return NextResponse.json({ result }, { status: 201 });
  } catch (err) {
    if (isAppError(err)) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: err.status ?? 500 },
      );
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
