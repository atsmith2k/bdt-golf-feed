'use client';

import { useState } from 'react';
import useSWR from 'swr';
import {
  DEFAULT_TEAM_COLORS,
  type CupAdminGolferDTO,
  type CupStateDTO,
  type GolferRole,
} from '@/types/cup';

const fetcher = async (url: string) => {
  const res = await fetch(url);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status})`);
  return json;
};

const INPUT =
  'bg-bdt-bg border border-bdt-border rounded-sm px-3 py-2 text-white focus:border-bdt-red outline-none';
const LABEL = 'text-[10px] font-mono uppercase tracking-widest text-bdt-muted';
const OUTLINE_BUTTON =
  'border border-bdt-cream text-bdt-cream px-2 py-1 text-xs font-mono rounded-sm disabled:opacity-50 hover:bg-bdt-cream hover:text-bdt-bg transition-colors';

type Message = { kind: 'ok' | 'err'; text: string };

async function send(url: string, method: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status})`);
  return json;
}

interface TeamDraft {
  name: string;
  color: string;
  captainId: string;
}

function SeasonForm({
  state,
  golfers,
  onSaved,
}: {
  state: CupStateDTO;
  golfers: CupAdminGolferDTO[];
  onSaved: (message: Message) => void;
}) {
  const [name, setName] = useState(state.season?.name ?? `${new Date().getFullYear()} BDT Ryder Cup`);
  const [pointsToWin, setPointsToWin] = useState(
    state.season?.pointsToWin != null ? String(state.season.pointsToWin) : '',
  );
  const [teams, setTeams] = useState<TeamDraft[]>(() =>
    [0, 1].map((i) => ({
      name: state.teams[i]?.name ?? '',
      color: state.teams[i]?.color ?? DEFAULT_TEAM_COLORS[i],
      captainId: state.teams[i]?.captainId ?? '',
    })),
  );
  const [busy, setBusy] = useState(false);

  function patchTeam(i: number, patch: Partial<TeamDraft>) {
    setTeams((prev) => prev.map((t, idx) => (idx === i ? { ...t, ...patch } : t)));
  }

  async function save(startNew: boolean) {
    if (
      startNew &&
      !confirm(
        'Start a new season? The current season is closed and kept; the new one starts at 0–0 with no players.',
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      await send('/api/cup/admin/season', 'PUT', {
        name,
        pointsToWin: pointsToWin.trim() === '' ? null : Number(pointsToWin),
        teams: teams.map((t) => ({ name: t.name, color: t.color, captainId: t.captainId || null })),
        startNew,
      });
      onSaved({ kind: 'ok', text: startNew ? 'New season started.' : 'Season saved.' });
    } catch (err) {
      onSaved({ kind: 'err', text: err instanceof Error ? err.message : 'Save failed' });
    } finally {
      setBusy(false);
    }
  }

  const incomplete = !name.trim() || teams.some((t) => !t.name.trim());

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save(false);
      }}
      className="flex flex-col gap-4"
    >
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3">
        <label className="flex flex-col gap-1">
          <span className={LABEL}>Season name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} className={INPUT} />
        </label>
        <label className="flex flex-col gap-1 sm:w-40">
          <span className={LABEL}>Points to win (optional)</span>
          <input
            type="number"
            min="0.5"
            step="0.5"
            value={pointsToWin}
            onChange={(e) => setPointsToWin(e.target.value)}
            className={`${INPUT} font-mono`}
          />
        </label>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {teams.map((team, i) => (
          <fieldset key={i} className="flex flex-col gap-2 border border-bdt-border rounded-sm p-3 min-w-0">
            <legend className={`${LABEL} px-1`}>Team {i + 1}</legend>
            <div className="flex gap-2">
              <input
                value={team.name}
                onChange={(e) => patchTeam(i, { name: e.target.value })}
                placeholder="Team name"
                aria-label={`Team ${i + 1} name`}
                maxLength={40}
                className={`${INPUT} flex-1 min-w-0`}
              />
              <input
                type="color"
                value={team.color}
                onChange={(e) => patchTeam(i, { color: e.target.value })}
                aria-label={`Team ${i + 1} colour`}
                className="h-10 w-12 shrink-0 bg-bdt-bg border border-bdt-border rounded-sm p-1"
              />
            </div>
            <label className="flex flex-col gap-1">
              <span className={LABEL}>Captain</span>
              <select
                value={team.captainId}
                onChange={(e) => patchTeam(i, { captainId: e.target.value })}
                className={INPUT}
              >
                <option value="">No captain yet</option>
                {golfers.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.fullName}
                  </option>
                ))}
              </select>
            </label>
          </fieldset>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={busy || incomplete}
          className="bg-bdt-red text-white px-4 py-2 font-display tracking-[0.2em] text-sm rounded-sm disabled:opacity-50 hover:bg-bdt-redDeep transition-colors"
        >
          {busy ? 'Saving…' : state.season ? 'Save season' : 'Create season'}
        </button>
        {state.season && (
          <button
            type="button"
            onClick={() => save(true)}
            disabled={busy || incomplete}
            className={OUTLINE_BUTTON}
          >
            Start a new season with these teams
          </button>
        )}
      </div>
    </form>
  );
}

function GolferRow({
  golfer,
  teams,
  onChanged,
}: {
  golfer: CupAdminGolferDTO;
  teams: CupStateDTO['teams'];
  onChanged: (message: Message) => void;
}) {
  const [email, setEmail] = useState(golfer.email ?? '');
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<string | null>(null);

  async function run(action: () => Promise<string>) {
    setBusy(true);
    try {
      onChanged({ kind: 'ok', text: await action() });
    } catch (err) {
      onChanged({ kind: 'err', text: err instanceof Error ? err.message : 'Failed' });
    } finally {
      setBusy(false);
    }
  }

  const access = (body: unknown) => send(`/api/cup/admin/golfers/${golfer.id}`, 'PATCH', body);
  const emailChanged = email.trim().toLowerCase() !== (golfer.email ?? '');

  return (
    <tr className="border-t border-bdt-border/60 align-top">
      <td className="py-2 pr-3">
        <div className="font-display text-base text-white">{golfer.fullName}</div>
        <div className="font-mono text-xs text-bdt-muted">
          GHIN {golfer.ghinNumber} · {golfer.handicapIndex}
        </div>
      </td>
      <td className="py-2 pr-3">
        <select
          value={golfer.teamId ?? ''}
          disabled={busy || teams.length !== 2}
          aria-label={`Team for ${golfer.fullName}`}
          onChange={(e) =>
            run(async () => {
              await send('/api/cup/admin/members', 'PUT', {
                golferId: golfer.id,
                teamId: e.target.value || null,
              });
              return `${golfer.fullName}: team updated.`;
            })
          }
          className={`${INPUT} py-1 text-sm`}
        >
          <option value="">Not playing</option>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </td>
      <td className="py-2 pr-3">
        <select
          value={golfer.role}
          disabled={busy}
          aria-label={`Role for ${golfer.fullName}`}
          onChange={(e) =>
            run(async () => {
              await access({ role: e.target.value as GolferRole });
              return `${golfer.fullName}: role updated.`;
            })
          }
          className={`${INPUT} py-1 text-sm`}
        >
          <option value="PLAYER">Player</option>
          <option value="COMMITTEE">Committee</option>
          <option value="ADMIN">Admin</option>
        </select>
      </td>
      <td className="py-2">
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="No email yet"
              aria-label={`Email for ${golfer.fullName}`}
              className={`${INPUT} py-1 text-sm flex-1 min-w-40`}
            />
            {emailChanged && (
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    await access({ email: email.trim() });
                    return `${golfer.fullName}: email ${email.trim() ? 'saved' : 'removed'}.`;
                  })
                }
                className={OUTLINE_BUTTON}
              >
                Save
              </button>
            )}
            <button
              type="button"
              disabled={busy}
              title="Create a one-time sign-in link to send to this golfer yourself"
              onClick={() =>
                run(async () => {
                  const { url } = await send(`/api/cup/admin/golfers/${golfer.id}/signin-link`, 'POST');
                  setLink(url);
                  try {
                    await navigator.clipboard.writeText(url);
                    return `Sign-in link for ${golfer.fullName} copied. It works once, for 24 hours.`;
                  } catch {
                    return `Sign-in link for ${golfer.fullName} is ready below. It works once, for 24 hours.`;
                  }
                })
              }
              className={`${OUTLINE_BUTTON} border-bdt-muted text-bdt-muted whitespace-nowrap`}
            >
              Get link
            </button>
          </div>
          {link && (
            <input
              readOnly
              value={link}
              onFocus={(e) => e.currentTarget.select()}
              aria-label={`Sign-in link for ${golfer.fullName}`}
              className={`${INPUT} py-1 text-xs font-mono`}
            />
          )}
          {golfer.pendingEmail && (
            <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
              <span className="bdt-chip bg-bdt-gold text-black">Needs approval</span>
              <span className="text-bdt-cream break-all">{golfer.pendingEmail}</span>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    await access({ approvePending: true });
                    return `${golfer.fullName}: email approved.`;
                  })
                }
                className={OUTLINE_BUTTON}
              >
                Approve
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    await access({ rejectPending: true });
                    return `${golfer.fullName}: claim rejected.`;
                  })
                }
                className={`${OUTLINE_BUTTON} border-bdt-red text-bdt-red hover:bg-bdt-red hover:text-white`}
              >
                Reject
              </button>
            </div>
          )}
        </div>
      </td>
    </tr>
  );
}

/** Season set-up, team membership, roles and sign-in emails. Admins only. */
export function CupAdminPanel() {
  const cup = useSWR<CupStateDTO>('/api/cup', fetcher);
  const access = useSWR<{ golfers: CupAdminGolferDTO[]; emailConfigured: boolean }>(
    '/api/cup/admin/golfers',
    fetcher,
  );
  const [message, setMessage] = useState<Message | null>(null);

  function changed(next: Message) {
    setMessage(next);
    cup.mutate();
    access.mutate();
  }

  const loadError = cup.error ?? access.error;
  if (loadError) {
    return (
      <section className="bdt-card p-5 text-sm font-mono text-bdt-red">
        Couldn&apos;t load the Ryder Cup settings: {loadError.message}
      </section>
    );
  }
  if (!cup.data || !access.data) {
    return <section className="bdt-card p-5 text-sm font-mono text-bdt-muted">Loading…</section>;
  }

  const golfers = access.data.golfers;
  const pending = golfers.filter((g) => g.pendingEmail).length;

  return (
    <div className="flex flex-col gap-6">
      <section className="bdt-card p-5 flex flex-col gap-4">
        <h2 className="font-display tracking-[0.25em] text-xl text-bdt-cream">
          <span className="bdt-rule" />
          RYDER CUP · SEASON
        </h2>
        <SeasonForm
          // Reset the drafts when a different season loads.
          key={cup.data.season?.id ?? 'none'}
          state={cup.data}
          golfers={golfers}
          onSaved={changed}
        />
      </section>

      <section className="bdt-card p-5 flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display tracking-[0.25em] text-xl text-bdt-cream">
            <span className="bdt-rule" />
            TEAMS · ROLES · SIGN-IN
          </h2>
          {pending > 0 && (
            <span className="bdt-chip bg-bdt-gold text-black">
              {pending} email{pending === 1 ? '' : 's'} to approve
            </span>
          )}
        </div>
        <p className="text-xs font-mono text-bdt-muted">
          Captains, committee members and admins can add matches and report results. A captain is
          whoever the season names above.{' '}
          {access.data.emailConfigured
            ? 'Sign-in links are sent by email.'
            : 'Email is not configured on this server, so sign-in links are not sent: use “Get link” and send it to the golfer yourself.'}
        </p>

        {message && (
          <p
            role="status"
            className={`text-sm font-mono ${message.kind === 'ok' ? 'text-bdt-cream' : 'text-bdt-red'}`}
          >
            {message.text}
          </p>
        )}

        {cup.data.teams.length !== 2 && (
          <p className="text-sm text-bdt-muted">Create the season above to assign teams.</p>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead className="text-[10px] uppercase tracking-widest text-bdt-muted">
              <tr>
                <th className="text-left py-2 font-normal">Golfer</th>
                <th className="text-left py-2 font-normal">Team</th>
                <th className="text-left py-2 font-normal">Role</th>
                <th className="text-left py-2 font-normal">Sign-in email</th>
              </tr>
            </thead>
            <tbody>
              {golfers.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-4 text-bdt-muted">
                    No golfers yet. Add them to the roster first.
                  </td>
                </tr>
              )}
              {golfers.map((g) => (
                <GolferRow
                  // Remount when the saved email changes so the input follows it.
                  key={`${g.id}:${g.email ?? ''}`}
                  golfer={g}
                  teams={cup.data!.teams}
                  onChanged={changed}
                />
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
