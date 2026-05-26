'use client';

import { useEffect, useState } from 'react';
import { BdtLogo } from './BdtLogo';

export function BroadcastHeader() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <header className="relative z-10 border-b border-bdt-border bg-bdt-panel/80 backdrop-blur">
      {/* Red top accent stripe — broadcast lower-third style */}
      <div className="h-1 bg-bdt-bar bg-gradient-to-r from-bdt-red via-bdt-red to-bdt-redDeep" />

      <div className="flex items-center justify-between px-6 py-3">
        <div className="flex items-center gap-4">
          <BdtLogo className="h-12 w-auto drop-shadow" />
          <div className="leading-none">
            <div className="font-display text-3xl tracking-[0.18em] text-bdt-cream glow-cream">
              BDT GOLF
            </div>
            <div className="font-display text-3xl tracking-[0.18em] text-bdt-red glow-red">
              NETWORK
            </div>
          </div>
          <span className="hidden md:inline ml-3 text-[10px] font-mono uppercase tracking-[0.4em] text-bdt-muted">
            Live · GHIN Feed
          </span>
        </div>

        <div className="flex items-center gap-4 font-mono text-sm">
          <span className="bdt-chip bg-bdt-red text-white animate-flash">On Air</span>
          <span className="hidden sm:inline text-bdt-muted">{now?.toLocaleDateString() ?? ''}</span>
          <span className="text-bdt-cream">{now?.toLocaleTimeString() ?? '--:--:--'}</span>
        </div>
      </div>
    </header>
  );
}
