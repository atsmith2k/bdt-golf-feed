'use client';

import useSWR from 'swr';
import { useState } from 'react';
import { GhinAuthPanel } from './GhinAuthPanel';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface RosterRow {
  id: string;
  ghinNumber: string;
  fullName: string;
  handicapIndex: string;
  club: string | null;
  lastSyncedAt: string;
}

export function AdminControls() {
  const { data, mutate, isLoading } = useSWR<{ golfers: RosterRow[] }>(
    '/api/golfers',
    fetcher,
    { refreshInterval: 30_000 },
  );

  const [ghin, setGhin] = useState('');
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const [headline, setHeadline] = useState('');
  const [details, setDetails] = useState('');
  const [importance, setImportance] = useState<'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'>('HIGH');

  async function addGolfer(e: React.FormEvent) {
    e.preventDefault();
    setBusyKey('add');
    setMessage(null);
    try {
      const res = await fetch('/api/golfers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ghinNumber: ghin.trim() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Failed to add golfer');
      setGhin('');
      setMessage({ kind: 'ok', text: `Added ${json.result.fullName}.` });
      mutate();
    } catch (err) {
      setMessage({ kind: 'err', text: err instanceof Error ? err.message : 'Add failed' });
    } finally {
      setBusyKey(null);
    }
  }

  async function syncOne(ghinNumber: string) {
    setBusyKey(`sync:${ghinNumber}`);
    setMessage(null);
    try {
      const res = await fetch(`/api/sync/${encodeURIComponent(ghinNumber)}`, { method: 'POST' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Sync failed');
      const r = json.result as {
        fullName: string;
        newScores: number;
        feedEventsCreated: number;
        backfilledScoreEvents: number;
      };
      const backfillSuffix =
        r.backfilledScoreEvents > 0 ? ` (incl. ${r.backfilledScoreEvents} backfilled)` : '';
      setMessage({
        kind: 'ok',
        text: `${r.fullName}: +${r.newScores} scores, +${r.feedEventsCreated} events${backfillSuffix}.`,
      });
      mutate();
    } catch (err) {
      setMessage({ kind: 'err', text: err instanceof Error ? err.message : 'Sync failed' });
    } finally {
      setBusyKey(null);
    }
  }

  async function syncAll() {
    setBusyKey('sync:all');
    setMessage(null);
    try {
      const res = await fetch('/api/sync', { method: 'POST' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Sync failed');
      const totalEvents = (json.results ?? []).reduce(
        (acc: number, r: { feedEventsCreated: number }) => acc + r.feedEventsCreated,
        0,
      );
      setMessage({
        kind: 'ok',
        text: `Synced ${json.results.length} golfers · ${totalEvents} new feed events.`,
      });
      mutate();
    } catch (err) {
      setMessage({ kind: 'err', text: err instanceof Error ? err.message : 'Sync failed' });
    } finally {
      setBusyKey(null);
    }
  }

  async function backfillAll() {
    setBusyKey('backfill:all');
    setMessage(null);
    try {
      const res = await fetch('/api/backfill', { method: 'POST' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Backfill failed');
      setMessage({
        kind: 'ok',
        text: `Backfilled ${json.results.length} golfers · ${json.totalEvents} new feed events.`,
      });
    } catch (err) {
      setMessage({ kind: 'err', text: err instanceof Error ? err.message : 'Backfill failed' });
    } finally {
      setBusyKey(null);
    }
  }

  async function backfillOne(ghinNumber: string) {
    setBusyKey(`backfill:${ghinNumber}`);
    setMessage(null);
    try {
      const res = await fetch(`/api/backfill/${encodeURIComponent(ghinNumber)}`, {
        method: 'POST',
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Backfill failed');
      setMessage({
        kind: 'ok',
        text: `${json.result.fullName}: ${json.result.feedEventsCreated} historical events added.`,
      });
    } catch (err) {
      setMessage({ kind: 'err', text: err instanceof Error ? err.message : 'Backfill failed' });
    } finally {
      setBusyKey(null);
    }
  }

  async function removeGolfer(ghinNumber: string) {
    if (!confirm(`Remove golfer ${ghinNumber} from the roster? This deletes their cached data.`)) {
      return;
    }
    setBusyKey(`del:${ghinNumber}`);
    try {
      const res = await fetch(`/api/golfers/${encodeURIComponent(ghinNumber)}`, {
        method: 'DELETE',
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Delete failed');
      setMessage({ kind: 'ok', text: `Removed ${ghinNumber}.` });
      mutate();
    } catch (err) {
      setMessage({ kind: 'err', text: err instanceof Error ? err.message : 'Delete failed' });
    } finally {
      setBusyKey(null);
    }
  }

  async function publishAnnouncement(e: React.FormEvent) {
    e.preventDefault();
    setBusyKey('announce');
    setMessage(null);
    try {
      const res = await fetch('/api/announcements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          headline: headline.trim(),
          details: details.trim() || null,
          importance,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Failed to post announcement');
      setHeadline('');
      setDetails('');
      setMessage({ kind: 'ok', text: 'Announcement published to feed.' });
    } catch (err) {
      setMessage({ kind: 'err', text: err instanceof Error ? err.message : 'Failed' });
    } finally {
      setBusyKey(null);
    }
  }

  async function logout() {
    await fetch('/api/auth', { method: 'DELETE' });
    window.location.href = '/admin/login';
  }

  const inputClass =
    'bg-bdt-bg border border-bdt-border px-3 py-2 font-mono text-white focus:border-bdt-red outline-none';

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1.4fr_1fr] gap-6">
      <section className="bdt-card p-5 flex flex-col gap-4">
        <header className="flex items-center justify-between">
          <h2 className="font-display tracking-[0.25em] text-xl text-bdt-cream">
            <span className="bdt-rule" />
            ROSTER
          </h2>
          <div className="flex items-center gap-3">
            <button
              onClick={backfillAll}
              disabled={busyKey === 'backfill:all'}
              className="border border-bdt-cream text-bdt-cream px-3 py-1.5 font-display tracking-[0.2em] text-sm disabled:opacity-50 hover:bg-bdt-cream hover:text-bdt-bg transition-colors"
              title="Replay cached scores into the feed (no GHIN call)"
            >
              {busyKey === 'backfill:all' ? 'Backfilling…' : 'Backfill Feed'}
            </button>
            <button
              onClick={syncAll}
              disabled={busyKey === 'sync:all'}
              className="bg-bdt-cream text-bdt-bg px-3 py-1.5 font-display tracking-[0.2em] text-sm disabled:opacity-50 hover:bg-white transition-colors"
            >
              {busyKey === 'sync:all' ? 'Syncing…' : 'Sync All'}
            </button>
            <button
              onClick={logout}
              className="text-xs font-mono text-bdt-muted hover:text-bdt-red"
            >
              Sign out
            </button>
          </div>
        </header>

        <form onSubmit={addGolfer} className="flex gap-2">
          <input
            value={ghin}
            onChange={(e) => setGhin(e.target.value)}
            placeholder="GHIN number"
            className={`flex-1 ${inputClass}`}
          />
          <button
            type="submit"
            disabled={busyKey === 'add' || ghin.trim().length === 0}
            className="bg-bdt-red text-white px-4 py-2 font-display tracking-[0.2em] text-sm disabled:opacity-50 hover:bg-bdt-redDeep transition-colors"
          >
            {busyKey === 'add' ? 'Adding…' : 'Add Golfer'}
          </button>
        </form>

        {message && (
          <p
            className={`text-sm font-mono ${
              message.kind === 'ok' ? 'text-bdt-cream' : 'text-bdt-red'
            }`}
          >
            {message.text}
          </p>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-[10px] uppercase tracking-widest text-bdt-muted">
              <tr>
                <th className="text-left py-2">Name</th>
                <th className="text-left py-2">GHIN</th>
                <th className="text-right py-2">Index</th>
                <th className="text-left py-2">Last Synced</th>
                <th className="text-right py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={5} className="py-4 text-bdt-muted">
                    Loading…
                  </td>
                </tr>
              )}
              {!isLoading && (data?.golfers ?? []).length === 0 && (
                <tr>
                  <td colSpan={5} className="py-4 text-bdt-muted">
                    No golfers yet. Add a GHIN number above.
                  </td>
                </tr>
              )}
              {(data?.golfers ?? []).map((g) => (
                <tr key={g.id} className="border-t border-bdt-border/60">
                  <td className="py-2 font-display text-base text-white">{g.fullName}</td>
                  <td className="py-2 font-mono text-bdt-muted">{g.ghinNumber}</td>
                  <td className="py-2 text-right font-mono text-bdt-cream">
                    {g.handicapIndex}
                  </td>
                  <td className="py-2 font-mono text-bdt-muted">
                    {new Date(g.lastSyncedAt).toLocaleString()}
                  </td>
                  <td className="py-2 text-right">
                    <div className="inline-flex gap-2">
                      <button
                        onClick={() => syncOne(g.ghinNumber)}
                        disabled={busyKey === `sync:${g.ghinNumber}`}
                        className="border border-bdt-cream text-bdt-cream px-2 py-1 text-xs font-mono disabled:opacity-50 hover:bg-bdt-cream hover:text-bdt-bg transition-colors"
                      >
                        {busyKey === `sync:${g.ghinNumber}` ? 'Syncing…' : 'Sync'}
                      </button>
                      <button
                        onClick={() => backfillOne(g.ghinNumber)}
                        disabled={busyKey === `backfill:${g.ghinNumber}`}
                        className="border border-bdt-muted text-bdt-muted px-2 py-1 text-xs font-mono disabled:opacity-50 hover:bg-bdt-muted hover:text-bdt-bg transition-colors"
                        title="Replay cached scores into the feed (no GHIN call)"
                      >
                        {busyKey === `backfill:${g.ghinNumber}` ? 'Backfilling…' : 'Backfill'}
                      </button>
                      <button
                        onClick={() => removeGolfer(g.ghinNumber)}
                        disabled={busyKey === `del:${g.ghinNumber}`}
                        className="border border-bdt-red text-bdt-red px-2 py-1 text-xs font-mono disabled:opacity-50 hover:bg-bdt-red hover:text-white transition-colors"
                      >
                        Remove
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="flex flex-col gap-6">
        <GhinAuthPanel />
        <section className="bdt-card p-5 flex flex-col gap-4">
          <h2 className="font-display tracking-[0.25em] text-xl text-bdt-cream">
            <span className="bdt-rule" />
            BREAKING NEWS
          </h2>
          <p className="text-xs font-mono text-bdt-muted">
            Inject a manual announcement into the live feed and ticker.
          </p>
          <form onSubmit={publishAnnouncement} className="flex flex-col gap-3">
            <input
              value={headline}
              onChange={(e) => setHeadline(e.target.value)}
              placeholder="Headline"
              maxLength={240}
              required
              className={inputClass}
            />
            <textarea
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder="Details (optional)"
              maxLength={500}
              rows={3}
              className={inputClass}
            />
            <label className="text-xs font-mono uppercase tracking-widest text-bdt-muted">
              Importance
            </label>
            <select
              value={importance}
              onChange={(e) => setImportance(e.target.value as typeof importance)}
              className={inputClass}
            >
              <option value="LOW">Low</option>
              <option value="MEDIUM">Medium</option>
              <option value="HIGH">High</option>
              <option value="CRITICAL">Critical</option>
            </select>
            <button
              type="submit"
              disabled={busyKey === 'announce' || headline.trim().length < 3}
              className="bg-bdt-red text-white px-4 py-2 font-display tracking-[0.25em] disabled:opacity-50 hover:bg-bdt-redDeep transition-colors"
            >
              {busyKey === 'announce' ? 'Publishing…' : 'Publish to Feed'}
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
