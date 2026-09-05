import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { isCosmosConfigured, updateStateAtomic } from '@/lib/cosmos';

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
  paymentMethod?: 'Pix' | 'Cartão' | 'Dinheiro' | 'Presente';
  paymentStatus: 'Pago' | 'Pendente';
  paymentDate?: string;
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
  let awarded: Customer | undefined;
  await updateStateAtomic<Customer[]>(bakeryId, CUSTOMERS_KEY, (current) => {
    const customers = current ?? [];
    const match = customers.find(
      (c) => c.name.trim().toLowerCase() === customerName.toLowerCase(),
    );
    if (!match) {
      awarded = undefined;
      return customers;
    }
    const stamps = Math.min(
      STAMPS_FOR_DISCOUNT,
      match.stamps + stampsForValue(value),
    );
    awarded = { ...match, stamps };
    return customers.map((c) => (c.id === match.id ? { ...c, stamps } : c));
  });
  return awarded;
}

async function logSale(bakeryId: string, order: Order): Promise<FinanceItem> {
  const entry: FinanceItem = {
    id: Date.now(),
    description: `Pedido ${order.id} - ${order.customer}`,
    type: 'Entrada',
    category: 'Vendas',
    value: order.value,
    // The payment date, not orderDate/deliveryDate — a sale only counts
    // toward a given month's Financeiro once the customer actually pays.
    date: order.paymentDate ?? new Date().toISOString().slice(0, 10),
  };
  await updateStateAtomic<FinanceItem[]>(bakeryId, FINANCE_KEY, (current) => [
    entry,
    ...(current ?? []),
  ]);
  return entry;
}

// Read-modify-write against the current database state at request time,
// scoped to a single order — never a blind overwrite of a client's stale
// in-memory copy of the whole list. That's what let a customer's order
// vanish once already: two people's full-array PUTs raced and the loser's
// snapshot (missing the other's new order) won. updateStateAtomic closes
// the gap further with an ETag-guarded retry: the callback below is pure
// (no side effects) and re-derives shouldLogFinance/shouldAwardStamps from
// whatever the *current* document says on every attempt, so a write
// conflict retry can never double-trigger logSale/awardStamps — only the
// attempt that actually wins the write decides what fires next.
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
  const body = (await request.json()) as {
    status?: string;
    paymentMethod?: 'Pix' | 'Cartão' | 'Dinheiro' | 'Presente';
    paymentStatus?: 'Pago' | 'Pendente';
  };
  if (!body.status?.trim() && !body.paymentStatus) {
    return NextResponse.json({ error: 'invalid_status' }, { status: 400 });
  }
  const status = body.status?.trim();

  let updatedOrder: Order | undefined;
  let shouldLogFinance = false;
  let shouldAwardStamps = false;

  await updateStateAtomic<Order[]>(bakeryId, ORDERS_KEY, (current) => {
    const orders = current ?? [];
    const target = orders.find((order) => order.id === id);
    if (!target) {
      updatedOrder = undefined;
      return orders;
    }

    let next: Order = { ...target, ...(status ? { status } : {}) };
    shouldLogFinance = false;
    shouldAwardStamps = false;
    if (body.paymentStatus === 'Pago' && target.paymentStatus !== 'Pago') {
      next = {
        ...next,
        paymentStatus: 'Pago',
        paymentDate: new Date().toISOString().slice(0, 10),
        ...(body.paymentMethod ? { paymentMethod: body.paymentMethod } : {}),
      };
      // A sale only counts toward Financeiro once the customer actually
      // pays — not when the order is placed, and not when it's completed
      // in the kitchen. Fires exactly once per order (guarded by the
      // flag), regardless of how many times this route is called after.
      if (!target.financeLogged) {
        shouldLogFinance = true;
        next = { ...next, financeLogged: true };
      }
    } else if (body.paymentMethod && !body.paymentStatus) {
      next = { ...next, paymentMethod: body.paymentMethod };
    }
    // The loyalty stamp still rewards actually completing the order, not
    // getting paid for it — independent transition, independent flag.
    if (status === 'Concluído' && !target.stampsAwarded) {
      shouldAwardStamps = true;
      next = { ...next, stampsAwarded: true };
    }
    updatedOrder = next;
    return orders.map((order) => (order.id === id ? next : order));
  });

  if (!updatedOrder) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  const financeItem = shouldLogFinance
    ? await logSale(bakeryId, updatedOrder)
    : undefined;
  const customer = shouldAwardStamps
    ? await awardStamps(bakeryId, updatedOrder.customer, updatedOrder.value)
    : undefined;

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

  await updateStateAtomic<Order[]>(bakeryId, ORDERS_KEY, (current) =>
    (current ?? []).filter((order) => order.id !== id),
  );

  return NextResponse.json({ ok: true });
}
