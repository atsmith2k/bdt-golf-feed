'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { BdtLogo } from '@/components/BdtLogo';

const INPUT =
  'bg-bdt-bg border border-bdt-border rounded-sm px-3 py-3 text-white focus:border-bdt-red outline-none';

type Step = 'email' | 'ghin' | 'sent';

function SignInForm() {
  const next = useSearchParams().get('next');
  const backHref = next && next.startsWith('/') && !next.startsWith('//') ? next : '/ryder-cup';

  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [ghin, setGhin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/session/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          ghinNumber: step === 'ghin' ? ghin.trim() : null,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { status?: string; error?: string };
      switch (json.status) {
        case 'sent':
          setStep('sent');
          break;
        case 'need_ghin':
          setStep('ghin');
          break;
        case 'no_match':
          setError(
            "That GHIN number didn't match a BDT golfer who still needs an email. Check the number, or ask an admin to add your email.",
          );
          break;
        case 'rate_limited':
          setError('Too many links requested. Check your inbox, or try again in 15 minutes.');
          break;
        default:
          setError(json.error ?? 'Something went wrong. Try again.');
      }
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bdt-card p-6 md:p-8 w-full max-w-sm flex flex-col gap-4 relative z-10">
      <div className="flex items-center gap-3">
        <BdtLogo className="h-14 w-auto" />
        <div>
          <h1 className="font-display text-3xl tracking-[0.2em] text-bdt-cream glow-cream">BDT</h1>
          <p className="font-display text-3xl tracking-[0.2em] text-bdt-red glow-red leading-none">
            SIGN IN
          </p>
        </div>
      </div>

      {step === 'sent' ? (
        <>
          <p className="text-bdt-cream">
            Check your email. We sent a sign-in link to <strong className="break-all">{email.trim()}</strong>.
          </p>
          <p className="text-sm text-bdt-muted">
            It works once and expires in 20 minutes. Open it on this phone to stay signed in here.
          </p>
          <button
            type="button"
            onClick={() => {
              setStep('email');
              setGhin('');
            }}
            className="text-sm font-mono text-bdt-muted hover:text-bdt-cream underline underline-offset-4 self-start"
          >
            Use a different email
          </button>
        </>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-mono uppercase tracking-widest text-bdt-muted">Email</span>
            <input
              type="email"
              required
              autoFocus
              autoComplete="email"
              inputMode="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                // A different address starts the flow over.
                if (step === 'ghin') setStep('email');
              }}
              className={INPUT}
            />
          </label>

          {step === 'ghin' && (
            <label className="flex flex-col gap-1">
              <span className="text-xs font-mono uppercase tracking-widest text-bdt-muted">
                GHIN number
              </span>
              <input
                required
                autoFocus
                inputMode="numeric"
                value={ghin}
                onChange={(e) => setGhin(e.target.value)}
                className={`${INPUT} font-mono`}
              />
              <span className="text-sm text-bdt-muted">
                We don&apos;t know that email yet. Enter your GHIN number to link it to your BDT profile.
              </span>
            </label>
          )}

          {error && (
            <p role="alert" className="text-sm font-mono text-bdt-red">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy || email.trim().length === 0 || (step === 'ghin' && ghin.trim().length === 0)}
            className="bg-bdt-red text-white font-display tracking-[0.25em] text-lg py-3 rounded-sm disabled:opacity-50 hover:bg-bdt-redDeep transition-colors"
          >
            {busy ? 'Sending…' : 'Email me a link'}
          </button>
        </form>
      )}

      <Link href={backHref} className="text-sm font-mono text-bdt-muted hover:text-bdt-cream">
        ← Back
      </Link>
    </div>
  );
}

export default function SignInPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <Suspense fallback={null}>
        <SignInForm />
      </Suspense>
    </div>
  );
}
