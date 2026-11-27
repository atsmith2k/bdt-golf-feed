// src/lib/services/mailer.ts
//
// Outgoing email. Speaks the "POST {from, to, subject, text, html} with a
// bearer key" JSON shape that Resend and compatible services accept. Set
// EMAIL_API_KEY and EMAIL_FROM to turn it on; EMAIL_API_URL points it at a
// compatible service other than Resend.
//
// With no key configured nothing is sent and the message is written to the
// server log instead, so sign-in still works in development and an admin can
// always hand out a sign-in link from the control room.

import { cleanEnv } from '@/lib/env';
import { createExternalServiceError } from '@/lib/utils/error';

const DEFAULT_API_URL = 'https://api.resend.com/emails';

export interface OutgoingEmail {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export function isEmailConfigured(): boolean {
  return Boolean(cleanEnv(process.env.EMAIL_API_KEY) && cleanEnv(process.env.EMAIL_FROM));
}

/** Returns true when the message was handed to the email service. */
export async function sendEmail(message: OutgoingEmail): Promise<boolean> {
  const apiKey = cleanEnv(process.env.EMAIL_API_KEY);
  const from = cleanEnv(process.env.EMAIL_FROM);
  if (!apiKey || !from) {
    console.log(
      `[mailer] email is not configured; not sent.\n  to: ${message.to}\n  subject: ${message.subject}\n  ${message.text.replace(/\n/g, '\n  ')}`,
    );
    return false;
  }

  const url = cleanEnv(process.env.EMAIL_API_URL) || DEFAULT_API_URL;
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: [message.to],
        subject: message.subject,
        text: message.text,
        ...(message.html ? { html: message.html } : {}),
      }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    throw createExternalServiceError('email', err instanceof Error ? err.message : 'request failed');
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw createExternalServiceError('email', `HTTP ${res.status} ${body.slice(0, 200)}`);
  }
  return true;
}
