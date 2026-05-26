'use client';

import useSWR from 'swr';
import clsx from 'clsx';
import type { RosterEntryDTO } from '@/types/golf';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function TrendIcon({ trend }: { trend: RosterEntryDTO['trend'] }) {
  if (trend === 'DOWN') return <span className="text-bdt-gold">▼</span>;
  if (trend === 'UP') return <span className="text-bdt-red">▲</span>;
  return <span className="text-bdt-muted">—</span>;
}

export function Leaderboard() {
  const { data } = useSWR<{ roster: RosterEntryDTO[] }>('/api/roster', fetcher, {
    refreshInterval: 60_000,
    revalidateOnFocus: false,
  });
  const roster = data?.roster ?? [];

  return (
    <aside className="bdt-card p-4 h-full">
      <header className="flex items-center justify-between mb-3">
        <h2 className="font-display tracking-[0.25em] text-xl text-bdt-cream">
          <span className="bdt-rule" />
          ROSTER · INDEX
        </h2>
        <span className="text-[10px] font-mono uppercase tracking-widest text-bdt-muted">
          Sorted Low → High
        </span>
      </header>

      {roster.length === 0 ? (
        <p className="text-bdt-muted text-sm">
          Roster is empty. Add golfers via the Admin CMS.
        </p>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-[10px] uppercase tracking-widest text-bdt-muted">
            <tr>
              <th className="text-left py-1">Pos</th>
              <th className="text-left py-1">Player</th>
              <th className="text-right py-1">Index</th>
              <th className="text-right py-1">Trend</th>
            </tr>
          </thead>
          <tbody>
            {roster.map((g, i) => (
              <tr key={g.id} className="border-t border-bdt-border/60">
                <td className="py-2 font-mono text-bdt-muted">{i + 1}</td>
                <td className="py-2">
                  <div className="font-display tracking-wide text-base text-white">
                    {g.fullName}
                  </div>
                  {g.club && <div className="text-xs text-bdt-muted">{g.club}</div>}
                </td>
                <td className="py-2 text-right font-mono text-bdt-cream glow-cream">
                  {g.handicapIndex}
                </td>
                <td className="py-2 text-right font-mono">
                  <span className="inline-flex items-center gap-1">
                    <TrendIcon trend={g.trend} />
                    <span
                      className={clsx(
                        g.trend === 'DOWN' && 'text-bdt-gold',
                        g.trend === 'UP' && 'text-bdt-red',
                        g.trend === 'FLAT' && 'text-bdt-muted',
                      )}
                    >
                      {g.trendDelta > 0 ? `+${g.trendDelta.toFixed(1)}` : g.trendDelta.toFixed(1)}
                    </span>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </aside>
  );
}
