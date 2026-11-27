// src/lib/services/cupNotify.ts
//
// Who hears about Ryder Cup news outside the site:
//   - push: every subscribed device
//   - email: golfers who opted in (results as they happen, the weekly recap)
//
// Sending never fails the action that caused it: a result is saved and in the
// feed whether or not a mail service is having a bad day.

import { randomBytes } from 'node:crypto';
import { and, eq, isNotNull, isNull } from 'drizzle-orm';
import { db, golfers } from '@/lib/db';
import { getMatchStory } from '@/lib/services/cup';
import { isEmailConfigured, sendEmail } from '@/lib/services/mailer';
import { sendPushToAll } from '@/lib/services/push';
import { canEmailLinks } from '@/lib/services/session';

type EmailKind = 'results' | 'weekly';

/** Email everyone opted in to `kind`, each with their own unsubscribe link. */
export async function emailSubscribers(
  origin: string,
  kind: EmailKind,
  message: { subject: string; text: string },
): Promise<number> {
  if (!isEmailConfigured()) return 0;
  if (!canEmailLinks()) {
    console.error('[cup-notify] NEXT_PUBLIC_SITE_URL is not set; emails with links are not sent.');
    return 0;
  }

  const column = kind === 'results' ? golfers.notifyResults : golfers.notifyWeekly;
  const recipients = await db
    .select({
      id: golfers.id,
      email: golfers.email,
      unsubscribeToken: golfers.unsubscribeToken,
    })
    .from(golfers)
    .where(and(eq(column, true), isNotNull(golfers.email)));

  let sent = 0;
  for (const r of recipients) {
    if (!r.email) continue;
    try {
      let token = r.unsubscribeToken;
      if (!token) {
        // Only if there is still none, so two sends at once agree on one token.
        await db
          .update(golfers)
          .set({ unsubscribeToken: randomBytes(24).toString('base64url') })
          .where(and(eq(golfers.id, r.id), isNull(golfers.unsubscribeToken)));
        const [row] = await db
          .select({ token: golfers.unsubscribeToken })
          .from(golfers)
          .where(eq(golfers.id, r.id))
          .limit(1);
        token = row?.token ?? null;
        if (!token) continue;
      }
      await sendEmail({
        to: r.email,
        subject: message.subject,
        text: `${message.text}\n\n--\nStop these emails: ${origin}/unsubscribe?token=${token}`,
      });
      sent += 1;
    } catch (err) {
      console.error('[cup-notify] email failed:', err instanceof Error ? err.message : err);
    }
  }
  return sent;
}

/** Tell subscribers about a result that was just reported. */
export async function notifyCupResult(origin: string, matchId: string): Promise<void> {
  try {
    const story = await getMatchStory(matchId);
    if (!story) return;
    const body = story.details ?? '';
    await Promise.all([
      sendPushToAll({ title: story.headline, body, url: '/ryder-cup', tag: `cup-match-${matchId}` }),
      emailSubscribers(origin, 'results', {
        subject: story.headline,
        text: [story.headline, body, '', `Scoreboard: ${origin}/ryder-cup`].join('\n'),
      }),
    ]);
  } catch (err) {
    console.error('[cup-notify] result notification failed:', err instanceof Error ? err.message : err);
  }
}

/** Turn every email off for whoever holds this unsubscribe token. */
export async function unsubscribeByToken(token: string): Promise<boolean> {
  const rows = await db
    .update(golfers)
    .set({ notifyResults: false, notifyWeekly: false })
    .where(eq(golfers.unsubscribeToken, token))
    .returning({ id: golfers.id });
  return rows.length > 0;
}
