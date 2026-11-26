/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Don't advertise the framework in response headers.
  poweredByHeader: false,


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
      // Images in public/ change only when the logo does. Next.js serves them
      // with max-age=0 by default, which costs a round trip per image per visit.
      {
        source: '/:file(bdt-logo|bdt-logo-sm|bdt-shield|icon-192|icon-512|icon-maskable-512).png',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=86400, stale-while-revalidate=604800' }],
      },
      // Discourage indexing of admin paths in case they ever leak into a crawler.
      { source: '/admin/:path*', headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }] },
    ];
  },
};

module.exports = nextConfig;
