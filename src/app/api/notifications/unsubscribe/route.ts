import { NextResponse } from 'next/server';
import { z } from 'zod';
import { unsubscribeByToken } from '@/lib/services/cupNotify';
import { errorResponse, invalidResponse } from '@/lib/api/respond';

export const dynamic = 'force-dynamic';

const schema = z.object({ token: z.string().min(10).max(100) });

/** The unsubscribe link in an email: turns that golfer's emails off, no sign-in. */
export async function POST(req: Request) {
  try {
    const parsed = schema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return invalidResponse(parsed.error);
    const ok = await unsubscribeByToken(parsed.data.token);
    return ok
      ? NextResponse.json({ ok: true })
      : NextResponse.json({ error: 'This unsubscribe link is not valid.' }, { status: 404 });
  } catch (err) {
    return errorResponse(err);
  }
}
