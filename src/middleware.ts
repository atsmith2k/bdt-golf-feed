import { NextResponse, type NextRequest } from 'next/server';
import { ADMIN_COOKIE } from '@/lib/utils/auth';

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

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const expected = process.env.ADMIN_TOKEN;
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

  if (isAdminApi) {
    if (!expected || cookie !== expected) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // CSRF mitigation for cookie-authenticated mutating endpoints. Cookies
    // are sent on cross-origin requests by default; rejecting any mutating
    // request whose Origin header doesn't match the deployed host blocks
    // CSRF attacks without requiring a token round-trip.
    if (MUTATING_METHODS.has(req.method)) {
      const origin = req.headers.get('origin');
      const expectedOrigin = req.nextUrl.origin;
      if (origin && origin !== expectedOrigin) {
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
  ],
};
