import { NextResponse } from 'next/server';
import { getPool } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Liveness + database check for the host's deploy health check: 200 only when
 * the server can query its database and the schema exists. Reports counts
 * only, so it is safe to leave public.
 */
export async function GET() {
  try {
    const { rows } = await getPool().query<{ golfers: number; last_sync: Date | null }>(
      'select count(*)::int as golfers, max("lastSyncedAt") as last_sync from "Golfer"',
    );
    return NextResponse.json(
      { ok: true, golfers: rows[0].golfers, lastSyncedAt: rows[0].last_sync },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'database unavailable' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
