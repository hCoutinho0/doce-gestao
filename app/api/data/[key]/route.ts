import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { isCosmosConfigured, readState, writeState, LAVILY_BAKERY_ID } from '@/lib/cosmos';

// One document per domain per confeitaria, addressed by the same key the
// old prototype used as its localStorage key — same shape, different
// (shared, real, tenant-scoped) backend.
const ALLOWED_KEYS = new Set([
  'doce-orders',
  'doce-stock-v2',
  'doce-finance',
  'doce-menu',
  'doce-menu-editions',
  'doce-loyalty',
  'doce-bakery-profile',
  'doce-pricing',
  'doce-products',
  'doce-tasks',
]);

// The dashboard hides Financeiro, Precificação, Produtos, Clientes and
// Fidelidade from a "Produção" account entirely — but that's just the UI.
// Without a matching check here, that same account could still read or
// overwrite any of it with a plain fetch() to this route (open devtools,
// no admin role needed). Every key not listed below is fair game for any
// signed-in role; these five are admin-only in both directions.
const ADMIN_ONLY_KEYS = new Set([
  'doce-finance',
  'doce-bakery-profile',
  'doce-pricing',
  'doce-products',
  'doce-loyalty',
]);

// The public cardápio (no login) needs the published menu and the bakery's
// branding to render at all — everything else is internal panel data. Each
// confeitaria's own /{bakeryId}/cardapio passes its bakeryId explicitly via
// query string; LAVILY_BAKERY_ID is only a fallback for a caller that omits
// it (there shouldn't be one left after the move to per-confeitaria pages).
const PUBLIC_READ_KEYS = new Set(['doce-menu', 'doce-bakery-profile']);

export async function GET(
  request: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key } = await params;
  if (!ALLOWED_KEYS.has(key)) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  let bakeryId: string;
  if (PUBLIC_READ_KEYS.has(key)) {
    // The public cardápio also reads these three keys, anonymously, and
    // expects the confeitaria it's asking about — it must never shift to
    // whatever confeitaria the browser's session cookie belongs to. Only a
    // request explicitly marked as coming from the admin panel
    // (X-Panel-Request) resolves to the signed-in user's own confeitaria.
    if (request.headers.get('X-Panel-Request')) {
      const session = await auth();
      if (!session?.user.bakeryId) {
        return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
      }
      bakeryId = session.user.bakeryId;
    } else {
      const { searchParams } = new URL(request.url);
      bakeryId = searchParams.get('bakeryId')?.trim() || LAVILY_BAKERY_ID;
    }
  } else {
    const session = await auth();
    if (!session?.user.bakeryId) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
    if (ADMIN_ONLY_KEYS.has(key) && session.user.role !== 'admin') {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }
    bakeryId = session.user.bakeryId;
  }
  if (!isCosmosConfigured()) {
    return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  }
  const value = await readState(bakeryId, key);
  // The same URL can legitimately answer with a different confeitaria's
  // data depending on the session cookie and the X-Panel-Request header —
  // neither of which a shared cache (browser, CDN) necessarily keys on. A
  // cached response here would risk serving one confeitaria's data to
  // another, so every response is explicitly marked as never cacheable.
  return NextResponse.json(
    { value },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key } = await params;
  if (!ALLOWED_KEYS.has(key)) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  // Writing always requires a real session with a confeitaria attached —
  // the public cardápio can read the menu/branding but only the signed-in
  // panel can change them.
  const session = await auth();
  if (!session?.user.bakeryId) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (ADMIN_ONLY_KEYS.has(key) && session.user.role !== 'admin') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  if (!isCosmosConfigured()) {
    return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  }
  const body = (await request.json()) as { value: unknown };
  await writeState(session.user.bakeryId, key, body.value);
  return NextResponse.json({ ok: true });
}
