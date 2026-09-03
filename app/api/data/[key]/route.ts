import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { isCosmosConfigured, readState, writeState } from '@/lib/cosmos';

// One document per domain, addressed by the same key the old prototype used
// as its localStorage key — same shape, different (shared, real) backend.
const ALLOWED_KEYS = new Set([
  'doce-orders',
  'doce-stock-v2',
  'doce-finance',
  'doce-menu',
  'doce-menu-week',
  'doce-loyalty',
  'doce-bakery-profile',
]);

// The public cardápio (no login) needs the published menu and the bakery's
// branding to render at all — everything else is internal panel data.
const PUBLIC_READ_KEYS = new Set([
  'doce-menu',
  'doce-menu-week',
  'doce-bakery-profile',
]);

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key } = await params;
  if (!ALLOWED_KEYS.has(key)) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  if (!PUBLIC_READ_KEYS.has(key)) {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
  }
  if (!isCosmosConfigured()) {
    return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  }
  const value = await readState(key);
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
  // Writing always requires a real session — the public cardápio can read
  // the menu/branding but only the signed-in panel can change them.
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!isCosmosConfigured()) {
    return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  }
  const body = (await request.json()) as { value: unknown };
  await writeState(key, body.value);
  return NextResponse.json({ ok: true });
}
