import { NextResponse } from 'next/server';
import { previewRecap, sendRecapNow } from '@/lib/services/cupRecap';
import { requireManager, siteOrigin } from '@/lib/services/session';
import { errorResponse } from '@/lib/api/respond';

export const dynamic = 'force-dynamic';

/** What a recap of the last seven days would say. */
export async function GET() {
  try {
    await requireManager();
    return NextResponse.json({ recap: await previewRecap() });
  } catch (err) {
    return errorResponse(err);
  }
}

/** Publish that recap now: feed story, push and the email digest. */
export async function POST(req: Request) {
  try {
    await requireManager();
    const recap = await sendRecapNow(siteOrigin(req));
    if (!recap) {
      return NextResponse.json({ error: 'Set up the season first.' }, { status: 400 });
    }
    return NextResponse.json({ recap });
  } catch (err) {
    return errorResponse(err);
  }
}
