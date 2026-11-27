import Link from 'next/link';
import { BroadcastHeader } from '@/components/BroadcastHeader';
import { NavTabs } from '@/components/NavTabs';
import { CupAdminPanel } from '@/components/cup/CupAdminPanel';
import { getViewer } from '@/lib/services/session';

export const metadata = {
  title: 'Manage the Ryder Cup',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

/**
 * Season, teams, roles and sign-in emails, for golfers with the admin role
 * (and whoever holds the admin token). The same panel is in /admin.
 */
export default async function ManageCupPage() {
  const viewer = await getViewer().catch(() => null);

  return (
    <div className="min-h-screen flex flex-col">
      <BroadcastHeader />
      <NavTabs />
      <main className="relative z-10 flex-1 px-4 md:px-8 py-6 w-full max-w-5xl mx-auto flex flex-col gap-4">
        <Link href="/ryder-cup" className="text-sm font-mono text-bdt-muted hover:text-bdt-cream">
          ← Back to the Ryder Cup
        </Link>
        {viewer?.canManage ? (
          <CupAdminPanel />
        ) : (
          <div className="bdt-card p-8 text-center text-bdt-muted">
            Only admins can manage the Ryder Cup.{' '}
            <Link
              href="/signin?next=/ryder-cup/manage"
              className="text-bdt-cream underline underline-offset-4"
            >
              Sign in
            </Link>
          </div>
        )}
      </main>
    </div>
  );
}
