/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Don't advertise the framework in response headers.
  poweredByHeader: false,

  experimental: {
    // Required by src/instrumentation.ts in Next 14.x.
    instrumentationHook: true,
  },

  async headers() {
    const securityHeaders = [
      // Disallow embedding the dashboard in another origin's iframe.
      { key: 'X-Frame-Options', value: 'DENY' },
      // Avoid MIME-type sniffing.
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      // Don't leak full referrer URLs to outside origins.
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      // Limit feature exposure.
      {
        key: 'Permissions-Policy',
        value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
      },
    ];

    return [
      { source: '/:path*', headers: securityHeaders },
      // Discourage indexing of admin paths in case they ever leak into a crawler.
      { source: '/admin/:path*', headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }] },
    ];
  },
};

module.exports = nextConfig;
