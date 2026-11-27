import { NextResponse } from 'next/server';
import { createMatch, createMatchSchema } from '@/lib/services/cup';
import { requireReporter } from '@/lib/services/session';
import { errorResponse, invalidResponse } from '@/lib/api/respond';

export const dynamic = 'force-dynamic';

/** Add a match: scheduled, or already played when `result` is set. */
export async function POST(req: Request) {
  try {
    const viewer = await requireReporter();
    const parsed = createMatchSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return invalidResponse(parsed.error);
    const id = await createMatch(parsed.data, viewer.golfer?.id ?? null);
    return NextResponse.json({ id }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
