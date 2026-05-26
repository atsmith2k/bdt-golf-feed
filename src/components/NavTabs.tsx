'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';

const TABS = [
  { href: '/', label: 'Live Feed' },
  { href: '/roster', label: 'Roster' },
] as const;

export function NavTabs() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="relative z-10 border-b border-bdt-border bg-bdt-panel/60 backdrop-blur"
    >
      <ul className="flex items-center gap-1 px-4 md:px-8">
        {TABS.map((tab) => {
          const isActive =
            tab.href === '/'
              ? pathname === '/'
              : pathname === tab.href || pathname?.startsWith(`${tab.href}/`);
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={isActive ? 'page' : undefined}
                className={clsx(
                  'inline-flex items-center px-4 py-2 font-display tracking-[0.22em] text-sm md:text-base uppercase transition-colors',
                  'border-b-2 -mb-px',
                  isActive
                    ? 'text-bdt-cream border-bdt-red glow-cream'
                    : 'text-bdt-muted border-transparent hover:text-bdt-cream hover:border-bdt-borderStrong',
                )}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
