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

type Customer = {
  id: number;
  name: string;
  phone: string;
  stamps: number;
};

const ORDERS_KEY = 'doce-orders';
const CUSTOMERS_KEY = 'doce-loyalty';

// A first-time customer becomes a client record automatically — matched by
// name (trimmed, case-insensitive) so repeat orders don't create
// duplicates. Stamps are left untouched here; the admin still awards those
// by hand in the Fidelidade tab.
async function ensureCustomer(name: string, phone: string) {
  const customers = ((await readState<Customer[]>(CUSTOMERS_KEY)) ??
    []) as Customer[];
  const exists = customers.some(
    (c) => c.name.trim().toLowerCase() === name.toLowerCase(),
  );
  if (exists) return;
  const customer: Customer = { id: Date.now(), name, phone, stamps: 0 };
  await writeState(CUSTOMERS_KEY, [...customers, customer]);
}

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
    phone?: string;
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
  await ensureCustomer(order.customer, body.phone?.trim() ?? '');

  return NextResponse.json({ order });
}
