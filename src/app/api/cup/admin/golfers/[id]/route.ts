import { NextResponse } from 'next/server';
import { golferAccessSchema, setGolferAccess } from '@/lib/services/cup';
import { requireManager } from '@/lib/services/session';
import { errorResponse, invalidResponse } from '@/lib/api/respond';

export const dynamic = 'force-dynamic';

/** Set a golfer's email or role, or approve the email they claimed. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireManager();
    const parsed = golferAccessSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return invalidResponse(parsed.error);
    await setGolferAccess((await params).id, parsed.data);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
