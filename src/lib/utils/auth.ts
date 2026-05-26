import { cookies } from 'next/headers';

export const ADMIN_COOKIE = 'sgg_admin';

export function getAdminToken(): string | null {
  const token = process.env.ADMIN_TOKEN;
  return token && token.length > 0 ? token : null;
}

/**
 * Server-side: verify the admin cookie matches the configured token.
 * Used by route handlers (middleware also gates the /admin route shell).
 */
export function isAdminAuthenticated(): boolean {
  const expected = getAdminToken();
  if (!expected) return false;
  const value = cookies().get(ADMIN_COOKIE)?.value;
  return value === expected;
}
