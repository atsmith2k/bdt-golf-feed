// Shared JSON error responses for route handlers.

import { NextResponse } from 'next/server';
import type { ZodError } from 'zod';
import { isAppError } from '@/lib/utils/error';

export function errorResponse(err: unknown): NextResponse {
  if (isAppError(err)) {
    return NextResponse.json({ error: err.message, code: err.code }, { status: err.status ?? 500 });
  }
  console.error('[api] unexpected error:', err);
  return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 });
}

/** A 400 whose message names the first thing wrong with the payload. */
export function invalidResponse(error: ZodError): NextResponse {
  const first = error.issues[0];
  const where = first?.path.length ? `${first.path.join('.')}: ` : '';
  return NextResponse.json(
    { error: first ? `${where}${first.message}` : 'Invalid payload', issues: error.issues },
    { status: 400 },
  );
}
