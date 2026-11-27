import { NextResponse } from 'next/server';
import { createAdminSignInLink, requireManager, siteOrigin } from '@/lib/services/session';
import { errorResponse } from '@/lib/api/respond';

export const dynamic = 'force-dynamic';

/**
 * A one-time sign-in link for the admin to send to the golfer themselves
 * (text, group chat). Works once, for a day.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireManager();
    const url = await createAdminSignInLink(siteOrigin(req), (await params).id);
    return NextResponse.json({ url });
  } catch (err) {
    return errorResponse(err);
  }
}
