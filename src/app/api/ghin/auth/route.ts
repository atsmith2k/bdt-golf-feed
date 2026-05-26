import { NextResponse } from 'next/server';
import {
  getGhinAuthStatus,
  refreshGhinAuthToken,
  GhinAuthError,
  ghinAuthErrorToHttp,
} from '@/lib/api/auth';

export const dynamic = 'force-dynamic';

/**
 * Report current GHIN token status. Used by the Admin CMS panel.
 */
export async function GET() {
  return NextResponse.json({ status: getGhinAuthStatus() });
}

/**
 * Force a fresh login against GHIN. Admin-only (gated by middleware).
 *
 * This is the ONLY user-facing way to mint a new token — the API client
 * never auto-refreshes on a per-request basis.
 */
export async function POST() {
  try {
    const status = await refreshGhinAuthToken();
    return NextResponse.json({ status });
  } catch (err) {
    const mapped = ghinAuthErrorToHttp(err);
    if (mapped) {
      return NextResponse.json(
        { error: mapped.message, code: mapped.code, status: getGhinAuthStatus() },
        { status: mapped.status },
      );
    }
    if (err instanceof GhinAuthError) {
      return NextResponse.json(
        { error: err.message, code: err.code, status: getGhinAuthStatus() },
        { status: 502 },
      );
    }
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : 'Unknown error',
        status: getGhinAuthStatus(),
      },
      { status: 500 },
    );
  }
}
