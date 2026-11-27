// src/lib/services/session.ts
//
// Golfer sign-in by email magic link, and the "who is this and what may they
// do" check used by the Ryder Cup APIs.
//
// Flow (POST /api/session/request, then POST /api/session/verify):
//   1. The golfer enters an email. If a golfer has that email, a link is sent.
//   2. Otherwise they are asked for their GHIN number. If it matches a golfer
//      with no email yet, a link is sent to the address; using the link proves
//      they own it and attaches it to the golfer. Anything else: no entry.
//   3. A golfer who holds a role (committee, admin, team captain) can report
//      results, so a self-claimed address for one of them waits for an admin
//      to approve it instead of signing in.
//
// Links and sessions are random tokens; only their SHA-256 is stored.

import { createHash, randomBytes } from 'node:crypto';
import { and, eq, gt, isNotNull, isNull, sql } from 'drizzle-orm';
import { cookies } from 'next/headers';
import { db, authTokens, cupSeasons, cupTeams, golfers, sessions, type Golfer } from '@/lib/db';
import { cleanEnv } from '@/lib/env';
import { isAdminAuthenticated } from '@/lib/utils/auth';
import { createUnauthorizedError, createValidationError } from '@/lib/utils/error';
import { sendEmail } from '@/lib/services/mailer';
import type { ViewerDTO } from '@/types/cup';

export const SESSION_COOKIE = 'bdt_session';

const LINK_TTL_MS = 20 * 60 * 1000;
const ADMIN_LINK_TTL_MS = 24 * 60 * 60 * 1000;
const SESSION_TTL_MS = 180 * 24 * 60 * 60 * 1000;
const MAX_LINKS_PER_WINDOW = 5;
// Across every address and golfer, so the form cannot be used to send mail in
// bulk. Far above what a league signs in with in a quarter of an hour.
const MAX_LINKS_OVERALL = 60;
const LINK_WINDOW_MS = 15 * 60 * 1000;

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function newToken(): string {
  return randomBytes(32).toString('base64url');
}

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/**
 * Where emailed links point. The configured site URL wins so a forged Host
 * header cannot redirect a link; the request's own origin is the fallback for
 * development. Scheduled jobs have no request and rely on the configured URL.
 */
export function siteOrigin(req?: Request): string {
  return configuredOrigin() ?? (req ? new URL(req.url).origin : 'http://localhost:3000');
}

function configuredOrigin(): string | null {
  const raw = cleanEnv(process.env.NEXT_PUBLIC_SITE_URL)?.replace(/\/+$/, '');
  if (!raw) return null;
  try {
    return new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`).origin;
  } catch {
    return null;
  }
}

/**
 * False in production when NEXT_PUBLIC_SITE_URL is missing. Links in email
 * would then be built from the request's Host header, which a caller can
 * forge, or from localhost in a scheduled job; so no email is sent.
 */
export function canEmailLinks(): boolean {
  return process.env.NODE_ENV !== 'production' || configuredOrigin() !== null;
}

/** True when the golfer could report results, so their email needs care. */
async function holdsRole(golfer: Pick<Golfer, 'id' | 'role'>): Promise<boolean> {
  if (golfer.role !== 'PLAYER') return true;
  return isActiveCaptain(golfer.id);
}

async function isActiveCaptain(golferId: string): Promise<boolean> {
  const rows = await db
    .select({ id: cupTeams.id })
    .from(cupTeams)
    .innerJoin(cupSeasons, eq(cupSeasons.id, cupTeams.seasonId))
    .where(and(eq(cupTeams.captainId, golferId), eq(cupSeasons.status, 'ACTIVE')))
    .limit(1);
  return rows.length > 0;
}

async function issueLink(
  origin: string,
  golferId: string,
  email: string | null,
  ttlMs: number,
): Promise<string> {
  const token = newToken();
  await db.insert(authTokens).values({
    tokenHash: hashToken(token),
    golferId,
    email,
    expiresAt: new Date(Date.now() + ttlMs),
  });
  return `${origin}/signin/verify?token=${encodeURIComponent(token)}`;
}

export type SignInRequestStatus = 'sent' | 'need_ghin' | 'no_match' | 'rate_limited';

export async function requestSignIn(
  origin: string,
  input: { email: string; ghinNumber?: string | null },
): Promise<SignInRequestStatus> {
  const email = normalizeEmail(input.email);
  if (!canEmailLinks()) {
    throw createValidationError('Sign-in by email is not set up yet. Ask an admin for a link.');
  }

  const [known] = await db.select().from(golfers).where(eq(golfers.email, email)).limit(1);
  let golfer = known;

  if (!golfer) {
    const ghin = input.ghinNumber?.trim();
    if (!ghin) return 'need_ghin';
    const [byGhin] = await db.select().from(golfers).where(eq(golfers.ghinNumber, ghin)).limit(1);
    // A golfer who already has an email keeps it; only an admin changes it.
    if (!byGhin || byGhin.email) return 'no_match';
    golfer = byGhin;
  }

  // Limits per address, per golfer (a GHIN number is public, so one golfer
  // must not be a way to mail any number of addresses) and overall.
  const [{ forEmail, forGolfer, overall }] = await db
    .select({
      forEmail: sql<number>`(count(*) filter (where ${authTokens.email} = ${email}))::int`,
      forGolfer: sql<number>`(count(*) filter (where ${authTokens.golferId} = ${golfer.id}))::int`,
      overall: sql<number>`count(*)::int`,
    })
    .from(authTokens)
    .where(
      and(
        isNotNull(authTokens.email),
        gt(authTokens.createdAt, new Date(Date.now() - LINK_WINDOW_MS)),
      ),
    );
  if (
    forEmail >= MAX_LINKS_PER_WINDOW ||
    forGolfer >= MAX_LINKS_PER_WINDOW ||
    overall >= MAX_LINKS_OVERALL
  ) {
    return 'rate_limited';
  }

  const link = await issueLink(origin, golfer.id, email, LINK_TTL_MS);
  await sendEmail({
    to: email,
    subject: 'Your BDT Golf Network sign-in link',
    text: [
      `Hi ${golfer.firstName},`,
      '',
      'Open this link to sign in to the BDT Golf Network:',
      link,
      '',
      'It works once and expires in 20 minutes. If you did not ask for it, ignore this email.',
    ].join('\n'),
  });
  return 'sent';
}

export type VerifyResult =
  | { status: 'ok'; sessionToken: string; maxAgeSeconds: number; name: string }
  | { status: 'pending'; name: string }
  | { status: 'invalid' };

export async function verifySignIn(token: string): Promise<VerifyResult> {
  // Claim the link in one statement so it cannot be used twice.
  const [link] = await db
    .update(authTokens)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(authTokens.tokenHash, hashToken(token)),
        isNull(authTokens.usedAt),
        gt(authTokens.expiresAt, new Date()),
      ),
    )
    .returning();
  if (!link) return { status: 'invalid' };

  const [golfer] = await db.select().from(golfers).where(eq(golfers.id, link.golferId)).limit(1);
  if (!golfer) return { status: 'invalid' };

  if (link.email && golfer.email !== link.email) {
    // The link was sent to an address the golfer does not have (yet).
    if (golfer.email) return { status: 'invalid' };
    const [taken] = await db
      .select({ id: golfers.id })
      .from(golfers)
      .where(eq(golfers.email, link.email))
      .limit(1);
    if (taken) return { status: 'invalid' };

    if (await holdsRole(golfer)) {
      // The first claim stands until an admin approves or rejects it; a later
      // one must not quietly replace the address the admin is looking at.
      await db
        .update(golfers)
        .set({ pendingEmail: link.email })
        .where(and(eq(golfers.id, golfer.id), isNull(golfers.pendingEmail)));
      return { status: 'pending', name: golfer.fullName };
    }
    // Only if nobody attached an address in the meantime.
    let attached: { id: string }[];
    try {
      attached = await db
        .update(golfers)
        .set({ email: link.email, pendingEmail: null, emailApproved: false })
        .where(and(eq(golfers.id, golfer.id), isNull(golfers.email)))
        .returning({ id: golfers.id });
    } catch {
      // Another golfer took the address at the same moment.
      return { status: 'invalid' };
    }
    if (!attached.length) return { status: 'invalid' };
  }

  const sessionToken = newToken();
  await db.insert(sessions).values({
    tokenHash: hashToken(sessionToken),
    golferId: golfer.id,
    expiresAt: new Date(Date.now() + SESSION_TTL_MS),
  });
  return {
    status: 'ok',
    sessionToken,
    maxAgeSeconds: Math.floor(SESSION_TTL_MS / 1000),
    name: golfer.fullName,
  };
}

/** A link an admin copies and sends to a golfer themselves. Valid for a day. */
export async function createAdminSignInLink(origin: string, golferId: string): Promise<string> {
  const [golfer] = await db
    .select({ id: golfers.id })
    .from(golfers)
    .where(eq(golfers.id, golferId))
    .limit(1);
  if (!golfer) throw createValidationError('Golfer not found.');
  return issueLink(origin, golfer.id, null, ADMIN_LINK_TTL_MS);
}

export async function endSession(): Promise<void> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (token) await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
}

/**
 * Sign a golfer out everywhere and cancel any link still on its way to them,
 * e.g. after their email changes. Without the second part a link sent to the
 * old address would still get in, or attach that address again.
 */
export async function endAllSessions(golferId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.golferId, golferId));
  await db
    .delete(authTokens)
    .where(and(eq(authTokens.golferId, golferId), isNull(authTokens.usedAt)));
}

export interface Viewer {
  golfer: Pick<Golfer, 'id' | 'fullName' | 'role'> | null;
  /** Holds the ADMIN_TOKEN cookie from /admin/login. */
  viaAdminToken: boolean;
  canReport: boolean;
  canManage: boolean;
}

export async function getViewer(): Promise<Viewer> {
  const viaAdminToken = await isAdminAuthenticated();
  const token = (await cookies()).get(SESSION_COOKIE)?.value;

  let golfer: Viewer['golfer'] = null;
  if (token) {
    const [row] = await db
      .select({ id: golfers.id, fullName: golfers.fullName, role: golfers.role })
      .from(sessions)
      .innerJoin(golfers, eq(golfers.id, sessions.golferId))
      .where(and(eq(sessions.tokenHash, hashToken(token)), gt(sessions.expiresAt, new Date())))
      .limit(1);
    golfer = row ?? null;
  }

  const canManage = viaAdminToken || golfer?.role === 'ADMIN';
  const canReport =
    canManage ||
    golfer?.role === 'COMMITTEE' ||
    (golfer ? await isActiveCaptain(golfer.id) : false);
  return { golfer, viaAdminToken, canReport, canManage };
}

export function toViewerDTO(viewer: Viewer): ViewerDTO {
  return {
    signedIn: Boolean(viewer.golfer) || viewer.viaAdminToken,
    name: viewer.golfer?.fullName ?? (viewer.viaAdminToken ? 'Admin' : null),
    canReport: viewer.canReport,
    canManage: viewer.canManage,
  };
}

export async function requireReporter(): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer.canReport) {
    throw createUnauthorizedError('Only captains, committee members and admins can do that.');
  }
  return viewer;
}

export async function requireManager(): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer.canManage) throw createUnauthorizedError('Only admins can do that.');
  return viewer;
}
