import { NextResponse } from 'next/server';
import { syncGolfer } from '@/lib/services/syncEngine';
import { isAppError } from '@/lib/utils/error';

export const dynamic = 'force-dynamic';

interface Ctx {
  params: { ghin: string };
}

export async function POST(_req: Request, { params }: Ctx) {
  try {
    const result = await syncGolfer(params.ghin);
    return NextResponse.json({ result });
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
