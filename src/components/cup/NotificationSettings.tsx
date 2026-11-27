'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';

interface NotificationInfo {
  pushPublicKey: string | null;
  emailConfigured: boolean;
  email: { address: string | null; notifyResults: boolean; notifyWeekly: boolean } | null;
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const BUTTON =
  'border border-bdt-cream text-bdt-cream px-3 py-2 text-xs font-mono uppercase tracking-widest rounded-sm disabled:opacity-50 hover:bg-bdt-cream hover:text-bdt-bg transition-colors';

/** VAPID keys travel as URL-safe base64; the browser wants the raw bytes. */
function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const base64 = (base64url + '='.repeat((4 - (base64url.length % 4)) % 4))
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const raw = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

type PushState = 'checking' | 'unsupported' | 'blocked' | 'off' | 'on';

function PushToggle({ publicKey }: { publicKey: string }) {
  const [state, setState] = useState<PushState>('checking');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
        if (!cancelled) setState('unsupported');
        return;
      }
      if (Notification.permission === 'denied') {
        if (!cancelled) setState('blocked');
        return;
      }
      const registration = await navigator.serviceWorker.getRegistration('/sw.js');
      const existing = await registration?.pushManager.getSubscription();
      if (!cancelled) setState(existing ? 'on' : 'off');
    })().catch(() => {
      if (!cancelled) setState('unsupported');
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function turnOn() {
    setBusy(true);
    setError(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setState(permission === 'denied' ? 'blocked' : 'off');
        return;
      }
      const registration = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;
      const subscription =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: keyBytes(publicKey),
        }));
      const res = await fetch('/api/notifications/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(subscription.toJSON()),
      });
      if (!res.ok) throw new Error('The server could not save this device.');
      setState('on');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not turn notifications on.');
    } finally {
      setBusy(false);
    }
  }

  async function turnOff() {
    setBusy(true);
    setError(null);
    try {
      const registration = await navigator.serviceWorker.getRegistration('/sw.js');
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        await fetch('/api/notifications/push', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
        await subscription.unsubscribe();
      }
      setState('off');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not turn notifications off.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-white">Notifications on this device</div>
          <div className="text-sm text-bdt-muted">
            {state === 'on'
              ? 'On. Results and the weekly recap arrive as they happen.'
              : state === 'unsupported'
                ? 'This browser cannot do it. On an iPhone, add this site to your Home Screen first, then open it from there.'
                : state === 'blocked'
                  ? 'Blocked in this browser. Allow notifications for this site in its settings, then reload.'
                  : 'Get each result and the weekly recap as a notification.'}
          </div>
        </div>
        {(state === 'on' || state === 'off') && (
          <button type="button" onClick={state === 'on' ? turnOff : turnOn} disabled={busy} className={BUTTON}>
            {busy ? 'Working…' : state === 'on' ? 'Turn off' : 'Turn on'}
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="text-sm font-mono text-bdt-red">
          {error}
        </p>
      )}
    </div>
  );
}

function EmailToggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-3 cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 h-5 w-5 accent-bdt-red shrink-0"
      />
      <span>
        <span className="block text-white">{label}</span>
        <span className="block text-sm text-bdt-muted">{hint}</span>
      </span>
    </label>
  );
}

/** Push for this device and, for a signed-in golfer, the two email choices. */
export function NotificationSettings() {
  const { data, mutate } = useSWR<NotificationInfo>('/api/notifications', fetcher, {
    revalidateOnFocus: false,
  });
  const [error, setError] = useState<string | null>(null);

  async function setEmail(patch: { notifyResults?: boolean; notifyWeekly?: boolean }) {
    if (!data?.email) return;
    setError(null);
    // Show the new choice at once; put it back if the save fails.
    const next = { ...data, email: { ...data.email, ...patch } };
    try {
      await mutate(
        async () => {
          const res = await fetch('/api/notifications', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(patch),
          });
          if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Save failed');
          return next;
        },
        { optimisticData: next, rollbackOnError: true, revalidate: false },
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save.');
    }
  }

  if (!data) return null;
  const nothingOffered = !data.pushPublicKey && !data.emailConfigured;
  if (nothingOffered) return null;

  return (
    <details className="bdt-card">
      <summary className="cursor-pointer px-4 py-3 font-display tracking-[0.2em] text-base text-bdt-cream">
        Notifications
      </summary>
      <div className="px-4 pb-4 flex flex-col gap-4">
        {data.pushPublicKey && <PushToggle publicKey={data.pushPublicKey} />}

        {data.emailConfigured &&
          (data.email?.address ? (
            <div className="flex flex-col gap-3 border-t border-bdt-border/60 pt-4">
              <div className="text-xs font-mono text-bdt-muted break-all">
                Email to {data.email.address}
              </div>
              <EmailToggle
                label="Every result"
                hint="An email each time a match result is reported."
                checked={data.email.notifyResults}
                onChange={(v) => setEmail({ notifyResults: v })}
              />
              <EmailToggle
                label="Weekly recap"
                hint="One email on Monday morning with the week's results and what is coming up."
                checked={data.email.notifyWeekly}
                onChange={(v) => setEmail({ notifyWeekly: v })}
              />
              {error && (
                <p role="alert" className="text-sm font-mono text-bdt-red">
                  {error}
                </p>
              )}
            </div>
          ) : data.email ? (
            <p className="text-sm text-bdt-muted border-t border-bdt-border/60 pt-4">
              Your profile has no email address yet. Ask an admin to add one to get results or the
              weekly recap by email.
            </p>
          ) : (
            <p className="text-sm text-bdt-muted border-t border-bdt-border/60 pt-4">
              <Link href="/signin?next=/ryder-cup" className="text-bdt-cream underline underline-offset-4">
                Sign in
              </Link>{' '}
              to get results or the weekly recap by email.
            </p>
          ))}
      </div>
    </details>
  );
}
