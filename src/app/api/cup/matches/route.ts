import { NextResponse } from 'next/server';
import { createMatch, createMatchSchema } from '@/lib/services/cup';
import { requireReporter, siteOrigin } from '@/lib/services/session';
import { notifyCupResult } from '@/lib/services/cupNotify';
import { errorResponse, invalidResponse } from '@/lib/api/respond';

export const dynamic = 'force-dynamic';

/** Add a match: scheduled, or already played when `result` is set. */
export async function POST(req: Request) {
  try {
    const viewer = await requireReporter();
    const parsed = createMatchSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return invalidResponse(parsed.error);
    const id = await createMatch(parsed.data, viewer.golfer?.id ?? null);
    // Not awaited: the result is saved whether or not anyone can be told.
    if (parsed.data.result !== null) void notifyCupResult(siteOrigin(req), id);
    return NextResponse.json({ id }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
