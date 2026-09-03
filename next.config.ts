import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Standalone output bundles just the traced server + dependencies, so
  // Azure App Service gets a small, self-contained deploy package instead
  // of needing `npm install` on the server.
  output: 'standalone',
};

export default nextConfig;
