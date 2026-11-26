import { NextResponse } from 'next/server';
import { getFeedEvents } from '@/lib/services/feed';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const limit = Math.min(
    Math.max(parseInt(searchParams.get('limit') ?? '50', 10) || 50, 1),
    200,
  );

  try {
    const dto = await getFeedEvents(limit);

    return NextResponse.json(
      { events: dto, count: dto.length },
      {
        headers: {
          'Cache-Control': 'no-store, max-age=0, must-revalidate',
        },
      },
    );
  } catch (err) {
    console.error('[api/feed] query failed:', err instanceof Error ? err.message : err);
    return NextResponse.json(
      {
        error: 'Failed to load feed',
        message: err instanceof Error ? err.message : 'Unknown error',
        events: [],
        count: 0,
      },
      { status: 500 },
    );
  }
}
