import { NextResponse } from 'next/server';
import { SESSION_COOKIE, endSession, getViewer, toViewerDTO } from '@/lib/services/session';
import { errorResponse } from '@/lib/api/respond';

export const dynamic = 'force-dynamic';

/** Who is signed in on this device and what they may do. */
export async function GET() {
  try {
    return NextResponse.json({ viewer: toViewerDTO(await getViewer()) });
  } catch (err) {
    return errorResponse(err);
  }
}

/** Sign out. */
export async function DELETE() {
  try {
    await endSession();
  } catch (err) {
    return errorResponse(err);
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set({ name: SESSION_COOKIE, value: '', path: '/', maxAge: 0 });
  return res;
}
