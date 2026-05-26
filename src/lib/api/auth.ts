// src/lib/api/auth.ts
//
// GHIN authentication token manager.
//
// Lifecycle:
//   - bootstrapGhinAuth() is called once at server startup to acquire a token
//     using the GHIN_USERNAME / GHIN_PASSWORD env vars. The result is logged
//     so misconfiguration shows up immediately in the server output instead
//     of failing later inside an unrelated request.
//   - getGhinAuthTokenOrThrow() returns the cached token. If the cache is
//     empty or expired, it throws AUTH_EXPIRED so the caller can surface a
//     "Refresh GHIN Token" prompt to the admin. We deliberately do NOT
//     auto-refresh on a per-request basis — refresh is admin-triggered.
//   - refreshGhinAuthToken() is the only path that performs a new login.
//     It is invoked by the admin endpoint at POST /api/ghin/auth.

import { createGhinApiError } from '@/lib/utils/error';

const GHIN_LOGIN_URL = 'https://api2.ghin.com/api/v1/golfer_login.json';

// Refresh slightly before the server says the token expires so a request
// in-flight near the boundary doesn't race with expiry.
const EXPIRY_SAFETY_MS = 60_000;
// Fallback when the server doesn't return token_expires.
const DEFAULT_TTL_MS = 60 * 60 * 1000;

interface CachedToken {
  token: string;
  expiresAt: number; // epoch ms
  acquiredAt: number; // epoch ms
}

// Stash the cache on globalThis so dev-mode HMR / multi-bundle compilation
// (instrumentation.ts vs route handlers vs middleware) share the same token
// state. Module-level variables get duplicated across webpack module graphs
// in Next.js dev; `globalThis` is the only cross-bundle shared address space.
declare global {
  // eslint-disable-next-line no-var
  var __ghinAuth:
    | {
        cached: CachedToken | null;
        inFlight: Promise<CachedToken> | null;
        bootstrapped: boolean;
      }
    | undefined;
}

const state = (globalThis.__ghinAuth ??= {
  cached: null,
  inFlight: null,
  bootstrapped: false,
});

interface GhinLoginResponse {
  // Most current responses nest under `golfer_user`. Some legacy responses
  // place the token at the top level; accept either shape.
  golfer_user?: {
    golfer_user_token?: string;
    token_expires?: string;
  };
  golfer_user_token?: string;
  token_expires?: string;
}

export class GhinAuthError extends Error {
  code: 'AUTH_EXPIRED' | 'AUTH_MISSING' | 'AUTH_FAILED';
  constructor(code: GhinAuthError['code'], message: string) {
    super(message);
    this.name = 'GhinAuthError';
    this.code = code;
  }
}

export interface GhinAuthStatus {
  hasToken: boolean;
  acquiredAt: string | null;
  expiresAt: string | null;
  expiresInSeconds: number | null;
  isExpired: boolean;
  username: string | null;
}

/**
 * Snapshot the current cache without mutating or extending it.
 */
export function getGhinAuthStatus(): GhinAuthStatus {
  const username = process.env.GHIN_USERNAME ?? null;
  const cached = state.cached;
  if (!cached) {
    return {
      hasToken: false,
      acquiredAt: null,
      expiresAt: null,
      expiresInSeconds: null,
      isExpired: true,
      username,
    };
  }
  const now = Date.now();
  const isExpired = cached.expiresAt - EXPIRY_SAFETY_MS <= now;
  return {
    hasToken: true,
    acquiredAt: new Date(cached.acquiredAt).toISOString(),
    expiresAt: new Date(cached.expiresAt).toISOString(),
    expiresInSeconds: Math.max(0, Math.round((cached.expiresAt - now) / 1000)),
    isExpired,
    username,
  };
}

/**
 * Return the cached token, or throw if the cache is missing/expired.
 * The ApiClient calls this on every request; an expiry surfaces as a
 * recognizable error the admin UI can act on (manual refresh).
 */
export async function getGhinAuthTokenOrThrow(): Promise<string> {
  const cached = state.cached;
  if (cached && cached.expiresAt - EXPIRY_SAFETY_MS > Date.now()) {
    return cached.token;
  }
  if (cached) {
    throw new GhinAuthError(
      'AUTH_EXPIRED',
      'GHIN token has expired. Refresh it from the Admin CMS.',
    );
  }
  throw new GhinAuthError(
    'AUTH_MISSING',
    'No GHIN token has been acquired yet. Refresh it from the Admin CMS.',
  );
}

/**
 * Perform a fresh login and replace the cache. This is the ONLY function
 * that talks to the login endpoint; it's invoked by:
 *   - bootstrapGhinAuth() at server startup
 *   - the admin "Refresh GHIN Token" action
 *
 * Single-flight: concurrent callers share one in-flight promise.
 */
export async function refreshGhinAuthToken(): Promise<GhinAuthStatus> {
  if (state.inFlight) {
    await state.inFlight;
    return getGhinAuthStatus();
  }
  state.inFlight = login()
    .then((value) => {
      state.cached = value;
      return value;
    })
    .finally(() => {
      state.inFlight = null;
    });
  await state.inFlight;
  return getGhinAuthStatus();
}

/**
 * Run a one-time login at server boot. Logs success/failure but does not
 * throw, so a misconfigured GHIN credential pair doesn't crash the process.
 * Subsequent requests that need the token will surface AUTH_MISSING.
 */
export async function bootstrapGhinAuth(): Promise<void> {
  if (state.bootstrapped) return;
  state.bootstrapped = true;
  const username = process.env.GHIN_USERNAME;
  const password = process.env.GHIN_PASSWORD;
  if (!username || !password) {
    // eslint-disable-next-line no-console
    console.warn(
      '[ghin-auth] GHIN_USERNAME / GHIN_PASSWORD not set. Configure them and refresh from /admin to enable live data.',
    );
    return;
  }
  try {
    const status = await refreshGhinAuthToken();
    // eslint-disable-next-line no-console
    console.log(
      `[ghin-auth] Bootstrap successful. Token acquired for ${status.username}; expires at ${status.expiresAt}.`,
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[ghin-auth] Bootstrap failed:', err instanceof Error ? err.message : err);
  }
}

async function login(): Promise<CachedToken> {
  const username = process.env.GHIN_USERNAME;
  const password = process.env.GHIN_PASSWORD;

  if (!username || !password) {
    throw new GhinAuthError(
      'AUTH_MISSING',
      'GHIN credentials missing. Set GHIN_USERNAME and GHIN_PASSWORD in your environment.',
    );
  }

  const res = await fetch(GHIN_LOGIN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'User-Agent': 'BDTGolfNetwork/1.0',
    },
    body: JSON.stringify({
      user: {
        email_or_ghin: username,
        password,
        remember_me: true,
      },
      token: 'nonblank',
    }),
    cache: 'no-store',
  });

  if (!res.ok) {
    const detail = await safeReadError(res);
    if (res.status === 400 && detail?.errors?.digital_profile?.[0]) {
      const e = detail.errors.digital_profile[0];
      throw new GhinAuthError(
        'AUTH_FAILED',
        `GHIN authentication failed: ${e.top_line ?? 'invalid credentials'}${
          e.body_line1 ? ` — ${e.body_line1}` : ''
        }`,
      );
    }
    throw new GhinAuthError(
      'AUTH_FAILED',
      `GHIN authentication failed (${res.status} ${res.statusText}).`,
    );
  }

  const data = (await res.json()) as GhinLoginResponse;
  const token = data.golfer_user?.golfer_user_token ?? data.golfer_user_token;
  if (!token) {
    throw new GhinAuthError('AUTH_FAILED', 'GHIN login response did not contain a token.');
  }

  const expiresIso = data.golfer_user?.token_expires ?? data.token_expires;
  const parsed = expiresIso ? Date.parse(expiresIso) : NaN;
  const expiresAt = Number.isFinite(parsed) ? parsed : Date.now() + DEFAULT_TTL_MS;

  return { token, expiresAt, acquiredAt: Date.now() };
}

async function safeReadError(res: Response): Promise<any> {
  try {
    const ct = res.headers.get('content-type') ?? '';
    if (ct.includes('application/json')) return await res.json();
    return { message: await res.text() };
  } catch {
    return null;
  }
}

/**
 * Helper for surfacing the GHIN error in HTTP responses with a useful status.
 */
export function ghinAuthErrorToHttp(err: unknown): { status: number; message: string; code: string } | null {
  if (err instanceof GhinAuthError) {
    const status = err.code === 'AUTH_FAILED' ? 502 : 503;
    return { status, message: err.message, code: err.code };
  }
  return null;
}

// Used by the API client to clear the cache after a 401 from GHIN.
// (We do not auto-refresh; we just mark the token unusable so the next
// request reports AUTH_EXPIRED instead of retrying with a stale token.)
export function invalidateGhinTokenCache(): void {
  state.cached = null;
}
