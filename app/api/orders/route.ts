import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { isDbConfigured, readState, updateStateAtomic } from '@/lib/db';
import { checkRateLimit, clientIp } from '@/lib/rateLimit';
import { normalizePhone } from '@/lib/phone';
import { priceFromMenu, type MenuItem, type OrderItem } from '@/lib/pricing';

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
  stampsAwarded?: boolean;
  financeLogged?: boolean;
};


type MenuEdition = { id: string; items: MenuItem[] };

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
const ORDER_COUNTER_KEY = 'doce-order-counter';
const CUSTOMERS_KEY = 'doce-loyalty';
const MENU_KEY = 'doce-menu';
const MENU_EDITIONS_KEY = 'doce-menu-editions';
const FINANCE_KEY = 'doce-finance';

// Same shape/purpose as logSale in app/api/orders/[id]/route.ts — an order
// created already marked paid (e.g. "Presente" handed over on the spot)
// never goes through PATCH's Pago transition, so it needs to post to
// Financeiro right here at creation time instead.
async function logSale(bakeryId: string, order: Order): Promise<FinanceItem> {
  const entry: FinanceItem = {
    id: Date.now(),
    description: `Pedido ${order.id} - ${order.customer}`,
    type: 'Entrada',
    category: 'Vendas',
    value: order.value,
    date: order.paymentDate ?? new Date().toISOString().slice(0, 10),
  };
  await updateStateAtomic<FinanceItem[]>(bakeryId, FINANCE_KEY, (current) => [
    entry,
    ...(current ?? []),
  ]);
  return entry;
}

// Todo pedido vira (ou encontra) um cadastro de cliente com cartão
// fidelidade. A busca é primeiro pelo celular — o mesmo número é sempre a
// mesma pessoa, mesmo que o nome venha escrito de outro jeito ("Maria" e
// "Maria Alves") — e só depois pelo nome, para clientes antigos que ainda
// não tinham celular salvo (que então ganham o número). Um nome igual com
// um celular diferente é outra pessoa: vira um cadastro novo.
// Os selos só são somados quando o pedido é concluído (app/api/orders/[id]).
//
// updateStateAtomic (não readState+writeState): dois clientes fechando
// pedido no mesmo instante não podem apagar o cadastro um do outro.
async function ensureCustomer(
  bakeryId: string,
  name: string,
  phone: string | null,
  birthday?: string,
  newCustomer = false,
): Promise<Customer> {
  let result: Customer | undefined;
  await updateStateAtomic<Customer[]>(bakeryId, CUSTOMERS_KEY, (current) => {
    const customers = current ?? [];
    // newCustomer: a pessoa disse "não sou eu" para o cadastro desse
    // celular (telefone da família, por exemplo) — procura só pelo nome.
    const byPhone =
      phone && !newCustomer
        ? customers.find((c) => normalizePhone(c.phone) === phone)
        : undefined;
    const byName = byPhone
      ? undefined
      : customers.find(
          (c) =>
            c.name.trim().toLowerCase() === name.toLowerCase() &&
            (!phone || !normalizePhone(c.phone) || normalizePhone(c.phone) === phone),
        );
    const match = byPhone ?? byName;
    if (!match) {
      result = {
        id: Date.now(),
        name,
        phone: phone ?? '',
        ...(birthday ? { birthday } : {}),
        stamps: 0,
      };
      return [...customers, result];
    }
    result = {
      ...match,
      ...(phone && !normalizePhone(match.phone) ? { phone } : {}),
      ...(birthday && !match.birthday ? { birthday } : {}),
    };
    return customers.map((c) => (c.id === match.id ? result! : c));
  });
  return result!;
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

  return priceFromMenu(menu, requested, { isAuthenticated, fromEdition: Boolean(editionId) });
}

// Deliberately separate from PUT /api/data/doce-orders: a customer placing
// an order from the public cardápio may only append a new order, never
// overwrite or read the full order list (which would leak every other
// customer's data or let anyone wipe the order book).
export async function POST(request: Request) {
  if (!isDbConfigured()) {
    return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  }
  // The admin panel's "Lançar pedido" form calls this same endpoint
  // authenticated (session cookie present) — use its confeitaria when
  // there is one. An anonymous request is the public cardápio checkout,
  // which names its own confeitaria explicitly (each one has its own
  // /{bakeryId}/cardapio page) since there's no session to read it from.
  const session = await auth();
  const isAuthenticated = Boolean(session?.user.bakeryId);
  // Only the anonymous public-checkout path is throttled — an admin
  // lançando pedidos manually all day is expected traffic, not abuse.
  if (
    !isAuthenticated &&
    !(await checkRateLimit(`order:${clientIp(request)}`, 20, 60 * 60 * 1000))
  ) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }

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
    paymentMethod?: 'Pix' | 'Cartão' | 'Dinheiro' | 'Presente';
    paymentStatus?: 'Pago' | 'Pendente';
    newCustomer?: boolean;
  };
  // Never falls back to a fixed confeitaria: an anonymous request that
  // omits bakeryId (malformed, or a bare curl/script hitting this route
  // directly) used to silently land on LAVILY_BAKERY_ID, which meant
  // anyone on the internet could inject a fake order — and a fake loyalty
  // customer — straight into Lavily's real, live order book with zero
  // authentication. Every caller must now name a real confeitaria.
  const bakeryId = session?.user.bakeryId ?? body.bakeryId?.trim();
  if (!bakeryId) {
    return NextResponse.json({ error: 'missing_bakery' }, { status: 400 });
  }

  const phone = normalizePhone(body.phone);
  // No painel, um número inválido só é ignorado (o pedido não trava);
  // no cardápio, o celular válido é obrigatório (logo abaixo).
  if (!isAuthenticated && body.phone?.trim() && !phone) {
    return NextResponse.json({ error: 'invalid_phone' }, { status: 400 });
  }
  // Pelo cardápio o celular é obrigatório: é ele que liga o pedido ao
  // cartão fidelidade certo. Cliente já cadastrado pode mandar só o
  // celular (o nome vem do cadastro).
  if (!isAuthenticated && !phone) {
    return NextResponse.json({ error: 'invalid_phone' }, { status: 400 });
  }
  if (!body.customer?.trim() && phone && !body.newCustomer) {
    const customers = (await readState<Customer[]>(bakeryId, CUSTOMERS_KEY)) ?? [];
    const known = customers.find((c) => normalizePhone(c.phone) === phone);
    if (known) body.customer = known.name;
  }
  if (!body.customer?.trim() || !body.date?.trim()) {
    return NextResponse.json({ error: 'invalid_order' }, { status: 400 });
  }

  // Pedido anônimo (cardápio público): o cliente só escolhe itens do
  // cardápio publicado, o nome/contato e a forma de pagamento. Status,
  // pagamento "Pago", valor livre e textos gigantes são coisa do painel.
  if (!isAuthenticated) {
    const tooLong =
      body.customer.length > 120 ||
      (body.phone?.length ?? 0) > 40 ||
      (body.item?.length ?? 0) > 1500 ||
      (body.notes?.length ?? 0) > 1000 ||
      body.date.length > 20 ||
      (body.deliveryDate?.length ?? 0) > 20 ||
      (body.birthday?.length ?? 0) > 20;
    const badItems =
      !body.items?.length ||
      body.items.length > 50 ||
      body.items.some(
        (i) =>
          typeof i?.name !== 'string' ||
          i.name.length > 120 ||
          !Number.isInteger(i.quantity) ||
          i.quantity < 1 ||
          i.quantity > 999,
      );
    if (tooLong || badItems) {
      return NextResponse.json({ error: 'invalid_order' }, { status: 400 });
    }
    body.status = 'Novo';
    body.paymentStatus = 'Pendente';
    body.orderDate = undefined;
    body.deliveryTime = undefined;
    body.editionId = undefined;
    body.value = undefined;
    if (body.paymentMethod && !['Pix', 'Cartão', 'Dinheiro'].includes(body.paymentMethod)) {
      body.paymentMethod = undefined;
    }
    for (const i of body.items ?? []) i.unitPrice = undefined;
  }

  // An anonymous order must name a confeitaria that actually exists — this
  // also means priceItems() below always resolves against a real menu
  // instead of silently pricing everything at zero for a typo'd/guessed id.
  if (!isAuthenticated) {
    const bakeryExists = await readState<unknown>(bakeryId, 'doce-bakery-profile');
    if (!bakeryExists) {
      return NextResponse.json({ error: 'bakery_not_found' }, { status: 404 });
    }
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
    ...(body.paymentMethod ? { paymentMethod: body.paymentMethod } : {}),
    paymentStatus: body.paymentStatus === 'Pago' ? 'Pago' : 'Pendente',
    ...(body.paymentStatus === 'Pago'
      ? {
          paymentDate: new Date().toISOString().slice(0, 10),
          financeLogged: true,
        }
      : {}),
  };
  // updateStateAtomic, not readState+writeState — two orders created in
  // the same instant (two customers checking out at once) must not let
  // the second writer's stale snapshot drop the first one's order.
  const customer = await ensureCustomer(
    bakeryId,
    order.customer,
    phone,
    body.birthday?.trim() || undefined,
    Boolean(body.newCustomer),
  );
  // Liga o pedido ao cadastro (os selos usam o id, não o nome) e guarda o
  // celular para a confeitaria conseguir falar com o cliente.
  order.customerId = customer.id;
  if (phone) order.phone = phone;
  await updateStateAtomic<Order[]>(bakeryId, ORDERS_KEY, (current) => [
    order,
    ...(current ?? []),
  ]);
  const stamps = customer.stamps;
  const financeItem = order.financeLogged
    ? await logSale(bakeryId, order)
    : undefined;

  return NextResponse.json({ order, stamps, financeItem });
}
