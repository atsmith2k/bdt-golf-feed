'use client';

import { useEffect, useState } from 'react';
import type { CupAdminGolferDTO, CupStateDTO } from '@/types/cup';

type Order = 'SNAKE' | 'ALTERNATE';
interface Settings {
  /** Index (0 or 1) of the team with the first pick. */
  first: number;
  order: Order;
}

const DEFAULTS: Settings = { first: 0, order: 'SNAKE' };

/** Which team (0 or 1) makes overall pick number `pick` (1-based). */
export function teamOnTheClock(pick: number, settings: Settings): number {
  const k = pick - 1;
  if (settings.order === 'ALTERNATE') return (settings.first + k) % 2;
  // Snake: 1-2, 2-1, 1-2...
  const firstOfRound = Math.floor(k / 2) % 2 === 0 ? settings.first : 1 - settings.first;
  return k % 2 === 0 ? firstOfRound : 1 - firstOfRound;
}

interface Props {
  seasonId: string;
  teams: CupStateDTO['teams'];
  golfers: CupAdminGolferDTO[];
  /** Saves a pick, or undoes one with teamId null. Rejects on failure. */
  assign: (golferId: string, teamId: string | null, draftPick: number | null) => Promise<void>;
}

/**
 * Run the draft: the team on the clock taps a golfer and the pick is saved
 * with its number. Captains are already on their teams and are not picks.
 */
export function DraftBoard({ seasonId, teams, golfers, assign }: Props) {
  const storageKey = `bdt-draft-${seasonId}`;
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The order is a per-device note for whoever runs the draft; the picks
  // themselves are saved on the server.
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) ?? 'null') as Partial<Settings> | null;
      if (saved && (saved.first === 0 || saved.first === 1) && (saved.order === 'SNAKE' || saved.order === 'ALTERNATE')) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setSettings({ first: saved.first, order: saved.order });
      }
    } catch {
      // No storage: the defaults stand.
    }
  }, [storageKey]);

  function changeSettings(next: Settings) {
    setSettings(next);
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      // Not saved; it still applies for this visit.
    }
  }

  const picks = golfers
    .filter((g) => g.draftPick !== null)
    .sort((x, y) => (x.draftPick ?? 0) - (y.draftPick ?? 0));
  const available = golfers
    .filter((g) => g.teamId === null)
    .sort((x, y) => Number.parseFloat(x.handicapIndex.replace('+', '-')) - Number.parseFloat(y.handicapIndex.replace('+', '-')));
  const nextPick = (picks[picks.length - 1]?.draftPick ?? 0) + 1;
  const onClock = teams[teamOnTheClock(nextPick, settings)];
  const lastPick = picks[picks.length - 1];

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not save.');
    } finally {
      setBusy(false);
    }
  }

  if (teams.length !== 2) {
    return <p className="text-sm text-bdt-muted">Create the season and its teams first.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-mono uppercase tracking-widest text-bdt-muted">First pick</span>
          <select
            value={settings.first}
            disabled={picks.length > 0}
            onChange={(e) => changeSettings({ ...settings, first: Number(e.target.value) })}
            className="bg-bdt-bg border border-bdt-border rounded-sm px-3 py-2 text-white text-sm disabled:opacity-60"
          >
            {teams.map((t, i) => (
              <option key={t.id} value={i}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-mono uppercase tracking-widest text-bdt-muted">Order</span>
          <select
            value={settings.order}
            disabled={picks.length > 0}
            onChange={(e) => changeSettings({ ...settings, order: e.target.value as Order })}
            className="bg-bdt-bg border border-bdt-border rounded-sm px-3 py-2 text-white text-sm disabled:opacity-60"
          >
            <option value="SNAKE">Snake (1-2, 2-1)</option>
            <option value="ALTERNATE">Alternating (1-2, 1-2)</option>
          </select>
        </label>
        {lastPick && (
          <button
            type="button"
            disabled={busy}
            onClick={() => run(() => assign(lastPick.id, null, null))}
            className="border border-bdt-muted text-bdt-muted px-3 py-2 text-xs font-mono rounded-sm disabled:opacity-50 hover:bg-bdt-muted hover:text-bdt-bg transition-colors"
          >
            Undo pick {lastPick.draftPick} ({lastPick.fullName})
          </button>
        )}
      </div>

      {available.length > 0 ? (
        <div className="flex flex-col gap-2">
          <div
            className="font-display tracking-[0.15em] text-lg text-white pl-3 border-l-4"
            style={{ borderColor: onClock.color }}
            aria-live="polite"
          >
            Pick {nextPick}: {onClock.name} are on the clock
          </div>
          <div className="flex flex-wrap gap-2">
            {available.map((g) => (
              <button
                key={g.id}
                type="button"
                disabled={busy}
                onClick={() => run(() => assign(g.id, onClock.id, nextPick))}
                className="px-3 py-2 rounded-sm border border-bdt-border text-sm text-bdt-cream hover:border-bdt-cream disabled:opacity-50"
              >
                {g.fullName}
                <span className="ml-2 font-mono text-xs text-bdt-muted">{g.handicapIndex}</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-sm text-bdt-muted">Everyone on the roster is on a team.</p>
      )}

      {error && (
        <p role="alert" className="text-sm font-mono text-bdt-red">
          {error}
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {teams.map((team) => {
          const roster = golfers.filter((g) => g.teamId === team.id);
          const undrafted = roster.filter((g) => g.draftPick === null);
          const drafted = roster
            .filter((g) => g.draftPick !== null)
            .sort((x, y) => (x.draftPick ?? 0) - (y.draftPick ?? 0));
          return (
            <div key={team.id} className="min-w-0">
              <div
                className="font-display tracking-[0.15em] text-base text-white pl-3 border-l-4 mb-2"
                style={{ borderColor: team.color }}
              >
                {team.name}
              </div>
              <ol className="flex flex-col gap-1 text-sm">
                {undrafted.map((g) => (
                  <li key={g.id} className="flex gap-3">
                    <span className="font-mono text-bdt-muted w-10 shrink-0">
                      {g.id === team.captainId ? 'C' : '—'}
                    </span>
                    <span className="text-bdt-cream">{g.fullName}</span>
                  </li>
                ))}
                {drafted.map((g) => (
                  <li key={g.id} className="flex gap-3">
                    <span className="font-mono text-bdt-muted w-10 shrink-0">#{g.draftPick}</span>
                    <span className="text-bdt-cream">{g.fullName}</span>
                  </li>
                ))}
                {roster.length === 0 && <li className="text-bdt-muted">Nobody yet.</li>}
              </ol>
            </div>
          );
        })}
      </div>
    </div>
  );
}
