import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import {
  isCosmosConfigured,
  readState,
  updateStateAtomic,
  LAVILY_BAKERY_ID,
} from '@/lib/cosmos';

type OrderItem = { name: string; quantity: number; unitPrice: number };
type Order = {
  id: string;
  customer: string;
  phone?: string;
  items?: OrderItem[];
  item: string;
  notes?: string;
  orderDate?: string;
  deliveryDate?: string;
  deliveryTime?: string;
  date: string;
  value: number;
  status: string;
  stampsAwarded?: boolean;
  financeLogged?: boolean;
};

type MenuItem = { name: string; price: number; available: boolean };
type MenuEdition = { id: string; items: MenuItem[] };

type Customer = {
  id: number;
  name: string;
  phone: string;
  birthday?: string;
  stamps: number;
};

const ORDERS_KEY = 'doce-orders';
const ORDER_COUNTER_KEY = 'doce-order-counter';
const CUSTOMERS_KEY = 'doce-loyalty';
const MENU_KEY = 'doce-menu';
const MENU_EDITIONS_KEY = 'doce-menu-editions';

// A first-time customer becomes a client record automatically — matched by
// name (trimmed, case-insensitive) so repeat orders don't create
// duplicates. Stamps are no longer touched here — they're only awarded when
// an order is actually completed (see app/api/orders/[id]/route.ts), so a
// cancelled order never earns one. Returns the customer's current stamp
// count (unchanged by this call) so the checkout can still show their
// loyalty card.
//
// Wrapped in updateStateAtomic (not a plain readState+writeState) because
// two customers can check out at nearly the same instant — without the
// ETag-guarded retry, both requests read the list before either write
// lands, and whichever writes second silently erases the customer record
// the other one just created.
async function ensureCustomer(
  bakeryId: string,
  name: string,
  phone: string,
  birthday?: string,
): Promise<number> {
  let stamps = 0;
  await updateStateAtomic<Customer[]>(bakeryId, CUSTOMERS_KEY, (current) => {
    const customers = current ?? [];
    const match = customers.find(
      (c) => c.name.trim().toLowerCase() === name.toLowerCase(),
    );
    if (!match) {
      stamps = 0;
      const customer: Customer = {
        id: Date.now(),
        name,
        phone,
        ...(birthday ? { birthday } : {}),
        stamps: 0,
      };
      return [...customers, customer];
    }
    stamps = match.stamps;
    if (!birthday) return customers;
    return customers.map((c) =>
      c.id === match.id ? { ...c, birthday } : c,
    );
  });
  return stamps;
}

// Sequential, persisted counter — immune to orders being deleted (unlike
// the old `#${2001 + existing.length}`, which could reissue a number once
// an order in the middle of the list was removed) AND immune to two orders
// created at the same instant issuing the same number (updateStateAtomic
// retries on a write conflict instead of the plain read-then-write this
// used to be, which let both requests read the same counter value).
async function nextOrderNumber(bakeryId: string): Promise<string> {
  let issued = 1;
  await updateStateAtomic<number>(bakeryId, ORDER_COUNTER_KEY, (current) => {
    issued = current ?? 1;
    return issued + 1;
  });
  return `#${String(issued).padStart(2, '0')}`;
}

// Prices for structured items are always taken from the live cardápio, not
// whatever a client (customer or admin form) sends — otherwise anyone could
// place an order for a cent by editing the request. Two exceptions, both
// gated on an authenticated admin session (never the anonymous public
// checkout): an `editionId` prices against an archived weekly edition
// instead of the live menu (for a retroactive order matching an old week),
// and a request-supplied `unitPrice` is trusted outright for items that
// aren't in any cardápio at all — the "Produtos cadastrados" catalog only
// has a name and a flavor, no price, so the admin building the order types
// one in.
async function priceItems(
  bakeryId: string,
  requested: { name: string; quantity: number; unitPrice?: number }[],
  isAuthenticated: boolean,
  editionId?: string,
): Promise<{ items: OrderItem[]; value: number } | null> {
  let menu: MenuItem[];
  if (isAuthenticated && editionId) {
    const editions =
      (await readState<MenuEdition[]>(bakeryId, MENU_EDITIONS_KEY)) ?? [];
    const edition = editions.find((e) => e.id === editionId);
    if (!edition) return null;
    menu = edition.items;
  } else {
    menu = ((await readState<MenuItem[]>(bakeryId, MENU_KEY)) ??
      []) as MenuItem[];
  }

  const items: OrderItem[] = [];
  for (const request of requested) {
    if (!Number.isFinite(request.quantity) || request.quantity <= 0) {
      return null;
    }
    if (
      isAuthenticated &&
      Number.isFinite(request.unitPrice) &&
      (request.unitPrice as number) > 0
    ) {
      items.push({
        name: request.name.trim(),
        quantity: request.quantity,
        unitPrice: request.unitPrice as number,
      });
      continue;
    }
    const match = menu.find(
      (m) =>
        (editionId || m.available) &&
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
  // The admin panel's "Lançar pedido" form calls this same endpoint
  // authenticated (session cookie present) — use its confeitaria when
  // there is one. An anonymous request is the public cardápio checkout,
  // which names its own confeitaria explicitly (each one has its own
  // /{bakeryId}/cardapio page) since there's no session to read it from.
  const session = await auth();
  const isAuthenticated = Boolean(session?.user.bakeryId);

  const body = (await request.json()) as {
    bakeryId?: string;
    customer?: string;
    phone?: string;
    items?: { name: string; quantity: number; unitPrice?: number }[];
    item?: string;
    notes?: string;
    orderDate?: string;
    deliveryDate?: string;
    deliveryTime?: string;
    date?: string;
    value?: number;
    status?: string;
    birthday?: string;
    editionId?: string;
  };
  const bakeryId =
    session?.user.bakeryId ?? body.bakeryId?.trim() ?? LAVILY_BAKERY_ID;

  if (!body.customer?.trim() || !body.date?.trim()) {
    return NextResponse.json({ error: 'invalid_order' }, { status: 400 });
  }

  let items: OrderItem[] | undefined;
  let value: number;
  let itemSummary: string;

  if (body.items?.length) {
    const priced = await priceItems(
      bakeryId,
      body.items,
      isAuthenticated,
      body.editionId,
    );
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

  const order: Order = {
    id: await nextOrderNumber(bakeryId),
    customer: body.customer.trim(),
    ...(items ? { items } : {}),
    item: itemSummary,
    ...(body.notes?.trim() ? { notes: body.notes.trim() } : {}),
    orderDate: body.orderDate?.trim() || new Date().toISOString().slice(0, 10),
    ...(body.deliveryDate ? { deliveryDate: body.deliveryDate } : {}),
    ...(body.deliveryTime ? { deliveryTime: body.deliveryTime } : {}),
    date: body.date.trim(),
    value,
    status: body.status?.trim() || 'Novo',
  };
  // updateStateAtomic, not readState+writeState — two orders created in
  // the same instant (two customers checking out at once) must not let
  // the second writer's stale snapshot drop the first one's order.
  await updateStateAtomic<Order[]>(bakeryId, ORDERS_KEY, (current) => [
    order,
    ...(current ?? []),
  ]);
  const stamps = await ensureCustomer(
    bakeryId,
    order.customer,
    body.phone?.trim() ?? '',
    body.birthday?.trim() || undefined,
  );

  return NextResponse.json({ order, stamps });
}
