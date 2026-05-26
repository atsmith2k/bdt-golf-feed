'use client';

import useSWR from 'swr';
import { useState } from 'react';

interface AuthStatus {
  hasToken: boolean;
  acquiredAt: string | null;
  expiresAt: string | null;
  expiresInSeconds: number | null;
  isExpired: boolean;
  username: string | null;
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function formatTtl(seconds: number | null): string {
  if (seconds == null) return '—';
  if (seconds <= 0) return 'expired';
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m ${seconds % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

export function GhinAuthPanel() {
  const { data, mutate } = useSWR<{ status: AuthStatus }>('/api/ghin/auth', fetcher, {
    refreshInterval: 60_000,
  });
  const status = data?.status;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/ghin/auth', { method: 'POST' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Refresh failed');
      mutate();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Refresh failed');
    } finally {
      setBusy(false);
    }
  }

  const stateLabel = !status
    ? 'Loading…'
    : !status.hasToken
      ? 'No token'
      : status.isExpired
        ? 'Expired'
        : 'Active';

  const stateColor = !status
    ? 'text-bdt-muted'
    : !status.hasToken || status.isExpired
      ? 'text-bdt-red'
      : 'text-bdt-cream';

  return (
    <section className="bdt-card p-5 flex flex-col gap-3">
      <header className="flex items-center justify-between">
        <h2 className="font-display tracking-[0.25em] text-xl text-bdt-cream">
          <span className="bdt-rule" />
          GHIN AUTH
        </h2>
        <button
          onClick={refresh}
          disabled={busy}
          className="bg-bdt-red text-white px-3 py-1.5 font-display tracking-[0.2em] text-sm disabled:opacity-50 hover:bg-bdt-redDeep transition-colors"
        >
          {busy ? 'Refreshing…' : 'Refresh Token'}
        </button>
      </header>

      <dl className="grid grid-cols-2 gap-y-1 text-sm font-mono">
        <dt className="text-bdt-muted">Status</dt>
        <dd className={`text-right ${stateColor}`}>{stateLabel}</dd>

        <dt className="text-bdt-muted">User</dt>
        <dd className="text-right text-white truncate">{status?.username ?? '—'}</dd>

        <dt className="text-bdt-muted">Acquired</dt>
        <dd className="text-right text-white">
          {status?.acquiredAt ? new Date(status.acquiredAt).toLocaleString() : '—'}
        </dd>

        <dt className="text-bdt-muted">Expires</dt>
        <dd className="text-right text-white">
          {status?.expiresAt ? new Date(status.expiresAt).toLocaleString() : '—'}
        </dd>

        <dt className="text-bdt-muted">Time left</dt>
        <dd className="text-right text-white">{formatTtl(status?.expiresInSeconds ?? null)}</dd>
      </dl>

      {error && <p className="text-sm font-mono text-bdt-red">{error}</p>}

      {status && !status.hasToken && (
        <p className="text-xs font-mono text-bdt-muted">
          The server hasn't acquired a token yet. Confirm GHIN_USERNAME and GHIN_PASSWORD are set in
          your .env, then click Refresh Token.
        </p>
      )}
    </section>
  );
}
