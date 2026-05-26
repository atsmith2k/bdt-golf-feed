import { NextResponse } from 'next/server';
import { ADMIN_COOKIE, getAdminToken } from '@/lib/utils/auth';

export async function POST(req: Request) {
  const expected = getAdminToken();
  if (!expected) {
    return NextResponse.json(
      { error: 'ADMIN_TOKEN is not configured on the server.' },
      { status: 500 },
    );
  }
  const body = (await req.json().catch(() => ({}))) as { token?: string };
  if (!body.token || body.token !== expected) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set({
    name: ADMIN_COOKIE,
    value: expected,
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set({ name: ADMIN_COOKIE, value: '', path: '/', maxAge: 0 });
  return res;
}
