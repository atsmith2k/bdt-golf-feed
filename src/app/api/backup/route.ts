import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getPool } from '@/lib/db';
import { dumpDatabase } from '@/lib/db/backup';
import { cleanEnv } from '@/lib/env';

export const dynamic = 'force-dynamic';

function sameToken(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * A complete dump of the database, for the off-site backup job:
 * `Authorization: Bearer <BACKUP_TOKEN>`. Read-only. Without BACKUP_TOKEN the
 * route does not exist (404), so an unconfigured server never serves its data.
 */
export async function GET(req: Request) {
  const token = cleanEnv(process.env.BACKUP_TOKEN);
  if (!token) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const auth = req.headers.get('authorization') ?? '';
  if (!auth.startsWith('Bearer ') || !sameToken(auth.slice(7), token)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { json, counts } = await dumpDatabase(getPool());
    console.log('[backup] dump served:', JSON.stringify(counts));
    return new NextResponse(json, {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': 'attachment; filename="bdt-golf-feed-dump.json"',
        'Cache-Control': 'no-store',
        'X-Robots-Tag': 'noindex',
      },
    });
  } catch (err) {
    console.error('[backup] dump failed:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Backup failed' }, { status: 500 });
  }
}
