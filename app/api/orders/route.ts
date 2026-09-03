import { NextResponse } from 'next/server';
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

// Deliberately separate from PUT /api/data/doce-orders: a customer placing
// an order from the public cardápio may only append a new order, never
// overwrite or read the full order list (which would leak every other
// customer's data or let anyone wipe the order book).
export async function POST(request: Request) {
  if (!isCosmosConfigured()) {
    return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  }

  const body = (await request.json()) as {
    customer?: string;
    item?: string;
    date?: string;
    value?: number;
    status?: string;
  };

  if (
    !body.customer?.trim() ||
    !body.item?.trim() ||
    !body.date?.trim() ||
    !Number.isFinite(body.value) ||
    (body.value as number) <= 0
  ) {
    return NextResponse.json({ error: 'invalid_order' }, { status: 400 });
  }

  const existing = ((await readState<Order[]>(ORDERS_KEY)) ?? []) as Order[];
  const order: Order = {
    id: `#${2001 + existing.length}`,
    customer: body.customer.trim(),
    item: body.item.trim(),
    date: body.date.trim(),
    value: body.value as number,
    status: body.status?.trim() || 'Novo',
  };
  await writeState(ORDERS_KEY, [order, ...existing]);

  return NextResponse.json({ order });
}
