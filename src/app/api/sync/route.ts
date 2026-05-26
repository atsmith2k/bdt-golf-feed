import { NextResponse } from 'next/server';
import { syncAllGolfers } from '@/lib/services/syncEngine';
import { isAppError } from '@/lib/utils/error';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST() {
  try {
    const results = await syncAllGolfers(3);
    return NextResponse.json({ results });
  } catch (err) {
    if (isAppError(err)) {
      return NextResponse.json({ error: err.message }, { status: err.status ?? 500 });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
