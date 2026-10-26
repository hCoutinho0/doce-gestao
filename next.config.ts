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

// No Vercel (site do cardápio) o próprio Vercel empacota o servidor; as
// opções de servidor standalone abaixo valem só para o app de desktop e
// quebram a etapa final do build de lá.
const onVercel = Boolean(process.env.VERCEL);

const nextConfig: NextConfig = {
  // Standalone gera um servidor enxuto com só as dependências usadas — é ele
  // que vai dentro do instalador e o aplicativo (electron/app/main.cjs) liga.
  ...(onVercel
    ? {}
    : {
        output: 'standalone' as const,
        // Nada disto é usado pelo servidor; fica fora do pacote standalone.
        outputFileTracingExcludes: {
          '*': [
            '.git/**',
            '.github/**',
            'electron/**',
            'instalador/**',
            'desktop-server/**',
            'dados/**',
            'scripts/**',
            'node_modules/electron/**',
            'node_modules/electron-builder/**',
            'node_modules/app-builder-bin/**',
            'node_modules/typescript/**',
          ],
        },
      }),
  // Sem otimização de imagem no servidor: evita depender do `sharp` (módulo
  // nativo) dentro do instalador. As fotos vêm do Supabase e já são leves.
  images: { unoptimized: true },
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
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
