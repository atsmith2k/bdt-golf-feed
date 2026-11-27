// src/lib/services/push.ts
//
// Web push to browsers and installed home-screen apps. Anyone can subscribe a
// device; nothing here is tied to a golfer because everything pushed is
// already public in the feed.
//
// Needs a VAPID key pair (see .env.example). Without one, push is off and the
// site simply does not offer it.

import { sendNotification } from 'web-push';
import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db, pushSubscriptions } from '@/lib/db';
import { cleanEnv } from '@/lib/env';
import { createValidationError } from '@/lib/utils/error';

interface Vapid {
  publicKey: string;
  privateKey: string;
  subject: string;
}

function getVapid(): Vapid | null {
  const publicKey = cleanEnv(process.env.VAPID_PUBLIC_KEY);
  const privateKey = cleanEnv(process.env.VAPID_PRIVATE_KEY);
  if (!publicKey || !privateKey) return null;
  // Push services want a contact: a mailto: or https: URL.
  const subject =
    cleanEnv(process.env.VAPID_SUBJECT) ||
    cleanEnv(process.env.NEXT_PUBLIC_SITE_URL) ||
    'mailto:admin@localhost';
  return { publicKey, privateKey, subject: /^(mailto:|https:)/.test(subject) ? subject : `https://${subject}` };
}

/** The key browsers subscribe with, or null when push is not configured. */
export function getPushPublicKey(): string | null {
  return getVapid()?.publicKey ?? null;
}

// The browser push services. Anyone can register a device, and the server
// then makes a request to the address it gave, so only these are accepted.
const PUSH_HOSTS = [
  'fcm.googleapis.com',
  'push.services.mozilla.com',
  'push.apple.com',
  'notify.windows.com',
];
// Far more devices than the league has; a ceiling on what can be registered.
const MAX_SUBSCRIPTIONS = 2000;

function isPushServiceUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      PUSH_HOSTS.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`))
    );
  } catch {
    return false;
  }
}

export const pushSubscriptionSchema = z.object({
  endpoint: z
    .string()
    .max(1000)
    .refine(isPushServiceUrl, 'The push service of this browser is not supported.'),
  keys: z.object({
    p256dh: z.string().min(1).max(300),
    auth: z.string().min(1).max(100),
  }),
});
export type PushSubscriptionInput = z.infer<typeof pushSubscriptionSchema>;

export async function savePushSubscription(input: PushSubscriptionInput): Promise<void> {
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(pushSubscriptions);
  if (n >= MAX_SUBSCRIPTIONS) {
    const [known] = await db
      .select({ id: pushSubscriptions.id })
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.endpoint, input.endpoint))
      .limit(1);
    if (!known) throw createValidationError('Too many devices are registered. Tell an admin.');
  }
  await db
    .insert(pushSubscriptions)
    .values({ endpoint: input.endpoint, p256dh: input.keys.p256dh, auth: input.keys.auth })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: { p256dh: input.keys.p256dh, auth: input.keys.auth },
    });
}

export async function removePushSubscription(endpoint: string): Promise<void> {
  await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint));
}

export interface PushMessage {
  title: string;
  body: string;
  /** Path opened when the notification is tapped. */
  url: string;
  /** Notifications with the same tag replace each other on the device. */
  tag?: string;
}

/** Send to every subscribed device. Returns how many were delivered. */
export async function sendPushToAll(message: PushMessage): Promise<number> {
  const vapid = getVapid();
  if (!vapid) return 0;

  const subs = await db.select().from(pushSubscriptions);
  const payload = JSON.stringify(message);
  let delivered = 0;

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
          { vapidDetails: vapid, TTL: 24 * 60 * 60 },
        );
        delivered += 1;
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          // The device unsubscribed or the subscription expired.
          await removePushSubscription(sub.endpoint).catch(() => {});
        } else {
          // A refused connection has a code but an empty message.
          const reason =
            status ?? (err as { code?: string }).code ?? (err instanceof Error ? err.message : err);
          console.error('[push] send failed:', reason || err);
        }
      }
    }),
  );
  return delivered;
}
