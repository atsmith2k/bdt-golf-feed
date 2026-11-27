import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requestSignIn, siteOrigin } from '@/lib/services/session';
import { errorResponse, invalidResponse } from '@/lib/api/respond';

export const dynamic = 'force-dynamic';

const schema = z.object({
  email: z.email('Enter a valid email address').max(254),
  ghinNumber: z.string().trim().max(20).nullable().optional(),
});

/**
 * Step one of sign-in. Answers with a status the form acts on:
 *   sent         a link is on its way
 *   need_ghin    unknown email: ask for the GHIN number and call again
 *   no_match     the GHIN number did not unlock anything
 *   rate_limited too many links requested for this address
 */
export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return invalidResponse(parsed.error);
  try {
    const status = await requestSignIn(siteOrigin(req), parsed.data);
    return NextResponse.json({ status }, { status: status === 'rate_limited' ? 429 : 200 });
  } catch (err) {
    return errorResponse(err);
  }
}
