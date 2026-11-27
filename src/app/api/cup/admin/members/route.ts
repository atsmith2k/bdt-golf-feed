import { NextResponse } from 'next/server';
import { z } from 'zod';
import { setTeamMember } from '@/lib/services/cup';
import { requireManager } from '@/lib/services/session';
import { errorResponse, invalidResponse } from '@/lib/api/respond';

export const dynamic = 'force-dynamic';

const schema = z.object({
  golferId: z.string().min(1),
  teamId: z.string().min(1).nullable(),
  /** Overall pick number, when this is a draft pick. */
  draftPick: z.number().int().positive().max(500).nullable().optional(),
});

/** Put a golfer on a team, or take them off with `teamId: null`. */
export async function PUT(req: Request) {
  try {
    await requireManager();
    const parsed = schema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return invalidResponse(parsed.error);
    await setTeamMember(parsed.data.golferId, parsed.data.teamId, parsed.data.draftPick ?? null);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
