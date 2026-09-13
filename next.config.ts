import type { NextConfig } from 'next';

const config: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      { source: '/:path*', headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Permissions-Policy', value: 'geolocation=(), microphone=(), camera=(self)' },
      ] },
      ...['/sw.js', '/manifest.webmanifest'].map(source => ({ source, headers: [{ key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' }] })),
    ];
  },
};
export default config;
