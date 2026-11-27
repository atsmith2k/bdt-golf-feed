import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  getPushPublicKey,
  pushSubscriptionSchema,
  removePushSubscription,
  savePushSubscription,
} from '@/lib/services/push';
import { errorResponse, invalidResponse } from '@/lib/api/respond';

export const dynamic = 'force-dynamic';

/** Register this device for push. Open to everyone: what is pushed is public. */
export async function POST(req: Request) {
  try {
    if (!getPushPublicKey()) {
      return NextResponse.json({ error: 'Push is not set up on this server.' }, { status: 503 });
    }
    const parsed = pushSubscriptionSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return invalidResponse(parsed.error);
    await savePushSubscription(parsed.data);
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}

const removeSchema = z.object({ endpoint: z.url().max(1000) });

/** Stop pushing to this device. */
export async function DELETE(req: Request) {
  try {
    const parsed = removeSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return invalidResponse(parsed.error);
    await removePushSubscription(parsed.data.endpoint);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
