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
  'doce-menu-week',
  'doce-menu-week-start',
  'doce-menu-week-end',
  'doce-loyalty',
  'doce-bakery-profile',
  'doce-pricing',
]);

// The public cardápio (no login) needs the published menu and the bakery's
// branding to render at all — everything else is internal panel data. No
// per-confeitaria public routing exists yet, so public reads are pinned to
// the one confeitaria that has a public cardápio today.
const PUBLIC_READ_KEYS = new Set([
  'doce-menu',
  'doce-menu-week',
  'doce-bakery-profile',
]);

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
    // expects them pinned to one fixed confeitaria — it must never shift
    // to whatever confeitaria the browser's session cookie belongs to.
    // Only a request explicitly marked as coming from the admin panel
    // (X-Panel-Request) resolves to the signed-in user's own confeitaria.
    if (request.headers.get('X-Panel-Request')) {
      const session = await auth();
      if (!session?.user.bakeryId) {
        return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
      }
      bakeryId = session.user.bakeryId;
    } else {
      bakeryId = LAVILY_BAKERY_ID;
    }
  } else {
    const session = await auth();
    if (!session?.user.bakeryId) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
    bakeryId = session.user.bakeryId;
  }
  if (!isCosmosConfigured()) {
    return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  }
  const value = await readState(bakeryId, key);
  return NextResponse.json({ value });
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
  if (!isCosmosConfigured()) {
    return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  }
  const body = (await request.json()) as { value: unknown };
  await writeState(session.user.bakeryId, key, body.value);
  return NextResponse.json({ ok: true });
}
