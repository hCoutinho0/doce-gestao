import { NextResponse } from 'next/server';
import { isCosmosConfigured, readState, writeState } from '@/lib/cosmos';

type OrderItem = { name: string; quantity: number; unitPrice: number };
type Order = {
  id: string;
  customer: string;
  phone?: string;
  items?: OrderItem[];
  item: string;
  orderDate?: string;
  deliveryDate?: string;
  deliveryTime?: string;
  date: string;
  value: number;
  status: string;
};

type MenuItem = { name: string; price: number; available: boolean };

type Customer = {
  id: number;
  name: string;
  phone: string;
  birthday?: string;
  stamps: number;
};

const ORDERS_KEY = 'doce-orders';
const CUSTOMERS_KEY = 'doce-loyalty';
const MENU_KEY = 'doce-menu';
const STAMPS_FOR_DISCOUNT = 10;

// A first-time customer becomes a client record automatically — matched by
// name (trimmed, case-insensitive) so repeat orders don't create
// duplicates. Every order — new or repeat customer — earns one stamp
// (capped at STAMPS_FOR_DISCOUNT); returns the customer's stamp count after
// this order so the caller can show a loyalty card.
async function ensureCustomer(
  name: string,
  phone: string,
  birthday?: string,
): Promise<number> {
  const customers = ((await readState<Customer[]>(CUSTOMERS_KEY)) ??
    []) as Customer[];
  const match = customers.find(
    (c) => c.name.trim().toLowerCase() === name.toLowerCase(),
  );
  if (!match) {
    const customer: Customer = {
      id: Date.now(),
      name,
      phone,
      ...(birthday ? { birthday } : {}),
      stamps: 1,
    };
    await writeState(CUSTOMERS_KEY, [...customers, customer]);
    return customer.stamps;
  }
  const stamps = Math.min(STAMPS_FOR_DISCOUNT, match.stamps + 1);
  const updated = customers.map((c) =>
    c.id === match.id
      ? { ...c, stamps, ...(birthday ? { birthday } : {}) }
      : c,
  );
  await writeState(CUSTOMERS_KEY, updated);
  return stamps;
}

// Prices for structured items are always taken from the live cardápio, not
// whatever a client (customer or admin form) sends — otherwise anyone could
// place an order for a cent by editing the request.
async function priceItems(
  requested: { name: string; quantity: number }[],
): Promise<{ items: OrderItem[]; value: number } | null> {
  const menu = ((await readState<MenuItem[]>(MENU_KEY)) ?? []) as MenuItem[];
  const items: OrderItem[] = [];
  for (const request of requested) {
    if (!Number.isFinite(request.quantity) || request.quantity <= 0) {
      return null;
    }
    const match = menu.find(
      (m) =>
        m.available &&
        m.name.trim().toLowerCase() === request.name.trim().toLowerCase(),
    );
    if (!match) return null;
    items.push({
      name: match.name,
      quantity: request.quantity,
      unitPrice: match.price,
    });
  }
  const value = items.reduce(
    (sum, item) => sum + item.quantity * item.unitPrice,
    0,
  );
  return { items, value };
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
    items?: { name: string; quantity: number }[];
    item?: string;
    orderDate?: string;
    deliveryDate?: string;
    deliveryTime?: string;
    date?: string;
    value?: number;
    status?: string;
    birthday?: string;
  };

  if (!body.customer?.trim() || !body.date?.trim()) {
    return NextResponse.json({ error: 'invalid_order' }, { status: 400 });
  }

  let items: OrderItem[] | undefined;
  let value: number;
  let itemSummary: string;

  if (body.items?.length) {
    const priced = await priceItems(body.items);
    if (!priced) {
      return NextResponse.json({ error: 'invalid_items' }, { status: 400 });
    }
    items = priced.items;
    value = priced.value;
    itemSummary =
      body.item?.trim() ||
      items.map((i) => `${i.quantity}× ${i.name}`).join(', ');
  } else {
    if (
      !body.item?.trim() ||
      !Number.isFinite(body.value) ||
      (body.value as number) <= 0
    ) {
      return NextResponse.json({ error: 'invalid_order' }, { status: 400 });
    }
    value = body.value as number;
    itemSummary = body.item.trim();
  }

  const existing = ((await readState<Order[]>(ORDERS_KEY)) ?? []) as Order[];
  const order: Order = {
    id: `#${2001 + existing.length}`,
    customer: body.customer.trim(),
    ...(items ? { items } : {}),
    item: itemSummary,
    orderDate: body.orderDate?.trim() || new Date().toISOString().slice(0, 10),
    ...(body.deliveryDate ? { deliveryDate: body.deliveryDate } : {}),
    ...(body.deliveryTime ? { deliveryTime: body.deliveryTime } : {}),
    date: body.date.trim(),
    value,
    status: body.status?.trim() || 'Novo',
  };
  await writeState(ORDERS_KEY, [order, ...existing]);
  const stamps = await ensureCustomer(
    order.customer,
    body.phone?.trim() ?? '',
    body.birthday?.trim() || undefined,
  );

  return NextResponse.json({ order, stamps });
}
