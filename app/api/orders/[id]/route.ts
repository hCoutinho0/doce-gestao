import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { isCosmosConfigured, readState, writeState } from '@/lib/cosmos';

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

type Customer = {
  id: number;
  name: string;
  phone: string;
  birthday?: string;
  stamps: number;
};

type FinanceItem = {
  id: number;
  description: string;
  type: 'Entrada' | 'Saída';
  category?: string;
  value: number;
  date: string;
};

const ORDERS_KEY = 'doce-orders';
const CUSTOMERS_KEY = 'doce-loyalty';
const FINANCE_KEY = 'doce-finance';
const STAMPS_FOR_DISCOUNT = 10;

// Orders under R$100 are worth 1 stamp, R$100+ are worth 2 — awarded once,
// only when the order is actually completed (not on creation, so an order
// that's cancelled before delivery never earns one).
function stampsForValue(value: number): number {
  return value >= 100 ? 2 : 1;
}

async function awardStamps(
  bakeryId: string,
  customerName: string,
  value: number,
): Promise<Customer | undefined> {
  const customers = ((await readState<Customer[]>(bakeryId, CUSTOMERS_KEY)) ??
    []) as Customer[];
  const match = customers.find(
    (c) => c.name.trim().toLowerCase() === customerName.toLowerCase(),
  );
  if (!match) return undefined;
  const stamps = Math.min(
    STAMPS_FOR_DISCOUNT,
    match.stamps + stampsForValue(value),
  );
  const updated = customers.map((c) =>
    c.id === match.id ? { ...c, stamps } : c,
  );
  await writeState(bakeryId, CUSTOMERS_KEY, updated);
  return { ...match, stamps };
}

async function logSale(
  bakeryId: string,
  order: Order,
): Promise<FinanceItem> {
  const finance = ((await readState<FinanceItem[]>(bakeryId, FINANCE_KEY)) ??
    []) as FinanceItem[];
  const entry: FinanceItem = {
    id: Date.now(),
    description: `Pedido ${order.id} - ${order.customer}`,
    type: 'Entrada',
    category: 'Vendas',
    value: order.value,
    date: order.orderDate ?? new Date().toISOString().slice(0, 10),
  };
  await writeState(bakeryId, FINANCE_KEY, [entry, ...finance]);
  return entry;
}

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
  const status = body.status.trim();

  const orders = ((await readState<Order[]>(bakeryId, ORDERS_KEY)) ??
    []) as Order[];
  const target = orders.find((order) => order.id === id);
  if (!target) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  let updatedOrder: Order = { ...target, status };
  let financeItem: FinanceItem | undefined;
  let customer: Customer | undefined;

  // Completing an order is the moment it actually counts as a sale — both
  // the financeiro entry and the loyalty stamp fire here, exactly once per
  // order (guarded by the flags below), regardless of how many times the
  // status is changed afterwards.
  if (status === 'Concluído') {
    if (!target.financeLogged) {
      financeItem = await logSale(bakeryId, updatedOrder);
      updatedOrder = { ...updatedOrder, financeLogged: true };
    }
    if (!target.stampsAwarded) {
      customer = await awardStamps(bakeryId, target.customer, target.value);
      updatedOrder = { ...updatedOrder, stampsAwarded: true };
    }
  }

  const updated = orders.map((order) =>
    order.id === id ? updatedOrder : order,
  );
  await writeState(bakeryId, ORDERS_KEY, updated);

  return NextResponse.json({ ok: true, order: updatedOrder, financeItem, customer });
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
