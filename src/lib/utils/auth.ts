import { cookies } from 'next/headers';
import { cleanEnv } from '@/lib/env';

export const ADMIN_COOKIE = 'sgg_admin';

export function getAdminToken(): string | null {
  const token = cleanEnv(process.env.ADMIN_TOKEN);
  return token && token.length > 0 ? token : null;
}

/**
 * Server-side: verify the admin cookie matches the configured token.
 * Used by route handlers (middleware also gates the /admin route shell).
 */
export async function isAdminAuthenticated(): Promise<boolean> {
  const expected = getAdminToken();
  if (!expected) return false;
  const value = (await cookies()).get(ADMIN_COOKIE)?.value;
  return value === expected;
}
