'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { BdtLogo } from '@/components/BdtLogo';

type State = 'ready' | 'busy' | 'done' | 'error';

// Waits for a tap rather than acting on load, so a mail scanner that opens
// the link does not unsubscribe anyone.
function UnsubscribeForm() {
  const token = useSearchParams().get('token');
  const [state, setState] = useState<State>('ready');

  async function unsubscribe() {
    setState('busy');
    try {
      const res = await fetch('/api/notifications/unsubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      setState(res.ok ? 'done' : 'error');
    } catch {
      setState('error');
    }
  }

  return (
    <div className="bdt-card p-6 md:p-8 w-full max-w-sm flex flex-col gap-4 relative z-10">
      <div className="flex items-center gap-3">
        <BdtLogo className="h-14 w-auto" />
        <h1 className="font-display text-3xl tracking-[0.2em] text-bdt-cream glow-cream">EMAILS</h1>
      </div>

      {state === 'done' ? (
        <p className="text-bdt-cream">
          Done. You won&apos;t get Ryder Cup emails any more. You can turn them back on from the
          Ryder Cup page.
        </p>
      ) : !token || state === 'error' ? (
        <p role="alert" className="text-sm font-mono text-bdt-red">
          This unsubscribe link is not valid. Sign in and change your notifications on the Ryder
          Cup page instead.
        </p>
      ) : (
        <>
          <p className="text-bdt-muted">Stop all Ryder Cup emails to this address?</p>
          <button
            type="button"
            onClick={unsubscribe}
            disabled={state === 'busy'}
            className="bg-bdt-red text-white font-display tracking-[0.25em] text-lg py-3 rounded-sm disabled:opacity-50 hover:bg-bdt-redDeep transition-colors"
          >
            {state === 'busy' ? 'Working…' : 'Unsubscribe'}
          </button>
        </>
      )}

      <Link href="/ryder-cup" className="text-sm font-mono text-bdt-muted hover:text-bdt-cream">
        ← Ryder Cup
      </Link>
    </div>
  );
}

export default function UnsubscribePage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <Suspense fallback={null}>
        <UnsubscribeForm />
      </Suspense>
    </div>
  );
}
