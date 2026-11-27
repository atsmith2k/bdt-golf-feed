import { NextResponse } from 'next/server';
import { getCupState } from '@/lib/services/cup';
import { errorResponse } from '@/lib/api/respond';

export const dynamic = 'force-dynamic';

/** The public Ryder Cup state: season, teams, standings and matches. */
export async function GET() {
  try {
    return NextResponse.json(await getCupState(), {
      headers: { 'Cache-Control': 'no-store, max-age=0, must-revalidate' },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
