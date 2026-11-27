'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { BdtLogo } from '@/components/BdtLogo';

type State =
  | { kind: 'ready' }
  | { kind: 'busy' }
  | { kind: 'pending'; name: string }
  | { kind: 'error'; message: string };

// The link lands here and waits for a tap, because mail scanners open links
// on their own and would otherwise use the one-time token up.
function VerifyForm() {
  const router = useRouter();
  const token = useSearchParams().get('token');
  const [state, setState] = useState<State>({ kind: 'ready' });

  async function finish() {
    setState({ kind: 'busy' });
    try {
      const res = await fetch('/api/session/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        status?: string;
        name?: string;
        error?: string;
      };
      if (json.status === 'ok') {
        router.replace('/ryder-cup');
        router.refresh();
        return;
      }
      if (json.status === 'pending') {
        setState({ kind: 'pending', name: json.name ?? 'your profile' });
        return;
      }
      setState({
        kind: 'error',
        message: json.error ?? 'This sign-in link has expired or was already used.',
      });
    } catch {
      setState({ kind: 'error', message: "Couldn't reach the server. Try again." });
    }
  }

  return (
    <div className="bdt-card p-6 md:p-8 w-full max-w-sm flex flex-col gap-4 relative z-10">
      <div className="flex items-center gap-3">
        <BdtLogo className="h-14 w-auto" />
        <h1 className="font-display text-3xl tracking-[0.2em] text-bdt-cream glow-cream">SIGN IN</h1>
      </div>

      {!token ? (
        <p className="text-bdt-red font-mono text-sm">This link is missing its sign-in code.</p>
      ) : state.kind === 'pending' ? (
        <>
          <p className="text-bdt-cream">Email confirmed for {state.name}.</p>
          <p className="text-sm text-bdt-muted">
            Because this profile can report Ryder Cup results, an admin has to approve the email
            before it can sign in. Ask an admin, then request a new link.
          </p>
        </>
      ) : (
        <>
          <p className="text-bdt-muted">Tap below to finish signing in on this device.</p>
          {state.kind === 'error' && (
            <p role="alert" className="text-sm font-mono text-bdt-red">
              {state.message}
            </p>
          )}
          <button
            type="button"
            onClick={finish}
            disabled={state.kind === 'busy'}
            className="bg-bdt-red text-white font-display tracking-[0.25em] text-lg py-3 rounded-sm disabled:opacity-50 hover:bg-bdt-redDeep transition-colors"
          >
            {state.kind === 'busy' ? 'Signing in…' : 'Sign in'}
          </button>
        </>
      )}

      {(state.kind === 'error' || state.kind === 'pending' || !token) && (
        <Link href="/signin" className="text-sm font-mono text-bdt-muted hover:text-bdt-cream">
          Request a new link
        </Link>
      )}
    </div>
  );
}

export default function VerifyPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <Suspense fallback={null}>
        <VerifyForm />
      </Suspense>
    </div>
  );
}
