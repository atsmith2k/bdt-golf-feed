import { NextResponse } from 'next/server';
import { saveSeasonSetup, seasonSetupSchema } from '@/lib/services/cup';
import { requireManager } from '@/lib/services/session';
import { errorResponse, invalidResponse } from '@/lib/api/respond';

export const dynamic = 'force-dynamic';

/** Create or edit the season and its two teams. */
export async function PUT(req: Request) {
  try {
    await requireManager();
    const parsed = seasonSetupSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return invalidResponse(parsed.error);
    await saveSeasonSetup(parsed.data);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
