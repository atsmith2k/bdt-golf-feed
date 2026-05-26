import { NextResponse } from 'next/server';
import { z } from 'zod';
import { postAdminAnnouncement } from '@/lib/services/syncEngine';

export const dynamic = 'force-dynamic';

const schema = z.object({
  headline: z.string().trim().min(3).max(240),
  details: z.string().trim().max(500).optional().nullable(),
  importance: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid payload', issues: parsed.error.issues },
      { status: 400 },
    );
  }
  await postAdminAnnouncement(parsed.data);
  return NextResponse.json({ ok: true }, { status: 201 });
}
