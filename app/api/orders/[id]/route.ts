import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { isDbConfigured, readState, updateStateAtomic } from '@/lib/db';
import { applyOrderPatch, STAMPS_FOR_DISCOUNT, stampsForValue } from '@/lib/orders';
import { consumptionForOrder, deductStock, type ConsumoMenuItem, type ConsumoProduct, type ConsumoRecipe, type ConsumoStock } from '@/lib/consumo';

type OrderItem = { name: string; quantity: number; unitPrice: number };
type Order = {
  id: string;
  customer: string;
  customerId?: number;
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
  paidAmount?: number;
  stampsAwarded?: boolean;
  financeLogged?: boolean;
  stockDeducted?: boolean;
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
const STOCK_KEY = 'doce-stock-v2';
const MENU_KEY = 'doce-menu';
const PRODUCTS_KEY = 'doce-products';
const RECIPES_KEY = 'doce-pricing';

async function awardStamps(
  bakeryId: string,
  customerName: string,
  value: number,
  customerId?: number,
): Promise<Customer | undefined> {
  let awarded: Customer | undefined;
  await updateStateAtomic<Customer[]>(bakeryId, CUSTOMERS_KEY, (current) => {
    const customers = current ?? [];
    // Pelo cadastro ligado ao pedido; pedidos antigos (sem customerId)
    // continuam achando o cliente pelo nome.
    const match =
      (customerId != null ? customers.find((c) => c.id === customerId) : undefined) ??
      customers.find((c) => c.name.trim().toLowerCase() === customerName.toLowerCase());
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

async function logSale(bakeryId: string, order: Order, amount: number): Promise<FinanceItem> {
  const entry: FinanceItem = {
    id: Date.now(),
    description: `Pedido ${order.id} - ${order.customer}${amount < order.value ? ' (recebimento parcial)' : ''}`,
    type: 'Entrada',
    category: 'Vendas',
    value: amount,
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

// Baixa no estoque o que o pedido concluído consumiu, pela ficha técnica.
// Item sem receita (ou sem conversão de unidade) não é baixado.
async function deductOrderStock(bakeryId: string, order: Order) {
  if (!order.items?.length) return;
  const [menu, products, recipes] = await Promise.all([
    readState<ConsumoMenuItem[]>(bakeryId, MENU_KEY),
    readState<ConsumoProduct[]>(bakeryId, PRODUCTS_KEY),
    readState<ConsumoRecipe[]>(bakeryId, RECIPES_KEY),
  ]);
  await updateStateAtomic<ConsumoStock[]>(bakeryId, STOCK_KEY, (current) => {
    const stock = current ?? [];
    const used = consumptionForOrder(order.items!, menu ?? [], products ?? [], recipes ?? [], stock);
    return used.size ? deductStock(stock, used) : stock;
  });
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
  if (!isDbConfigured()) {
    return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  }
  const bakeryId = session.user.bakeryId;
  const { id } = await params;
  const body = (await request.json()) as {
    status?: string;
    paymentMethod?: 'Pix' | 'Cartão' | 'Dinheiro' | 'Presente';
    paymentStatus?: 'Pago' | 'Pendente';
    receive?: number;
  };
  if (!body.status?.trim() && !body.paymentStatus && !(Number(body.receive) > 0)) {
    return NextResponse.json({ error: 'invalid_status' }, { status: 400 });
  }

  let updatedOrder: Order | undefined;
  let shouldLogFinance = false;
  let shouldAwardStamps = false;
  let shouldDeductStock = false;
  let financeAmount = 0;

  await updateStateAtomic<Order[]>(bakeryId, ORDERS_KEY, (current) => {
    const orders = current ?? [];
    const target = orders.find((order) => order.id === id);
    if (!target) {
      updatedOrder = undefined;
      return orders;
    }

    const patched = applyOrderPatch(target, body, new Date().toISOString().slice(0, 10));
    const next: Order = patched.next;
    shouldLogFinance = patched.shouldLogFinance;
    shouldAwardStamps = patched.shouldAwardStamps;
    shouldDeductStock = patched.shouldDeductStock;
    financeAmount = patched.financeAmount;
    updatedOrder = next;
    return orders.map((order) => (order.id === id ? next : order));
  });

  if (!updatedOrder) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  const financeItem = shouldLogFinance
    ? await logSale(bakeryId, updatedOrder, financeAmount)
    : undefined;
  const customer = shouldAwardStamps
    ? await awardStamps(
        bakeryId,
        updatedOrder.customer,
        updatedOrder.value,
        updatedOrder.customerId,
      )
    : undefined;

  if (shouldDeductStock) await deductOrderStock(bakeryId, updatedOrder);

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
  if (!isDbConfigured()) {
    return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  }
  const bakeryId = session.user.bakeryId;
  const { id } = await params;

  await updateStateAtomic<Order[]>(bakeryId, ORDERS_KEY, (current) =>
    (current ?? []).filter((order) => order.id !== id),
  );

  return NextResponse.json({ ok: true });
}
