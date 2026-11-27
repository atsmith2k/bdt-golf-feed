import { NextResponse } from 'next/server';
import { deleteMatch, updateMatch, updateMatchSchema } from '@/lib/services/cup';
import { requireReporter, siteOrigin } from '@/lib/services/session';
import { notifyCupResult } from '@/lib/services/cupNotify';
import { errorResponse, invalidResponse } from '@/lib/api/respond';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/** Change a match: report or correct its result, or edit its details. */
export async function PATCH(req: Request, { params }: Ctx) {
  try {
    const viewer = await requireReporter();
    const parsed = updateMatchSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return invalidResponse(parsed.error);
    const id = (await params).id;
    const { becameFinal } = await updateMatch(id, parsed.data, viewer.golfer?.id ?? null);
    // A first result is news; a correction to one is not.
    if (becameFinal) void notifyCupResult(siteOrigin(req), id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  try {
    await requireReporter();
    await deleteMatch((await params).id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
