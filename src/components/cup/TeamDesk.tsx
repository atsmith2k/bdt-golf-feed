'use client';

import { useState } from 'react';
import useSWR from 'swr';
import type { CupTeamDTO } from '@/types/cup';

interface Available {
  id: string;
  fullName: string;
  handicapIndex: string;
}

const fetcher = async (url: string) => {
  const res = await fetch(url);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status})`);
  return json;
};

async function send(method: string, body: unknown) {
  const res = await fetch('/api/cup/team', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status})`);
}

const INPUT =
  'bg-bdt-bg border border-bdt-border rounded-sm px-3 py-2 text-white focus:border-bdt-red outline-none';
const LABEL = 'text-[10px] font-mono uppercase tracking-widest text-bdt-muted';
const BUTTON =
  'border border-bdt-cream text-bdt-cream px-3 py-2 text-xs font-mono uppercase tracking-widest rounded-sm disabled:opacity-50 hover:bg-bdt-cream hover:text-bdt-bg transition-colors';

/** What a captain can do for their own team: name it, colour it, set the roster. */
export function TeamDesk({ team, onChanged }: { team: CupTeamDTO; onChanged: () => void }) {
  const { data, mutate } = useSWR<{ available: Available[] }>('/api/cup/team', fetcher, {
    revalidateOnFocus: false,
  });
  const [name, setName] = useState(team.nameTbd ? '' : team.name);
  const [color, setColor] = useState(team.color);
  const [adding, setAdding] = useState('');
  // Open to start with while the team still needs a name; after that the
  // captain opens and closes it.
  const [open, setOpen] = useState(team.nameTbd);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function run(action: () => Promise<void>, done: string) {
    setBusy(true);
    setMessage(null);
    try {
      await action();
      setMessage({ ok: true, text: done });
      onChanged();
      mutate();
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : 'That did not save.' });
    } finally {
      setBusy(false);
    }
  }

  const savedName = team.nameTbd ? '' : team.name;
  const identityChanged = name.trim() !== savedName || color.toUpperCase() !== team.color.toUpperCase();
  const available = data?.available ?? [];

  return (
    <details className="bdt-card" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary className="cursor-pointer px-4 py-3 font-display tracking-[0.2em] text-base text-bdt-cream">
        Your team: {team.name}
      </summary>
      <div className="px-4 pb-4 flex flex-col gap-5">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            run(() => send('PATCH', { name: name.trim(), color }), 'Team saved.');
          }}
          className="flex flex-wrap items-end gap-3"
        >
          <label className="flex flex-col gap-1 flex-1 min-w-[12rem]">
            <span className={LABEL}>Team name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="To be decided"
              maxLength={40}
              className={INPUT}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className={LABEL}>Colour</span>
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="h-10 w-14 bg-bdt-bg border border-bdt-border rounded-sm p-1"
            />
          </label>
          <button type="submit" disabled={busy || !identityChanged} className={BUTTON}>
            Save
          </button>
        </form>

        <div className="flex flex-col gap-2">
          <span className={LABEL}>Roster ({team.members.length})</span>
          <ul className="flex flex-col">
            {team.members.map((m) => (
              <li
                key={m.golferId}
                className="flex items-center justify-between gap-3 border-t border-bdt-border/60 py-2"
              >
                <span className="text-white">
                  {m.fullName}
                  <span className="ml-2 font-mono text-xs text-bdt-muted">{m.handicapIndex}</span>
                  {m.isCaptain && <span className="ml-2 bdt-chip bg-bdt-gold text-black">Captain</span>}
                </span>
                {!m.isCaptain && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      if (!confirm(`Take ${m.fullName} off the team?`)) return;
                      run(
                        () => send('PUT', { golferId: m.golferId, action: 'remove' }),
                        `${m.fullName} is off the team.`,
                      );
                    }}
                    className="text-xs font-mono text-bdt-muted hover:text-bdt-red underline-offset-4 hover:underline disabled:opacity-50"
                  >
                    Remove
                  </button>
                )}
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-end gap-3 pt-1">
            <label className="flex flex-col gap-1 flex-1 min-w-[12rem]">
              <span className={LABEL}>Add a player</span>
              <select value={adding} onChange={(e) => setAdding(e.target.value)} className={INPUT}>
                <option value="">
                  {available.length ? 'Choose a golfer…' : 'Everyone is on a team'}
                </option>
                {available.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.fullName} ({g.handicapIndex})
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              disabled={busy || !adding}
              onClick={() => {
                const golfer = available.find((g) => g.id === adding);
                setAdding('');
                run(
                  () => send('PUT', { golferId: adding, action: 'add' }),
                  `${golfer?.fullName ?? 'Player'} added.`,
                );
              }}
              className={BUTTON}
            >
              Add
            </button>
          </div>
          <p className="text-xs text-bdt-muted">
            You can add golfers who are on neither team. Moving a player between teams is done by an
            admin.
          </p>
        </div>

        {message && (
          <p
            role={message.ok ? 'status' : 'alert'}
            className={`text-sm font-mono ${message.ok ? 'text-bdt-cream' : 'text-bdt-red'}`}
          >
            {message.text}
          </p>
        )}
      </div>
    </details>
  );
}
