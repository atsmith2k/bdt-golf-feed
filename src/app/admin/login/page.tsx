'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { BdtLogo } from '@/components/BdtLogo';

function LoginForm() {
  const router = useRouter();
  const search = useSearchParams();
  const next = search.get('next') ?? '/admin';
  const [token, setToken] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? 'Login failed');
      }
      router.replace(next);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="bdt-card p-8 w-full max-w-sm flex flex-col gap-4 relative z-10"
    >
      <div className="flex items-center gap-3">
        <BdtLogo className="h-14 w-auto" />
        <div>
          <h1 className="font-display text-3xl tracking-[0.2em] text-bdt-cream glow-cream">
            ADMIN
          </h1>
          <p className="font-display text-3xl tracking-[0.2em] text-bdt-red glow-red leading-none">
            ACCESS
          </p>
        </div>
      </div>
      <p className="text-sm text-bdt-muted">
        Enter the configured ADMIN_TOKEN to manage the BDT Golf Network roster and feed.
      </p>
      <input
        type="password"
        autoFocus
        autoComplete="current-password"
        value={token}
        onChange={(e) => setToken(e.target.value)}
        placeholder="ADMIN_TOKEN"
        className="bg-bdt-bg border border-bdt-border px-3 py-2 font-mono text-white focus:border-bdt-red outline-none"
      />
      {error && <p className="text-bdt-red text-sm font-mono">{error}</p>}
      <button
        type="submit"
        disabled={submitting || token.length === 0}
        className="bg-bdt-red text-white font-display tracking-[0.25em] text-lg py-2 disabled:opacity-50 hover:bg-bdt-redDeep transition-colors"
      >
        {submitting ? 'Authenticating…' : 'Sign In'}
      </button>
    </form>
  );
}

export default function AdminLoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
