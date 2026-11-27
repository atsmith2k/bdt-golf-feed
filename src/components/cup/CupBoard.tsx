'use client';

import { useState } from 'react';
import Link from 'next/link';
import useSWR, { useSWRConfig } from 'swr';
import clsx from 'clsx';
import {
  formatCupPoints,
  type CupMatchDTO,
  type CupStateDTO,
  type CupTeamDTO,
  type ViewerDTO,
} from '@/types/cup';
import { FEED_KEY } from '@/lib/feedKey';
import { MatchForm } from './MatchForm';

const fetcher = async (url: string) => {
  const res = await fetch(url);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status})`);
  return json;
};

const SMALL_BUTTON =
  'text-[10px] font-mono uppercase tracking-widest text-bdt-cream border border-bdt-border rounded-sm px-2 py-1 hover:bg-bdt-border/40 transition-colors';

/** "2026-06-14" -> "Sun, Jun 14", read as a calendar date, not a UTC instant. */
function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

function recordText(r: { won: number; lost: number; halved: number }): string {
  return `${r.won}-${r.lost}-${r.halved}`;
}

function Scoreboard({ state }: { state: CupStateDTO }) {
  const [a, b] = state.teams;
  const total = a.points + b.points;
  const share = total > 0 ? (a.points / total) * 100 : 50;
  const target = state.season?.pointsToWin ?? null;
  const leader = a.points === b.points ? null : a.points > b.points ? a : b;
  const clinched = target !== null && leader !== null && leader.points >= target;

  let status: string;
  if (clinched && leader) status = `${leader.name} win the cup`;
  else if (total === 0) status = 'No matches played yet';
  else if (!leader) status = 'All square';
  else status = `${leader.name} lead by ${formatCupPoints(Math.abs(a.points - b.points))}`;

  return (
    <section className="bdt-card overflow-hidden" aria-label="Ryder Cup score">
      <div className="grid grid-cols-[1fr_auto_1fr] items-stretch">
        {[a, b].map((team, i) => (
          <div
            key={team.id}
            className={clsx(
              'flex flex-col gap-1 p-4 md:p-6 min-w-0',
              i === 0 ? 'order-1 items-start text-left' : 'order-3 items-end text-right',
            )}
          >
            <span
              className="font-display tracking-[0.18em] text-lg md:text-2xl text-white leading-tight break-words"
            >
              {team.name}
            </span>
            <span
              className="font-display text-6xl md:text-8xl leading-none text-white px-3 py-1 rounded-sm"
              style={{ backgroundColor: team.color }}
            >
              {formatCupPoints(team.points)}
            </span>
            <span className="text-xs font-mono text-bdt-muted">
              {recordText(team.record)} <span className="hidden sm:inline">W-L-H</span>
            </span>
          </div>
        ))}
        <div className="order-2 flex flex-col items-center justify-center px-2 text-center">
          <span className="font-display tracking-[0.3em] text-sm text-bdt-muted">VS</span>
        </div>
      </div>

      <div className="h-2 flex" aria-hidden="true">
        <div style={{ width: `${share}%`, backgroundColor: a.color }} />
        <div className="flex-1" style={{ backgroundColor: b.color }} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 px-4 md:px-6 py-3 text-xs font-mono uppercase tracking-widest">
        <span className="text-bdt-cream">{status}</span>
        {target !== null && (
          <span className="text-bdt-muted">{formatCupPoints(target)} points wins the cup</span>
        )}
      </div>
    </section>
  );
}

function SidePlayers({
  match,
  team,
  align,
}: {
  match: CupMatchDTO;
  team: CupTeamDTO;
  align: 'left' | 'right';
}) {
  const side = match.sides.find((s) => s.teamId === team.id);
  const isFinal = match.status === 'FINAL';
  const won = isFinal && match.winnerTeamId === team.id;
  const lost = isFinal && match.winnerTeamId !== null && !won;
  return (
    <div
      className={clsx(
        'min-w-0 flex flex-col gap-0.5 border-bdt-border',
        align === 'left' ? 'pl-3 border-l-4 text-left' : 'pr-3 border-r-4 text-right',
      )}
      style={{ borderColor: team.color }}
    >
      {side && side.players.length > 0 ? (
        side.players.map((p) => (
          <span
            key={p.golferId}
            className={clsx(
              'font-display tracking-wide text-lg leading-tight break-words',
              lost ? 'text-bdt-muted' : 'text-white',
            )}
          >
            {p.fullName}
          </span>
        ))
      ) : (
        <span className="text-sm text-bdt-muted">{team.name} · to be named</span>
      )}
      {won && (
        <span className="text-[10px] font-mono uppercase tracking-widest text-bdt-gold">
          Won{match.margin ? ` ${match.margin}` : ''}
        </span>
      )}
    </div>
  );
}

function MatchCard({
  match,
  teams,
  canReport,
  onEdit,
}: {
  match: CupMatchDTO;
  teams: CupTeamDTO[];
  canReport: boolean;
  onEdit: (m: CupMatchDTO) => void;
}) {
  const isFinal = match.status === 'FINAL';
  const meta = [
    match.sessionName,
    formatDate(match.playDate),
    match.course,
  ].filter(Boolean);

  return (
    <li className="bdt-card p-4 flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="bdt-chip bg-bdt-border text-white">{match.format}</span>
          <span className="text-xs font-mono text-bdt-muted">
            {formatCupPoints(match.points)} {match.points === 1 ? 'pt' : 'pts'}
          </span>
          {isFinal && match.winnerTeamId === null && (
            <span className="bdt-chip bg-bdt-cream text-bdt-bg">Halved</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {meta.length > 0 && (
            <span className="text-xs font-mono text-bdt-muted">{meta.join(' · ')}</span>
          )}
          {canReport && (
            <button type="button" onClick={() => onEdit(match)} className={SMALL_BUTTON}>
              {isFinal ? 'Edit' : 'Report'}
            </button>
          )}
        </div>
      </div>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <SidePlayers match={match} team={teams[0]} align="left" />
        <span className="font-display tracking-[0.2em] text-xs text-bdt-muted">VS</span>
        <SidePlayers match={match} team={teams[1]} align="right" />
      </div>
      {match.notes && <p className="text-sm text-bdt-muted">{match.notes}</p>}
    </li>
  );
}

function TeamTable({ team }: { team: CupTeamDTO }) {
  const members = [...team.members].sort(
    (x, y) => y.record.points - x.record.points || y.record.won - x.record.won,
  );
  return (
    <section className="bdt-card p-4 min-w-0">
      <h3
        className="font-display tracking-[0.2em] text-xl text-white pl-3 border-l-4 mb-3"
        style={{ borderColor: team.color }}
      >
        {team.name}
      </h3>
      {members.length === 0 ? (
        <p className="text-sm text-bdt-muted">No players yet.</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-[10px] uppercase tracking-widest text-bdt-muted">
            <tr>
              <th className="text-left py-1 font-normal">Player</th>
              <th className="text-right py-1 font-normal">Index</th>
              <th className="text-right py-1 font-normal">W-L-H</th>
              <th className="text-right py-1 font-normal">Pts</th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.golferId} className="border-t border-bdt-border/60">
                <td className="py-2">
                  <Link
                    href={`/roster/${encodeURIComponent(m.ghinNumber)}`}
                    className="font-display tracking-wide text-base text-white hover:text-bdt-cream hover:underline"
                  >
                    {m.fullName}
                  </Link>
                  {m.isCaptain && (
                    <span className="ml-2 bdt-chip bg-bdt-gold text-black">Captain</span>
                  )}
                </td>
                <td className="py-2 text-right font-mono text-bdt-muted">{m.handicapIndex}</td>
                <td className="py-2 text-right font-mono text-bdt-cream">{recordText(m.record)}</td>
                <td className="py-2 text-right font-mono text-white">
                  {formatCupPoints(m.record.points)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

interface Props {
  initialState: CupStateDTO | null;
  initialViewer: ViewerDTO;
}

export function CupBoard({ initialState, initialViewer }: Props) {
  const { mutate: mutateGlobal } = useSWRConfig();
  const { data: state, error, mutate } = useSWR<CupStateDTO>('/api/cup', fetcher, {
    fallbackData: initialState ?? undefined,
    refreshInterval: 60_000,
  });
  const { data: session, mutate: mutateSession } = useSWR<{ viewer: ViewerDTO }>(
    '/api/session',
    fetcher,
    { fallbackData: { viewer: initialViewer }, revalidateOnFocus: false },
  );
  const viewer = session?.viewer ?? initialViewer;

  // 'new', a match being reported or edited, or closed.
  const [editing, setEditing] = useState<CupMatchDTO | 'new' | null>(null);

  function openForm(target: CupMatchDTO | 'new') {
    setEditing(target);
    // The form renders at the top of the page; bring it into view on a phone.
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function signOut() {
    await fetch('/api/session', { method: 'DELETE' });
    setEditing(null);
    mutateSession();
  }

  if (!state) {
    return (
      <div className="bdt-card p-6 font-mono text-sm text-bdt-muted">
        {error ? `Couldn't load the Ryder Cup: ${error.message}` : 'Loading…'}
      </div>
    );
  }

  const ready = state.season !== null && state.teams.length === 2;
  const upcoming = state.matches.filter((m) => m.status === 'SCHEDULED');
  const results = state.matches.filter((m) => m.status === 'FINAL');

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display tracking-[0.25em] text-2xl text-bdt-cream">
          <span className="bdt-rule" />
          {state.season?.name ?? 'RYDER CUP'}
        </h2>
        <div className="flex flex-wrap items-center gap-3 text-xs font-mono">
          {viewer.canManage && (
            <Link href="/ryder-cup/manage" className={SMALL_BUTTON}>
              Manage
            </Link>
          )}
          {viewer.signedIn ? (
            <>
              <span className="text-bdt-muted">{viewer.name}</span>
              <button type="button" onClick={signOut} className="text-bdt-muted hover:text-bdt-red underline-offset-4 hover:underline">
                Sign out
              </button>
            </>
          ) : (
            <Link href="/signin?next=/ryder-cup" className="text-bdt-muted hover:text-bdt-cream underline-offset-4 hover:underline">
              Sign in
            </Link>
          )}
        </div>
      </div>

      {!ready ? (
        <div className="bdt-card p-8 text-center text-bdt-muted">
          The Ryder Cup season has not been set up yet.
          {viewer.canManage && (
            <>
              {' '}
              <Link href="/ryder-cup/manage" className="text-bdt-cream underline underline-offset-4">
                Set up the teams
              </Link>
              .
            </>
          )}
        </div>
      ) : (
        <>
          {editing !== null && viewer.canReport ? (
            <MatchForm
              key={editing === 'new' ? 'new' : editing.id}
              teams={state.teams}
              match={editing === 'new' ? undefined : editing}
              onCancel={() => setEditing(null)}
              onSaved={() => {
                setEditing(null);
                mutate();
                // The result is also a feed story; refresh the ticker's copy.
                mutateGlobal(FEED_KEY);
              }}
            />
          ) : (
            viewer.canReport && (
              <button
                type="button"
                onClick={() => openForm('new')}
                className="bg-bdt-red text-white px-5 py-3 font-display tracking-[0.2em] text-lg rounded-sm hover:bg-bdt-redDeep transition-colors self-start"
              >
                + Add match or result
              </button>
            )
          )}

          <Scoreboard state={state} />

          {upcoming.length > 0 && (
            <section className="flex flex-col gap-3">
              <h3 className="font-display tracking-[0.25em] text-xl text-bdt-cream">
                <span className="bdt-rule" />
                UPCOMING
              </h3>
              <ol className="flex flex-col gap-3">
                {upcoming.map((m) => (
                  <MatchCard
                    key={m.id}
                    match={m}
                    teams={state.teams}
                    canReport={viewer.canReport}
                    onEdit={openForm}
                  />
                ))}
              </ol>
            </section>
          )}

          <section className="flex flex-col gap-3">
            <h3 className="font-display tracking-[0.25em] text-xl text-bdt-cream">
              <span className="bdt-rule" />
              RESULTS
            </h3>
            {results.length === 0 ? (
              <div className="bdt-card p-6 text-center text-bdt-muted">
                No results yet. They show up here as soon as a captain reports one.
              </div>
            ) : (
              <ol className="flex flex-col gap-3">
                {results.map((m) => (
                  <MatchCard
                    key={m.id}
                    match={m}
                    teams={state.teams}
                    canReport={viewer.canReport}
                    onEdit={openForm}
                  />
                ))}
              </ol>
            )}
          </section>

          <section className="flex flex-col gap-3">
            <h3 className="font-display tracking-[0.25em] text-xl text-bdt-cream">
              <span className="bdt-rule" />
              TEAMS
            </h3>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {state.teams.map((team) => (
                <TeamTable key={team.id} team={team} />
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
