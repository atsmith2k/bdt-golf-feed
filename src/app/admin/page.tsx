import Link from 'next/link';
import { AdminControls } from '@/components/admin/AdminControls';
import { BdtLogo } from '@/components/BdtLogo';

export const dynamic = 'force-dynamic';

export default function AdminPage() {
  return (
    <div className="min-h-screen px-4 md:px-8 py-6 relative z-10">
      <header className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <BdtLogo className="h-12 w-auto" />
          <div>
            <h1 className="font-display tracking-[0.25em] text-3xl text-bdt-cream glow-cream">
              CONTROL ROOM
            </h1>
            <p className="text-bdt-muted text-sm font-mono">
              BDT Golf Network · roster, sync, and breaking-news controls.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <Link
            href="/"
            className="text-sm font-mono text-bdt-muted hover:text-bdt-cream"
          >
            ← Back to Broadcast
          </Link>
        </div>
      </header>

      <AdminControls />
    </div>
  );
}
