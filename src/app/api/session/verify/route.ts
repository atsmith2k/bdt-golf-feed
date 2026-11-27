import { NextResponse } from 'next/server';
import { z } from 'zod';
import { SESSION_COOKIE, verifySignIn } from '@/lib/services/session';
import { errorResponse, invalidResponse } from '@/lib/api/respond';

export const dynamic = 'force-dynamic';

const schema = z.object({ token: z.string().min(10).max(200) });

/**
 * Step two of sign-in: trade the emailed token for a session cookie. A POST
 * from the /signin/verify page rather than a GET, so mail scanners that open
 * links cannot use the token up.
 */
export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return invalidResponse(parsed.error);
  try {
    const result = await verifySignIn(parsed.data.token);
    if (result.status === 'invalid') {
      return NextResponse.json(
        { status: 'invalid', error: 'This sign-in link has expired or was already used.' },
        { status: 400 },
      );
    }
    if (result.status === 'pending') {
      return NextResponse.json({ status: 'pending', name: result.name });
    }
    const res = NextResponse.json({ status: 'ok', name: result.name });
    res.cookies.set({
      name: SESSION_COOKIE,
      value: result.sessionToken,
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: result.maxAgeSeconds,
    });
    return res;
  } catch (err) {
    return errorResponse(err);
  }
}
