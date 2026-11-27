import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db, golfers } from '@/lib/db';
import { getViewer } from '@/lib/services/session';
import { getPushPublicKey } from '@/lib/services/push';
import { isEmailConfigured } from '@/lib/services/mailer';
import { errorResponse, invalidResponse } from '@/lib/api/respond';
import { createUnauthorizedError, createValidationError } from '@/lib/utils/error';

export const dynamic = 'force-dynamic';

async function signedInGolfer() {
  const viewer = await getViewer();
  if (!viewer.golfer) return null;
  const [row] = await db
    .select({
      id: golfers.id,
      email: golfers.email,
      notifyResults: golfers.notifyResults,
      notifyWeekly: golfers.notifyWeekly,
    })
    .from(golfers)
    .where(eq(golfers.id, viewer.golfer.id))
    .limit(1);
  return row ?? null;
}

/** What notifications this server offers and what the signed-in golfer chose. */
export async function GET() {
  try {
    const golfer = await signedInGolfer();
    return NextResponse.json({
      // Null when push is not configured on this server.
      pushPublicKey: getPushPublicKey(),
      emailConfigured: isEmailConfigured(),
      // Null when nobody is signed in as a golfer.
      email: golfer
        ? {
            address: golfer.email,
            notifyResults: golfer.notifyResults,
            notifyWeekly: golfer.notifyWeekly,
          }
        : null,
    });
  } catch (err) {
    return errorResponse(err);
  }
}

const schema = z.object({
  notifyResults: z.boolean().optional(),
  notifyWeekly: z.boolean().optional(),
});

/** Change the signed-in golfer's email choices. */
export async function PUT(req: Request) {
  try {
    const parsed = schema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return invalidResponse(parsed.error);
    const golfer = await signedInGolfer();
    if (!golfer) throw createUnauthorizedError('Sign in to choose email notifications.');
    if (!golfer.email) throw createValidationError('Your profile has no email address yet.');
    if (Object.keys(parsed.data).length === 0) return NextResponse.json({ ok: true });
    await db.update(golfers).set(parsed.data).where(eq(golfers.id, golfer.id));
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
