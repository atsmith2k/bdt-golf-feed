'use client';

import { useState } from 'react';
import clsx from 'clsx';
import { CUP_FORMATS, type CupMatchDTO, type CupTeamDTO } from '@/types/cup';

const INPUT =
  'w-full bg-bdt-bg border border-bdt-border rounded-sm px-3 py-2 text-white focus:border-bdt-red outline-none';
const LABEL = 'text-[10px] font-mono uppercase tracking-widest text-bdt-muted';

function today(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

interface Props {
  teams: CupTeamDTO[];
  /** The match being reported or edited; omit to add a new one. */
  match?: CupMatchDTO;
  onSaved: () => void;
  onCancel: () => void;
}

/**
 * One form for everything a reporter does to a match: add it, schedule it,
 * post its result, correct it or delete it. Only the format, the players and
 * who won are needed to post a result; the rest is optional.
 */
export function MatchForm({ teams, match, onSaved, onCancel }: Props) {
  const presetLabels = CUP_FORMATS.map((f) => f.label as string);
  const [format, setFormat] = useState(match?.format ?? 'Singles');
  const [customFormat, setCustomFormat] = useState(
    match && !presetLabels.includes(match.format),
  );
  const [points, setPoints] = useState(String(match?.points ?? 1));
  const [selected, setSelected] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      (match?.sides ?? []).flatMap((s) => s.players.map((p) => [p.golferId, s.teamId])),
    ),
  );
  // A team id, 'HALVED', or null for "not played yet".
  const [result, setResult] = useState<string | null>(
    match?.status === 'FINAL' ? (match.winnerTeamId ?? 'HALVED') : null,
  );
  const [margin, setMargin] = useState(match?.margin ?? '');
  const [playDate, setPlayDate] = useState(match?.playDate ?? '');
  const [course, setCourse] = useState(match?.course ?? '');
  const [sessionName, setSessionName] = useState(match?.sessionName ?? '');
  const [notes, setNotes] = useState(match?.notes ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const perSide = CUP_FORMATS.find((f) => f.label === format)?.perSide;
  const countFor = (teamId: string) =>
    Object.values(selected).filter((id) => id === teamId).length;

  function togglePlayer(golferId: string, teamId: string) {
    setSelected((prev) => {
      const next = { ...prev };
      if (next[golferId]) delete next[golferId];
      else next[golferId] = teamId;
      return next;
    });
  }

  const pointsValue = Number(points);
  const missingSide = teams.find((t) => countFor(t.id) === 0);
  const problem = !format.trim()
    ? 'Name the format.'
    : !(pointsValue > 0)
      ? 'Points must be more than zero.'
      : result !== null && missingSide
        ? `Pick who played for ${missingSide.name}.`
        : null;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const body = {
        format: format.trim(),
        points: pointsValue,
        players: Object.entries(selected).map(([golferId, teamId]) => ({ golferId, teamId })),
        result,
        margin: result && result !== 'HALVED' ? margin : null,
        // A result with no date was played today.
        playDate: playDate || (result !== null ? today() : null),
        course,
        sessionName,
        notes,
      };
      const res = await fetch(match ? `/api/cup/matches/${match.id}` : '/api/cup/matches', {
        method: match ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? 'Could not save the match.');
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the match.');
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!match) return;
    const what = match.status === 'FINAL' ? 'This removes the match and its points.' : 'This removes the match from the schedule.';
    if (!confirm(`Delete this match? ${what}`)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/cup/matches/${match.id}`, { method: 'DELETE' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? 'Could not delete the match.');
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete the match.');
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="bdt-card p-4 md:p-5 flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-display tracking-[0.2em] text-xl text-bdt-cream">
          <span className="bdt-rule" />
          {match ? (match.status === 'FINAL' ? 'EDIT RESULT' : 'REPORT MATCH') : 'ADD MATCH'}
        </h3>
        <button
          type="button"
          onClick={onCancel}
          className="text-xs font-mono uppercase tracking-widest text-bdt-muted hover:text-bdt-cream"
        >
          Cancel
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-4">
        <div className="flex flex-col gap-2">
          <span className={LABEL}>Format</span>
          <div className="flex flex-wrap gap-2">
            {presetLabels.map((label) => (
              <button
                key={label}
                type="button"
                aria-pressed={!customFormat && format === label}
                onClick={() => {
                  setCustomFormat(false);
                  setFormat(label);
                }}
                className={clsx(
                  'px-3 py-2 rounded-sm border font-display tracking-[0.15em] text-sm',
                  !customFormat && format === label
                    ? 'bg-bdt-cream text-bdt-bg border-bdt-cream'
                    : 'border-bdt-border text-bdt-cream hover:border-bdt-borderStrong',
                )}
              >
                {label}
              </button>
            ))}
            <button
              type="button"
              aria-pressed={customFormat}
              onClick={() => {
                setCustomFormat(true);
                if (presetLabels.includes(format)) setFormat('');
              }}
              className={clsx(
                'px-3 py-2 rounded-sm border font-display tracking-[0.15em] text-sm',
                customFormat
                  ? 'bg-bdt-cream text-bdt-bg border-bdt-cream'
                  : 'border-bdt-border text-bdt-cream hover:border-bdt-borderStrong',
              )}
            >
              Other
            </button>
          </div>
          {customFormat && (
            <input
              value={format}
              onChange={(e) => setFormat(e.target.value)}
              placeholder="Format name, e.g. Shamble"
              maxLength={40}
              aria-label="Format name"
              className={INPUT}
            />
          )}
        </div>
        <label className="flex flex-col gap-2 sm:w-28">
          <span className={LABEL}>Points</span>
          <input
            type="number"
            inputMode="decimal"
            min="0.5"
            step="0.5"
            value={points}
            onChange={(e) => setPoints(e.target.value)}
            className={`${INPUT} font-mono`}
          />
        </label>
      </div>

      <div className="flex flex-col gap-2">
        <span className={LABEL}>
          Players{perSide ? ` · ${perSide} a side` : ''}
        </span>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {teams.map((team) => (
            <fieldset key={team.id} className="flex flex-col gap-2 min-w-0">
              <legend
                className="font-display tracking-[0.15em] text-base text-white pl-2 border-l-4 mb-2"
                style={{ borderColor: team.color }}
              >
                {team.name}
                <span className="ml-2 text-xs font-mono text-bdt-muted">{countFor(team.id)} picked</span>
              </legend>
              {team.members.length === 0 ? (
                <p className="text-sm text-bdt-muted">No players on this team yet.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {team.members.map((m) => {
                    const on = selected[m.golferId] === team.id;
                    return (
                      <button
                        key={m.golferId}
                        type="button"
                        aria-pressed={on}
                        onClick={() => togglePlayer(m.golferId, team.id)}
                        className={clsx(
                          'px-3 py-2 rounded-sm border text-sm text-left',
                          on ? 'text-white' : 'border-bdt-border text-bdt-cream hover:border-bdt-borderStrong',
                        )}
                        style={on ? { backgroundColor: team.color, borderColor: team.color } : undefined}
                      >
                        {m.fullName}
                        <span className={clsx('ml-2 font-mono text-xs', on ? 'text-white/80' : 'text-bdt-muted')}>
                          {m.handicapIndex}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </fieldset>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span className={LABEL}>Result · leave unpicked to put it on the schedule</span>
        <div className="grid grid-cols-3 gap-2">
          {[teams[0], null, teams[1]].map((team) => {
            const value = team ? team.id : 'HALVED';
            const on = result === value;
            return (
              <button
                key={value}
                type="button"
                aria-pressed={on}
                onClick={() => setResult(on ? null : value)}
                className={clsx(
                  'min-h-14 px-2 py-3 rounded-sm border font-display tracking-[0.12em] text-base leading-tight',
                  on
                    ? team
                      ? 'text-white'
                      : 'bg-bdt-cream text-bdt-bg border-bdt-cream'
                    : 'border-bdt-border text-bdt-cream hover:border-bdt-borderStrong',
                )}
                style={on && team ? { backgroundColor: team.color, borderColor: team.color } : undefined}
              >
                {team ? `${team.name} won` : 'Halved'}
              </button>
            );
          })}
        </div>
        {result !== null && result !== 'HALVED' && (
          <input
            value={margin}
            onChange={(e) => setMargin(e.target.value)}
            placeholder="Margin, e.g. 3&2 or 1 up (optional)"
            maxLength={20}
            aria-label="Margin (optional)"
            className={INPUT}
          />
        )}
      </div>

      <details className="group" open={Boolean(match && (match.course || match.sessionName || match.notes))}>
        <summary className="cursor-pointer text-xs font-mono uppercase tracking-widest text-bdt-muted hover:text-bdt-cream">
          Date, course and notes (optional)
        </summary>
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">
            <span className={LABEL}>Date</span>
            <input
              type="date"
              value={playDate}
              onChange={(e) => setPlayDate(e.target.value)}
              className={`${INPUT} font-mono`}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className={LABEL}>Session</span>
            <input
              value={sessionName}
              onChange={(e) => setSessionName(e.target.value)}
              placeholder="e.g. Week 3"
              maxLength={40}
              className={INPUT}
            />
          </label>
          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className={LABEL}>Course</span>
            <input
              value={course}
              onChange={(e) => setCourse(e.target.value)}
              maxLength={80}
              className={INPUT}
            />
          </label>
          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className={LABEL}>Notes</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={500}
              rows={2}
              className={INPUT}
            />
          </label>
        </div>
      </details>

      {error && (
        <p role="alert" className="text-sm font-mono text-bdt-red">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="submit"
          disabled={busy}
          className="bg-bdt-red text-white px-5 py-3 font-display tracking-[0.2em] text-base rounded-sm disabled:opacity-50 hover:bg-bdt-redDeep transition-colors"
        >
          {busy ? 'Saving…' : result !== null ? 'Post result' : 'Save to schedule'}
        </button>
        {match && (
          <button
            type="button"
            onClick={remove}
            disabled={busy}
            className="text-xs font-mono uppercase tracking-widest text-bdt-muted hover:text-bdt-red disabled:opacity-50"
          >
            Delete match
          </button>
        )}
      </div>
    </form>
  );
}
