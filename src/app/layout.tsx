import type { Metadata, Viewport } from 'next';
import { Bebas_Neue, Inter, JetBrains_Mono } from 'next/font/google';
import './globals.css';

const display = Bebas_Neue({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-display',
});

const sans = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
});

const mono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
});

const SITE_NAME = 'BDT Golf Network';
const TAGLINE = 'Live broadcast-style scoreboard for the BDT Tour, powered by GHIN.';
const LONG_DESCRIPTION =
  "BDT Golf Network is a live, ESPN-style broadcast feed for the BDT Tour roster. Track scores, handicap movements, low rounds, and milestones for every tour member as they're posted to GHIN.";
const KEYWORDS = [
  'BDT Tour',
  'BDT Golf Network',
  'GHIN',
  'handicap',
  'leaderboard',
  'golf scoreboard',
  'live golf feed',
];

// `metadataBase` controls how relative URLs (like the OpenGraph image)
// resolve when the site renders. NEXT_PUBLIC_SITE_URL should be the live
// domain on Vercel; falls back to localhost for dev.
const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') ?? 'http://localhost:3000';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_NAME,
    template: `%s · ${SITE_NAME}`,
  },
  description: TAGLINE,
  applicationName: SITE_NAME,
  keywords: KEYWORDS,
  authors: [{ name: SITE_NAME }],
  creator: SITE_NAME,
  publisher: SITE_NAME,
  category: 'sports',
  manifest: '/manifest.webmanifest',
  alternates: {
    canonical: '/',
  },
  // Discourage search engines from indexing /admin paths in particular.
  robots: {
    index: true,
    follow: true,
    nocache: false,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  // Next.js auto-discovers icons in src/app via the `icon.tsx`,
  // `apple-icon.tsx`, etc. files. We still declare the static SVG fallback
  // here so older clients that don't follow the auto-generated routes get
  // something usable.
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/icon-192.svg', sizes: '192x192', type: 'image/svg+xml' },
      { url: '/icon-512.svg', sizes: '512x512', type: 'image/svg+xml' },
    ],
    shortcut: '/favicon.svg',
    apple: [{ url: '/apple-icon', sizes: '180x180' }],
  },
  openGraph: {
    type: 'website',
    siteName: SITE_NAME,
    title: SITE_NAME,
    description: LONG_DESCRIPTION,
    url: SITE_URL,
    locale: 'en_US',
    // /opengraph-image.png is auto-emitted by src/app/opengraph-image.tsx.
  },
  twitter: {
    card: 'summary_large_image',
    title: SITE_NAME,
    description: TAGLINE,
    // /twitter-image.png is auto-emitted by src/app/twitter-image.tsx.
  },
  appleWebApp: {
    capable: true,
    title: 'BDT Golf',
    statusBarStyle: 'black-translucent',
  },
  formatDetection: {
    telephone: false,
    email: false,
    address: false,
  },
};

export const viewport: Viewport = {
  themeColor: '#0B1E40',
  colorScheme: 'dark',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable} ${mono.variable}`}>
      <body className="font-sans antialiased min-h-screen">{children}</body>
    </html>
  );
}
