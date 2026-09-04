import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { isCosmosConfigured, readState, writeState } from '@/lib/cosmos';

type Order = {
  id: string;
  customer: string;
  item: string;
  date: string;
  value: number;
  status: string;
};

const ORDERS_KEY = 'doce-orders';

// Read-modify-write against the current database state at request time,
// scoped to a single order — never a blind overwrite of a client's stale
// in-memory copy of the whole list. That's what let a customer's order
// vanish once already: two people's full-array PUTs raced and the loser's
// snapshot (missing the other's new order) won.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user.bakeryId) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!isCosmosConfigured()) {
    return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  }
  const bakeryId = session.user.bakeryId;
  const { id } = await params;
  const body = (await request.json()) as { status?: string };
  if (!body.status?.trim()) {
    return NextResponse.json({ error: 'invalid_status' }, { status: 400 });
  }

  const orders = ((await readState<Order[]>(bakeryId, ORDERS_KEY)) ??
    []) as Order[];
  const updated = orders.map((order) =>
    order.id === id ? { ...order, status: body.status!.trim() } : order,
  );
  await writeState(bakeryId, ORDERS_KEY, updated);

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user.bakeryId) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!isCosmosConfigured()) {
    return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  }
  const bakeryId = session.user.bakeryId;
  const { id } = await params;

  const orders = ((await readState<Order[]>(bakeryId, ORDERS_KEY)) ??
    []) as Order[];
  await writeState(
    bakeryId,
    ORDERS_KEY,
    orders.filter((order) => order.id !== id),
  );

  return NextResponse.json({ ok: true });
}
