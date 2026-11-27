import { NextResponse } from 'next/server';
import { getCupAdminGolfers } from '@/lib/services/cup';
import { requireManager } from '@/lib/services/session';
import { isEmailConfigured } from '@/lib/services/mailer';
import { errorResponse } from '@/lib/api/respond';

export const dynamic = 'force-dynamic';

/** Every golfer with their email, role and team, for the control room. */
export async function GET() {
  try {
    await requireManager();
    return NextResponse.json({
      golfers: await getCupAdminGolfers(),
      emailConfigured: isEmailConfigured(),
    });
  } catch (err) {
    return errorResponse(err);
  }
}
