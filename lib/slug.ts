// Pure string helpers for the confeitaria's link (`confeitto.com.br/{slug}`)
// — no Cosmos import here on purpose, so this stays safe to use from a
// 'use client' component for the live preview while typing, not just from
// API routes.

function stripDiacritics(value: string): string {
  return Array.from(value.normalize('NFD'))
    .filter((char) => {
      const code = char.codePointAt(0) ?? 0;
      return code < 0x300 || code > 0x36f; // combining marks block
    })
    .join('');
}

// Turns a confeitaria name into a clean, URL-safe slug — no random suffix.
// Two confeitarias can end up wanting the same one (same name, or just
// coincidence); that conflict is resolved by asking the second one to pick
// a different link, not by silently appending gibberish to either.
export function slugify(name: string): string {
  return stripDiacritics(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 40);
}

// Every top-level static route the app already has — a confeitaria whose
// slug matched one of these would make that route (or the confeitaria's
// own /{slug} page) unreachable, since Next.js resolves a static route
// before the [bakeryId] dynamic one.
export const RESERVED_SLUGS = new Set([
  'login',
  'dashboard',
  'cadastro',
  'configurar',
  'cardapio',
  'api',
  'assets',
  // Prefixos dos documentos globais no banco (`user:…`, `invite:…`,
  // `ratelimit:…`): uma confeitaria com esse nome compartilharia o prefixo.
  'user',
  'invite',
  'ratelimit',
  'favicon.ico',
  'robots.txt',
  'sitemap.xml',
]);

export function isValidSlugFormat(slug: string): boolean {
  return (
    slug.length >= 3 &&
    slug.length <= 40 &&
    /^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) &&
    !RESERVED_SLUGS.has(slug)
  );
}
