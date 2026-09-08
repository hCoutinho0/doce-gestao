import type { NextConfig } from 'next';

// The app never loads a third-party script and every fetch is same-origin
// (/api/...), so this is as strict as it gets without a per-request nonce:
// script-src needs 'unsafe-inline' because Next.js's own App Router
// streams hydration data through inline <script> tags it injects itself
// (confirmed by testing this without it — it broke every page, including
// login). A nonce-based CSP would close that gap, but wiring one up means
// moving nonce generation into proxy.ts and widening its matcher to every
// route, not just /dashboard and /configurar — real follow-up work, not
// safe to improvise here. style-src needs the same for the shadcn chart/
// toggle components, which set CSS variables via the `style` prop.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "worker-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

const nextConfig: NextConfig = {
  // Standalone output bundles just the traced server + dependencies, so
  // Azure App Service gets a small, self-contained deploy package instead
  // of needing `npm install` on the server.
  output: 'standalone',
  // Defense-in-depth headers the app never had: without frame-ancestors/
  // X-Frame-Options a malicious page could iframe the panel and trick a
  // signed-in admin into clicking through a hidden overlay (clickjacking);
  // without these, browsers also don't get told to force HTTPS or to stop
  // MIME-sniffing an upload into something it isn't.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: CSP },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
