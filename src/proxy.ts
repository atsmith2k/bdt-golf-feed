import { NextResponse, type NextRequest } from 'next/server';
import { ADMIN_COOKIE } from '@/lib/utils/auth';
import { cleanEnv } from '@/lib/env';

const PROTECTED_PREFIXES = ['/admin'];
const ADMIN_API_PREFIXES = [
  '/api/sync',
  '/api/golfers',
  '/api/announcements',
  '/api/ghin/auth',
  '/api/backfill',
  '/api/diag',
];
const PUBLIC_ADMIN_PATHS = ['/admin/login'];
// Signed in by cookie but open to golfers, not just the admin token: the route
// handlers check who is asking; here they only get the cross-site check.
const SESSION_API_PREFIXES = ['/api/cup', '/api/session'];

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function isSameHost(origin: string, req: NextRequest): boolean {
  let originHost: string;
  try {
    originHost = new URL(origin).host.toLowerCase();
  } catch {
    return false;
  }
  const forwarded = req.headers.get('x-forwarded-host')?.split(',')[0]?.trim();
  const hosts = [forwarded, req.headers.get('host'), req.nextUrl.host]
    .filter((h): h is string => Boolean(h))
    .map((h) => h.toLowerCase());
  return hosts.includes(originHost);
}

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const expected = cleanEnv(process.env.ADMIN_TOKEN);
  const cookie = req.cookies.get(ADMIN_COOKIE)?.value;

  const isProtectedPage = PROTECTED_PREFIXES.some((p) => pathname.startsWith(p));
  const isPublicAdmin = PUBLIC_ADMIN_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + '/'),
  );
  const isAdminApi = ADMIN_API_PREFIXES.some((p) => pathname.startsWith(p));

  if (isProtectedPage && !isPublicAdmin) {
    if (!expected || cookie !== expected) {
      const url = req.nextUrl.clone();
      url.pathname = '/admin/login';
      url.searchParams.set('next', pathname);
      return NextResponse.redirect(url);
    }
  }

  const isSessionApi = SESSION_API_PREFIXES.some((p) => pathname.startsWith(p));

  if (isAdminApi && (!expected || cookie !== expected)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (isAdminApi || isSessionApi) {

    // CSRF mitigation for cookie-authenticated mutating endpoints. Cookies
    // are sent on cross-origin requests by default; rejecting any mutating
    // request whose Origin header doesn't match the deployed host blocks
    // CSRF attacks without requiring a token round-trip.
    //
    // Compare hosts, not full origins: behind a TLS-terminating reverse proxy
    // the server sees plain http on a local port, so its own idea of its
    // origin never equals the browser's https one. The Host the browser asked
    // for is forwarded by the proxy and cannot be set by a cross-site page.
    if (MUTATING_METHODS.has(req.method)) {
      const origin = req.headers.get('origin');
      if (origin && !isSameHost(origin, req)) {
        return NextResponse.json({ error: 'Bad origin' }, { status: 403 });
      }
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/admin/:path*',
    '/api/sync/:path*',
    '/api/golfers/:path*',
    '/api/announcements/:path*',
    '/api/ghin/:path*',
    '/api/backfill/:path*',
    '/api/diag/:path*',
    '/api/cup/:path*',
    '/api/session/:path*',
  ],
};
