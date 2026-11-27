import { NextResponse } from 'next/server';
import { deleteMatch, updateMatch, updateMatchSchema } from '@/lib/services/cup';
import { requireReporter } from '@/lib/services/session';
import { errorResponse, invalidResponse } from '@/lib/api/respond';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/** Change a match: report or correct its result, or edit its details. */
export async function PATCH(req: Request, { params }: Ctx) {
  try {
    const viewer = await requireReporter();
    const parsed = updateMatchSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return invalidResponse(parsed.error);
    await updateMatch((await params).id, parsed.data, viewer.golfer?.id ?? null);
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
