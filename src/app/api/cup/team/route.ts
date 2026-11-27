import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  changeOwnRoster,
  getAvailableGolfers,
  teamIdentitySchema,
  updateTeamIdentity,
} from '@/lib/services/cup';
import { getViewer } from '@/lib/services/session';
import { errorResponse, invalidResponse } from '@/lib/api/respond';
import { createUnauthorizedError } from '@/lib/utils/error';

export const dynamic = 'force-dynamic';

/**
 * The team the caller may run: the one they captain. An admin may name either
 * team with ?teamId=.
 */
async function ownTeamId(req: Request): Promise<string> {
  const viewer = await getViewer();
  const requested = new URL(req.url).searchParams.get('teamId');
  if (viewer.canManage && requested) return requested;
  if (viewer.captainOfTeamId) return viewer.captainOfTeamId;
  throw createUnauthorizedError('Only a captain of the team can do that.');
}

/** Golfers a captain can still add: those on neither team. */
export async function GET(req: Request) {
  try {
    await ownTeamId(req);
    return NextResponse.json({ available: await getAvailableGolfers() });
  } catch (err) {
    return errorResponse(err);
  }
}

/** Name the team or change its colour. */
export async function PATCH(req: Request) {
  try {
    const teamId = await ownTeamId(req);
    const parsed = teamIdentitySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return invalidResponse(parsed.error);
    await updateTeamIdentity(teamId, parsed.data);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}

const rosterSchema = z.object({
  golferId: z.string().min(1),
  action: z.enum(['add', 'remove']),
});

/** Add an unclaimed golfer to the team, or drop one of its players. */
export async function PUT(req: Request) {
  try {
    const teamId = await ownTeamId(req);
    const parsed = rosterSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return invalidResponse(parsed.error);
    await changeOwnRoster(teamId, parsed.data.golferId, parsed.data.action);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
