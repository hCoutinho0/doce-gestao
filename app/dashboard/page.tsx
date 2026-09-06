'use client';

import Image from 'next/image';
import { useEffect, useMemo, useRef, useState, type ComponentProps } from 'react';
import Link from 'next/link';
import {
  Bar,
  BarChart,
  CartesianGrid,
  XAxis,
} from 'recharts';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import {
  ArrowDownRight,
  ArrowUpRight,
  BadgeDollarSign,
  Bell,
  BellOff,
  CakeSlice,
  Check,
  ChevronLeft,
  ClipboardList,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Download,
  Eye,
  Gift,
  LayoutDashboard,
  LoaderCircle,
  LogOut,
  Minus,
  Menu,
  PackageOpen,
  Pencil,
  Printer,
  Plus,
  Search,
  Settings2,
  ShoppingBag,
  Sparkles,
  Trash2,
  Copy,
  Upload,
  UserPlus,
  Users,
  WalletCards,
  X,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { BAKERY_KEY, type BakeryProfile } from '@/lib/bakery';
import { useUserSession, signOut } from '@/lib/auth';
import type { Invite } from '@/lib/tenant';

type View =
  | 'dashboard'
  | 'orders'
  | 'stock'
  | 'pricing'
  | 'finance'
  | 'menu'
  | 'products'
  | 'customers'
  | 'loyalty'
  | 'team';
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
const ORDER_STATUSES = ['Novo', 'Produção', 'Pronto', 'Entrega', 'Concluído'];
const PAYMENT_METHODS = ['Pix', 'Cartão', 'Dinheiro', 'Presente'] as const;
// `cost` é sempre o preço por `unit` (uma unidade/pacote comprado) — o
// formulário de cadastro pede "valor pago" e calcula esse preço unitário na
// hora, não pede o valor por unidade diretamente. `weight` é opcional e só
// existe em ingredientes: o peso de UM pacote/unidade comprado (ex.: uma
// lata de leite condensado com 395g) — é o que permite uma linha de receita
// dizer "usei 200g disso" e cobrar só a fração correspondente do valor
// pago, em vez do pacote inteiro.
type StockItem = {
  id: number;
  name: string;
  qty: number;
  unit: string;
  min: number;
  cost: number;
  category?: 'Ingrediente' | 'Embalagem';
  weight?: { value: number; unit: 'g' | 'kg' };
};
type FinanceItem = {
  id: number;
  description: string;
  type: 'Entrada' | 'Saída';
  category?: string;
  value: number;
  date: string;
};

const FINANCE_CATEGORIES: Record<'Entrada' | 'Saída', string[]> = {
  Entrada: ['Vendas', 'Investimentos'],
  Saída: [
    'Insumos',
    'Embalagens',
    'Equipamentos',
    'Impostos',
    'Contas',
    'Imprevistos',
    'Prolabore',
  ],
};

// Older lançamentos stored the date as a pre-formatted pt-BR string
// (04/09/2026); new ones store ISO (yyyy-mm-dd) from a date input so month
// navigation can filter reliably. Accept both so nothing already saved
// breaks.
function parseFinanceDate(date: string): Date | null {
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  const br = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(date);
  if (br) return new Date(Number(br[3]), Number(br[2]) - 1, Number(br[1]));
  return null;
}

function formatFinanceDate(date: string): string {
  const parsed = parseFinanceDate(date);
  return parsed ? parsed.toLocaleDateString('pt-BR') : date;
}

function isSameMonth(date: string, reference: Date): boolean {
  const parsed = parseFinanceDate(date);
  return (
    !!parsed &&
    parsed.getFullYear() === reference.getFullYear() &&
    parsed.getMonth() === reference.getMonth()
  );
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

// Only orders with structured items and an ISO deliveryDate count — legacy
// free-text orders (from before Fase 1) can't be placed in a period
// reliably, so they're left out rather than guessed at.
function productSalesInRange(
  orders: Order[],
  start: Date,
  end: Date,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const order of orders) {
    if (!order.items?.length || !order.deliveryDate) continue;
    const delivery = parseFinanceDate(order.deliveryDate);
    if (!delivery || delivery < start || delivery > end) continue;
    for (const item of order.items) {
      counts.set(item.name, (counts.get(item.name) ?? 0) + item.quantity);
    }
  }
  return counts;
}

function bestAndWorst(counts: Map<string, number>): {
  best: [string, number] | null;
  worst: [string, number] | null;
} {
  if (counts.size === 0) return { best: null, worst: null };
  let best: [string, number] = ['', -Infinity];
  let worst: [string, number] = ['', Infinity];
  for (const entry of counts) {
    if (entry[1] > best[1]) best = entry;
    if (entry[1] < worst[1]) worst = entry;
  }
  return { best, worst };
}
type MenuItem = {
  id: number;
  name: string;
  category: string;
  price: number;
  available: boolean;
  emoji: string;
  photoUrl?: string;
  weight?: { value: number; unit: 'kg' | 'g' | 'l' };
};

// A past weekly edition, archived when the admin starts a new one — the
// live edition itself stays in doce-menu/doce-menu-week* exactly as
// before, so the public cardápio and order pricing don't need to change.
type MenuEdition = {
  id: string;
  weekTitle: string;
  weekStart: string;
  weekEnd: string;
  items: MenuItem[];
  archivedAt: string;
};

// A simple named product + flavor, independent of the weekly cardápio —
// meant for things like custom cakes that aren't part of a given week's
// published menu but still need to show up when building a pedido.
type Product = {
  id: number;
  name: string;
  flavor: string;
  price?: number;
  weight?: { value: number; unit: 'g' | 'kg' | 'ml' | 'l' | 'unidade' };
};

// Grams/ml are the base units so kg and l (×1000) compare on the same
// scale — used to show "quanto custa por grama/ml" while precificando.
function pricePerBaseUnit(product: Product): string | null {
  if (!product.price || !product.weight?.value) return null;
  const { value, unit } = product.weight;
  if (unit === 'unidade') {
    return `${money(product.price / value)}/un`;
  }
  const grams = unit === 'kg' ? value * 1000 : unit === 'l' ? value * 1000 : value;
  const baseUnit = unit === 'kg' || unit === 'g' ? 'g' : 'ml';
  return `${money(product.price / grams)}/${baseUnit}`;
}

// A simple manual to-do item shown on the Visão geral — no automatic
// suggestions, just whatever the admin types.
type Task = { id: number; text: string; done: boolean; createdAt: string };

// `unit` é a unidade em que ESSA linha da receita foi medida — pode ser
// diferente da unidade em que o item foi comprado no estoque. É o que
// permite comprar um pacote de 395g e usar só 200g numa receita.
type RecipeLine = {
  id: number;
  stockId: number;
  quantity: number;
  unit: 'un' | 'g' | 'kg';
};
type HiddenCost = { id: number; name: string; percentage: number };
// productKind distingue de onde vem o produto sendo precificado — "menu"
// (já publicado no cardápio, o comportamento original) ou "catalog" (um
// produto só cadastrado em Produtos, ainda sem entrar no cardápio).
// Ausente = "menu", para fichas técnicas salvas antes desse campo existir.
type ProductRecipe = {
  productId: number;
  productKind?: 'menu' | 'catalog';
  productName?: string;
  yieldCount: number;
  recipeItems: RecipeLine[];
  hiddenCosts: HiddenCost[];
  profit: number;
  cardFee: number;
  tax: number;
  // Vendido por peso (ex.: bolo confeitado por kg) em vez de por unidade —
  // muda o preço sugerido de "por unidade" para "por kg".
  soldByWeight?: boolean;
  // Perda de peso ao assar/cozinhar, opcional — reduz o peso final da
  // receita antes de calcular o preço por kg (a água evapora, o peso cru
  // não é o peso vendido).
  weightLossPercent?: number;
};
type LoyaltyItem = {
  id: number;
  name: string;
  phone: string;
  birthday?: string;
  stamps: number;
};

// Real confeitarias start with none of this — orders, stock, finance,
// cardápio and clientes all begin empty and fill up from what the admin
// and their customers actually do, not from sample rows.
const initialOrders: Order[] = [];
const initialStock: StockItem[] = [];
const initialFinance: FinanceItem[] = [];
const initialMenu: MenuItem[] = [];
const initialLoyalty: LoyaltyItem[] = [];

const navItems: { label: string; icon: typeof LayoutDashboard; view: View }[] =
  [
    { label: 'Visão geral', icon: LayoutDashboard, view: 'dashboard' },
    { label: 'Pedidos', icon: ShoppingBag, view: 'orders' },
    { label: 'Estoque', icon: PackageOpen, view: 'stock' },
    { label: 'Precificação', icon: BadgeDollarSign, view: 'pricing' },
    { label: 'Financeiro', icon: CircleDollarSign, view: 'finance' },
    { label: 'Cardápio', icon: CakeSlice, view: 'menu' },
    { label: 'Produtos', icon: ClipboardList, view: 'products' },
    { label: 'Clientes', icon: Users, view: 'customers' },
    { label: 'Fidelidade', icon: Gift, view: 'loyalty' },
    { label: 'Equipe', icon: UserPlus, view: 'team' },
  ];
const money = (value: number) =>
  value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fieldValue = (data: FormData, name: string) => {
  const value = data.get(name);
  return typeof value === 'string' ? value : '';
};
const MONTHS_PT = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];
const formatWeekRange = (startIso: string, endIso: string) => {
  const start = new Date(`${startIso}T00:00:00`);
  const end = new Date(`${endIso}T00:00:00`);
  if (start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()) {
    return `Semana de ${start.getDate()} a ${end.getDate()} de ${MONTHS_PT[start.getMonth()]}`;
  }
  return `Semana de ${start.getDate()} de ${MONTHS_PT[start.getMonth()]} a ${end.getDate()} de ${MONTHS_PT[end.getMonth()]}`;
};
type FormSubmit = {
  preventDefault: () => void;
  currentTarget: HTMLFormElement;
};

export default function Home() {
  const [view, setView] = useState<View>('dashboard');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [orders, setOrders] = useServerFetchedState('doce-orders', initialOrders);
  const [stock, setStock] = useStoredState('doce-stock-v2', initialStock);
  const [finance, setFinance] = useStoredState('doce-finance', initialFinance);
  const [menuItems, setMenuItems] = useStoredState('doce-menu', initialMenu);
  const [menuEditions, setMenuEditions] = useStoredState<MenuEdition[]>(
    'doce-menu-editions',
    [],
  );
  const [products, setProducts] = useStoredState<Product[]>(
    'doce-products',
    [],
  );
  const [tasks, setTasks] = useStoredState<Task[]>('doce-tasks', []);
  const [loyalty, setLoyalty] = useStoredState('doce-loyalty', initialLoyalty);
  const [recipes, setRecipes] = useStoredState<ProductRecipe[]>(
    'doce-pricing',
    [],
  );
  const [bakery, setBakery] = useState<BakeryProfile | null>(null);
  const { session, isLoading: sessionLoading } = useUserSession();
  const isBrowserReady = !sessionLoading;

  useEffect(() => {
    if (!session) return;
    void fetch(`/api/data/${BAKERY_KEY}`, {
      headers: { 'X-Panel-Request': '1' },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { value: BakeryProfile } | null) => {
        if (data?.value) setBakery(data.value);
      });
  }, [session]);

  useEffect(() => {
    if (isBrowserReady && !session) window.location.replace('/login');
  }, [isBrowserReady, session]);

  // "Este mês" segue a mesma convenção da aba Pedidos: agrupa pela data de
  // entrega, não pela data em que o pedido foi feito.
  const currentMonthOrders = orders.filter(
    (order) => order.deliveryDate && isSameMonth(order.deliveryDate, new Date()),
  );
  const todaySales = currentMonthOrders.reduce(
    (sum, order) => sum + order.value,
    0,
  );
  const profit = todaySales * 0.364;
  const lowStock = stock.filter((item) => item.qty < item.min);
  const visibleNavItems =
    session?.role === 'production'
      ? navItems.filter((item) =>
          ['dashboard', 'orders', 'stock', 'menu'].includes(item.view),
        )
      : navItems;
  const pageTitle = navItems.find((item) => item.view === view)?.label ?? '';

  if (!isBrowserReady || !session) {
    return (
      <main className="grid min-h-screen place-items-center bg-background">
        <div className="text-center">
          <LoaderCircle className="mx-auto size-7 animate-spin text-primary" />
          <p className="mt-3 text-sm text-muted-foreground">
            Verificando seu acesso…
          </p>
        </div>
      </main>
    );
  }

  const sidebarProps = {
    bakery,
    visibleNavItems,
    view,
    orders,
    onNavigate: (target: View) => {
      setView(target);
      setMobileNavOpen(false);
    },
  };

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto grid min-h-screen max-w-[1680px] lg:grid-cols-[256px_minmax(0,1fr)]">
        <aside className="hidden border-r border-sidebar-border bg-sidebar px-4 py-6 lg:flex lg:flex-col">
          <SidebarNav {...sidebarProps} />
        </aside>
        {mobileNavOpen && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <button
              aria-label="Fechar menu"
              className="absolute inset-0 bg-foreground/30 backdrop-blur-sm"
              onClick={() => setMobileNavOpen(false)}
            />
            <div className="absolute inset-y-0 left-0 flex w-[280px] flex-col bg-sidebar px-4 py-6 shadow-xl">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-sidebar-foreground/50">
                  Menu
                </span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Fechar menu"
                  onClick={() => setMobileNavOpen(false)}
                >
                  <X className="size-4" />
                </Button>
              </div>
              <SidebarNav {...sidebarProps} />
            </div>
          </div>
        )}

        <section className="min-w-0">
          <header className="sticky top-0 z-20 flex h-[72px] items-center gap-3 border-b bg-background/90 px-4 backdrop-blur-xl sm:px-7">
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              aria-label="Abrir menu"
              onClick={() => setMobileNavOpen(true)}
            >
              <Menu />
            </Button>
            <HeaderSearch
              orders={orders}
              products={products}
              customers={loyalty}
              onNavigate={setView}
            />
            <div className="ml-auto flex items-center gap-3">
              <Badge
                variant="outline"
                className="hidden border-[#cce7d7] bg-[#edf9f2] text-[#28724a] sm:inline-flex"
              >
                <span className="size-1.5 rounded-full bg-[#3aa66c]" /> Dados
                sincronizados
              </Badge>
              <div className="flex items-center gap-3 rounded-xl p-1 text-left">
                <div className="grid size-9 place-items-center rounded-full bg-[#e8d7f1] text-sm font-bold text-[#5a2a7d]">
                  {session.initials}
                </div>
                <div className="hidden sm:block">
                  <p className="text-sm font-semibold leading-tight">
                    {session.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {session.roleLabel}
                  </p>
                </div>
              </div>
              {session.role === 'admin' && (
                <Link
                  href="/configurar"
                  className="grid size-9 place-items-center rounded-xl text-muted-foreground transition hover:bg-muted hover:text-foreground"
                  title="Configurar confeitaria"
                  aria-label="Configurar confeitaria"
                >
                  <Settings2 className="size-4" />
                </Link>
              )}
              <Button
                variant="ghost"
                size="icon"
                title="Sair do painel"
                aria-label="Sair do painel"
                onClick={() => void signOut()}
              >
                <LogOut />
              </Button>
            </div>
          </header>

          <MobileNav view={view} setView={setView} items={visibleNavItems} />
          <div className="p-4 sm:p-7 xl:p-9">
            {view === 'dashboard' && (
              <Dashboard
                orders={orders}
                activeOrdersCount={currentMonthOrders.length}
                lowStock={lowStock}
                finance={finance}
                todaySales={todaySales}
                profit={profit}
                setView={setView}
                firstName={session.name.trim().split(/\s+/)[0] || 'por aí'}
                tasks={tasks}
                setTasks={setTasks}
              />
            )}
            {view === 'orders' && (
              <Orders
                orders={orders}
                setOrders={setOrders}
                menuItems={menuItems}
                menuEditions={menuEditions}
                products={products}
                customers={loyalty}
                setFinance={setFinance}
                setLoyalty={setLoyalty}
              />
            )}
            {view === 'stock' && <Stock stock={stock} setStock={setStock} />}
            {view === 'pricing' && (
              <Pricing
                stock={stock}
                menuItems={menuItems}
                products={products}
                recipes={recipes}
                setRecipes={setRecipes}
              />
            )}
            {view === 'finance' && (
              <Finance items={finance} setItems={setFinance} />
            )}
            {view === 'menu' && (
              <DigitalMenu
                items={menuItems}
                setItems={setMenuItems}
                editions={menuEditions}
                setEditions={setMenuEditions}
                bakeryId={session.bakeryId ?? ''}
              />
            )}
            {view === 'products' && (
              <ProductsCatalog items={products} setItems={setProducts} />
            )}
            {view === 'customers' && (
              <Customers
                loyalty={loyalty}
                orders={orders}
                setLoyalty={setLoyalty}
              />
            )}
            {view === 'loyalty' && (
              <Loyalty items={loyalty} setItems={setLoyalty} />
            )}
            {view === 'team' && <Team isAdmin={session.role === 'admin'} />}
            <p className="mt-8 text-center text-xs text-muted-foreground">
              {pageTitle} • Dados sincronizados na nuvem • Acesso: {session.roleLabel}
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}

// Same shape as the old localStorage-backed hook it replaces, so every
// call site below stays untouched — only the storage moved, from the
// browser to a Cosmos DB document shared by every device signed in to this
// confeitaria.
function useStoredState<T>(
  key: string,
  initial: T,
): [T, (value: T | ((old: T) => T)) => void] {
  const [state, setState] = useState<T>(initial);
  const [loaded, setLoaded] = useState(false);
  const skipNextWrite = useRef(true);

  useEffect(() => {
    let cancelled = false;
    skipNextWrite.current = true;
    // Only the admin panel sends this header — it tells the API "read MY
    // confeitaria's data" even for the handful of keys (menu, bakery
    // profile) the public cardápio also reads anonymously and expects
    // pinned to one fixed confeitaria regardless of whose session cookie
    // happens to be in the browser.
    void fetch(`/api/data/${key}`, { headers: { 'X-Panel-Request': '1' } })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { value: T } | null) => {
        if (cancelled) return;
        if (data?.value !== null && data?.value !== undefined) {
          setState(data.value);
        }
        setLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [key]);

  useEffect(() => {
    if (!loaded) return;
    if (skipNextWrite.current) {
      skipNextWrite.current = false;
      return;
    }
    void fetch(`/api/data/${key}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: state }),
    });
  }, [key, state, loaded]);

  return [state, setState];
}

// Orders are touched from two independent places — the admin panel and the
// public cardápio — so a full-array PUT of a stale in-memory snapshot from
// here can silently erase whatever the other side wrote in between (that's
// exactly how two real customer orders were lost). This variant only ever
// reads; every mutation goes through /api/orders instead, which reads the
// current database state and writes back just its own change.
function useServerFetchedState<T>(key: string, initial: T): [T, (value: T | ((old: T) => T)) => void] {
  const [state, setState] = useState<T>(initial);

  useEffect(() => {
    let cancelled = false;
    void fetch(`/api/data/${key}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { value: T } | null) => {
        if (cancelled) return;
        if (data?.value !== null && data?.value !== undefined) {
          setState(data.value);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [key]);

  return [state, setState];
}

function SidebarNav({
  bakery,
  visibleNavItems,
  view,
  orders,
  onNavigate,
}: {
  bakery: BakeryProfile | null;
  visibleNavItems: { label: string; icon: typeof LayoutDashboard; view: View }[];
  view: View;
  orders: Order[];
  onNavigate: (target: View) => void;
}) {
  return (
    <>
      <Brand bakery={bakery} />
      <nav aria-label="Navegação principal" className="space-y-1">
        {visibleNavItems.map(({ label, icon: Icon, view: target }) => (
          <button
            key={label}
            onClick={() => onNavigate(target)}
            className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-colors ${view === target ? 'bg-sidebar-accent text-primary' : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground'}`}
          >
            <Icon className="size-[18px]" />
            <span>{label}</span>
            {target === 'orders' && orders.length ? (
              <span className="ml-auto rounded-full bg-[#ddc2ec] px-2 py-0.5 text-[11px] font-bold text-[#4a1f68]">
                {orders.length}
              </span>
            ) : null}
          </button>
        ))}
      </nav>
    </>
  );
}

function HeaderSearch({
  orders,
  products,
  customers,
  onNavigate,
}: {
  orders: Order[];
  products: Product[];
  customers: LoyaltyItem[];
  onNavigate: (v: View) => void;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const q = query.trim().toLowerCase();

  const matchedOrders = q
    ? orders
        .filter(
          (o) =>
            o.id.toLowerCase().includes(q) ||
            o.customer.toLowerCase().includes(q) ||
            o.item.toLowerCase().includes(q),
        )
        .slice(0, 6)
    : [];
  const matchedProducts = q
    ? products
        .filter(
          (p) =>
            p.name.toLowerCase().includes(q) ||
            p.flavor.toLowerCase().includes(q),
        )
        .slice(0, 6)
    : [];
  const matchedCustomers = q
    ? customers.filter((c) => c.name.toLowerCase().includes(q)).slice(0, 6)
    : [];
  const hasResults =
    matchedOrders.length + matchedProducts.length + matchedCustomers.length >
    0;

  const go = (view: View) => {
    onNavigate(view);
    setOpen(false);
    setQuery('');
  };

  return (
    <div className="relative hidden max-w-md flex-1 sm:block">
      <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <input
        aria-label="Buscar no sistema"
        placeholder="Buscar pedido, produto ou cliente..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className="h-10 w-full rounded-xl border bg-muted/45 pl-10 pr-4 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
      />
      {open && q && (
        <div className="absolute left-0 right-0 top-12 z-30 max-h-80 overflow-y-auto rounded-xl border bg-card p-2 text-sm shadow-lg">
          {!hasResults && (
            <p className="p-3 text-xs text-muted-foreground">
              Nada encontrado para &ldquo;{query}&rdquo;.
            </p>
          )}
          {matchedOrders.length > 0 && (
            <div className="mb-1">
              <p className="px-2 py-1 text-[10px] font-semibold uppercase text-muted-foreground">
                Pedidos
              </p>
              {matchedOrders.map((o) => (
                <button
                  key={o.id}
                  onClick={() => go('orders')}
                  className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left hover:bg-muted/60"
                >
                  <span className="truncate">
                    {o.id} — {o.customer}
                  </span>
                  <StatusBadge status={o.status} />
                </button>
              ))}
            </div>
          )}
          {matchedProducts.length > 0 && (
            <div className="mb-1">
              <p className="px-2 py-1 text-[10px] font-semibold uppercase text-muted-foreground">
                Produtos
              </p>
              {matchedProducts.map((p) => (
                <button
                  key={p.id}
                  onClick={() => go('products')}
                  className="flex w-full items-center rounded-lg px-2 py-1.5 text-left hover:bg-muted/60"
                >
                  {p.name} - {p.flavor}
                </button>
              ))}
            </div>
          )}
          {matchedCustomers.length > 0 && (
            <div>
              <p className="px-2 py-1 text-[10px] font-semibold uppercase text-muted-foreground">
                Clientes
              </p>
              {matchedCustomers.map((c) => (
                <button
                  key={c.id}
                  onClick={() => go('customers')}
                  className="flex w-full items-center rounded-lg px-2 py-1.5 text-left hover:bg-muted/60"
                >
                  {c.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Brand({ bakery }: { bakery: BakeryProfile | null }) {
  return (
    <div className="mb-8 flex items-center gap-3 px-2">
      <span className="grid size-10 place-items-center overflow-hidden rounded-2xl bg-primary text-xl text-primary-foreground shadow-sm">
        {bakery?.logo ? (
          <Image
            src={bakery.logo}
            alt={`Logotipo de ${bakery.name}`}
            width={40}
            height={40}
            unoptimized
            className="size-full object-cover"
          />
        ) : bakery?.icon ? (
          bakery.icon
        ) : (
          <CakeSlice className="size-5" />
        )}
      </span>
      <div>
        <p className="font-heading text-lg font-bold leading-tight">
          Confeitto
        </p>
        <p className="text-xs text-muted-foreground">
          {bakery?.name || 'Sua confeitaria'}
        </p>
      </div>
    </div>
  );
}

function MobileNav({
  view,
  setView,
  items,
}: {
  view: View;
  setView: (v: View) => void;
  items: typeof navItems;
}) {
  return (
    <div className="sticky top-[72px] z-10 flex gap-2 overflow-x-auto border-b bg-background px-4 py-2 lg:hidden">
      {items.map(({ label, view: target }) => (
        <button
          key={target}
          onClick={() => setView(target)}
          className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ${view === target ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function PageHeading({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div>
        <h1 className="font-heading text-2xl font-bold tracking-tight sm:text-3xl">
          {title}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
      </div>
      {action}
    </div>
  );
}
function Panel({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-2xl border bg-card shadow-sm ${className}`}>
      {children}
    </section>
  );
}
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-1.5 text-xs font-semibold text-muted-foreground">
      <span>{label}</span>
      {children}
    </label>
  );
}
const inputClass =
  'h-10 rounded-xl border bg-background px-3 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/15';

function Dashboard({
  orders,
  activeOrdersCount,
  lowStock,
  finance,
  todaySales,
  profit,
  setView,
  firstName,
  tasks,
  setTasks,
}: {
  orders: Order[];
  activeOrdersCount: number;
  lowStock: StockItem[];
  finance: FinanceItem[];
  todaySales: number;
  profit: number;
  setView: (v: View) => void;
  firstName: string;
  tasks: Task[];
  setTasks: (v: Task[] | ((o: Task[]) => Task[])) => void;
}) {
  const entries = finance
    .filter((item) => item.type === 'Entrada')
    .reduce((sum, item) => sum + item.value, 0);
  const expenses = finance
    .filter((item) => item.type === 'Saída')
    .reduce((sum, item) => sum + item.value, 0);
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';
  // Só o que realmente precisa de atenção agora — Pronto/Entrega/Concluído
  // já passaram da parte que exige acompanhamento diário.
  const activeOrders = orders.filter(
    (o) => o.status === 'Novo' || o.status === 'Produção',
  );
  return (
    <div className="space-y-7">
      <PageHeading
        title={`${greeting}, ${firstName}!`}
        subtitle={`Sua confeitaria está com ${activeOrdersCount} pedidos ativos neste mês.`}
        action={
          <Button
            onClick={() => setView('orders')}
            size="lg"
            className="h-10 rounded-xl px-4 shadow-sm"
          >
            <Plus /> Novo pedido
          </Button>
        }
      />
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={CircleDollarSign}
          label="Vendas em pedidos"
          value={money(todaySales)}
          detail="Neste mês, por data de entrega"
          positive
        />
        <MetricCard
          icon={ShoppingBag}
          label="Pedidos ativos"
          value={String(activeOrdersCount)}
          detail="Neste mês, por data de entrega"
        />
        <MetricCard
          icon={Sparkles}
          label="Lucro estimado"
          value={money(profit)}
          detail="Margem projetada de 36,4% neste mês"
        />
        <MetricCard
          icon={PackageOpen}
          label="Estoque baixo"
          value={String(lowStock.length)}
          detail="Itens abaixo do mínimo"
        />
      </section>
      <TasksPanel tasks={tasks} setTasks={setTasks} />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,.75fr)]">
        <Panel className="overflow-hidden">
          <PanelTitle
            title="Pedidos recentes"
            subtitle="Novos e em produção agora"
            action={
              <Button
                onClick={() => setView('orders')}
                variant="ghost"
                size="sm"
              >
                Ver todos <ArrowUpRight />
              </Button>
            }
          />
          <OrderTable orders={activeOrders} compact />
        </Panel>
        <div className="space-y-5">
          <Panel className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="font-heading font-bold">Resumo financeiro</h2>
                <p className="text-xs text-muted-foreground">
                  Últimos lançamentos registrados
                </p>
              </div>
              <span className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary">
                <WalletCards className="size-4" />
              </span>
            </div>
            <div className="mt-5 grid grid-cols-3 gap-2">
              <div className="rounded-xl bg-green-50 p-3">
                <p className="text-[10px] font-semibold uppercase text-green-700">
                  Entradas
                </p>
                <p className="mt-1 text-sm font-bold text-green-800">
                  {money(entries)}
                </p>
              </div>
              <div className="rounded-xl bg-red-50 p-3">
                <p className="text-[10px] font-semibold uppercase text-red-700">
                  Saídas
                </p>
                <p className="mt-1 text-sm font-bold text-red-800">
                  {money(expenses)}
                </p>
              </div>
              <div className="rounded-xl bg-secondary p-3">
                <p className="text-[10px] font-semibold uppercase text-primary">
                  Saldo
                </p>
                <p className="mt-1 text-sm font-bold text-primary">
                  {money(entries - expenses)}
                </p>
              </div>
            </div>
            <div className="mt-4 divide-y">
              {finance.slice(0, 2).map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between py-2 text-xs"
                >
                  <span className="truncate pr-3 text-muted-foreground">
                    {item.description}
                  </span>
                  <strong
                    className={
                      item.type === 'Entrada'
                        ? 'text-green-700'
                        : 'text-red-700'
                    }
                  >
                    {item.type === 'Entrada' ? '+' : '−'} {money(item.value)}
                  </strong>
                </div>
              ))}
            </div>
            <Button
              onClick={() => setView('finance')}
              variant="outline"
              className="mt-3 w-full rounded-xl"
            >
              Abrir financeiro
            </Button>
          </Panel>
          <Panel className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="font-heading font-bold">Atenção no estoque</h2>
                <p className="text-xs text-muted-foreground">
                  {lowStock.length} itens abaixo do mínimo
                </p>
              </div>
              <PackageOpen className="size-5 text-orange-600" />
            </div>
            <div className="mt-4 space-y-2">
              {lowStock.slice(0, 3).map((item) => (
                <div key={item.id} className="flex justify-between text-xs">
                  <span>{item.name}</span>
                  <strong className="text-orange-700">
                    {item.qty} {item.unit}
                  </strong>
                </div>
              ))}
            </div>
            <Button
              onClick={() => setView('stock')}
              variant="ghost"
              className="mt-3 w-full"
            >
              Ver estoque
            </Button>
          </Panel>
        </div>
      </div>
    </div>
  );
}

// Converts the VAPID public key (base64url, from the server) into the
// Uint8Array format PushManager.subscribe expects.
function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(rawData.length));
  for (let i = 0; i < rawData.length; i++) bytes[i] = rawData.charCodeAt(i);
  return bytes;
}

function TasksPanel({
  tasks,
  setTasks,
}: {
  tasks: Task[];
  setTasks: (v: Task[] | ((o: Task[]) => Task[])) => void;
}) {
  const [text, setText] = useState('');
  const [subscribed, setSubscribed] = useState<boolean | null>(null);
  const [subscribing, setSubscribing] = useState(false);
  const [reminderError, setReminderError] = useState('');

  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      setSubscribed(false);
      return;
    }
    navigator.serviceWorker
      .getRegistration('/sw.js')
      .then((registration) => registration?.pushManager.getSubscription())
      .then((sub) => setSubscribed(Boolean(sub)))
      .catch(() => setSubscribed(false));
  }, []);

  const add = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setTasks((old) => [
      { id: Date.now(), text: trimmed, done: false, createdAt: new Date().toISOString() },
      ...old,
    ]);
    setText('');
  };

  const enableReminders = async () => {
    setReminderError('');
    if (!('Notification' in window) || !('serviceWorker' in navigator)) {
      setReminderError('Seu navegador não tem suporte a notificações.');
      return;
    }
    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!publicKey) {
      setReminderError('Lembretes ainda não configurados no servidor.');
      return;
    }
    setSubscribing(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setReminderError('Permissão de notificação negada.');
        return;
      }
      const registration = await navigator.serviceWorker.register('/sw.js');
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
      const response = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: subscription.toJSON() }),
      });
      if (!response.ok) throw new Error('subscribe_failed');
      setSubscribed(true);
    } catch {
      setReminderError('Não foi possível ativar os lembretes agora.');
    } finally {
      setSubscribing(false);
    }
  };

  const pending = tasks.filter((t) => !t.done);
  const done = tasks.filter((t) => t.done);

  return (
    <Panel className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-heading text-lg font-bold">Tarefas</h2>
          <p className="text-xs text-muted-foreground">
            {pending.length === 0
              ? 'Nenhuma tarefa pendente.'
              : `${pending.length} pendente${pending.length > 1 ? 's' : ''}`}
          </p>
        </div>
        <Button
          type="button"
          variant={subscribed ? 'outline' : 'default'}
          size="sm"
          onClick={() => void enableReminders()}
          disabled={subscribing || subscribed === true}
        >
          {subscribed ? <Bell className="size-4" /> : <BellOff className="size-4" />}
          {subscribed ? 'Lembretes ativos' : 'Ativar lembretes'}
        </Button>
      </div>
      {reminderError && (
        <p className="mt-2 text-xs text-destructive">{reminderError}</p>
      )}
      <div className="mt-4 flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') add();
          }}
          placeholder="O que você precisa fazer?"
          className={inputClass}
        />
        <Button type="button" onClick={add} className="h-10 shrink-0">
          <Plus /> Adicionar
        </Button>
      </div>
      {tasks.length > 0 && (
        <div className="mt-4 space-y-1">
          {[...pending, ...done].map((task) => (
            <div
              key={task.id}
              className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-muted/40"
            >
              <input
                type="checkbox"
                checked={task.done}
                onChange={() =>
                  setTasks((old) =>
                    old.map((t) =>
                      t.id === task.id ? { ...t, done: !t.done } : t,
                    ),
                  )
                }
                className="size-4"
              />
              <span
                className={`flex-1 text-sm ${task.done ? 'text-muted-foreground line-through' : ''}`}
              >
                {task.text}
              </span>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Excluir ${task.text}`}
                onClick={() =>
                  setTasks((old) => old.filter((t) => t.id !== task.id))
                }
              >
                <Trash2 />
              </Button>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
  positive = false,
}: {
  icon: typeof CircleDollarSign;
  label: string;
  value: string;
  detail: string;
  positive?: boolean;
}) {
  return (
    <article className="rounded-2xl border bg-card p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="mb-4 flex items-center justify-between">
        <span className="grid size-9 place-items-center rounded-xl bg-primary/10 text-primary">
          <Icon className="size-[18px]" />
        </span>
        {positive && (
          <span className="text-xs font-semibold text-[#2f8c5a]">↗ em dia</span>
        )}
      </div>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 font-heading text-2xl font-bold tracking-tight">
        {value}
      </p>
      <p className="mt-2 text-xs text-muted-foreground">{detail}</p>
    </article>
  );
}
function PanelTitle({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between border-b px-5 py-4">
      <div>
        <h2 className="font-heading font-bold">{title}</h2>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </div>
      {action}
    </div>
  );
}
function StatusBadge({ status }: { status: string }) {
  const style: Record<string, string> = {
    Novo: 'bg-[#f3ecf8] text-[#7a4a97]',
    Produção: 'bg-[#fff4d9] text-[#8b6412]',
    Pronto: 'bg-[#e9f7ef] text-[#277447]',
    Entrega: 'bg-[#f5eff9] text-[#7c3aa8]',
    Concluído: 'bg-muted text-muted-foreground',
  };
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold ${style[status]}`}
    >
      {status}
    </span>
  );
}
const isDeliverySoon = (order: Order) => {
  if (!order.deliveryDate) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const delivery = new Date(`${order.deliveryDate}T00:00:00`);
  const days = Math.round((delivery.getTime() - today.getTime()) / 86400000);
  return days >= 0 && days <= 1;
};

function OrderTable({
  orders,
  compact = false,
  onStatus,
  onDelete,
  onMarkPaid,
}: {
  orders: Order[];
  compact?: boolean;
  onStatus?: (id: string, status: string) => void;
  onDelete?: (id: string) => void;
  onMarkPaid?: (id: string, method: Order['paymentMethod']) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead className="bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-5 py-3">Pedido</th>
            <th className="px-3 py-3">Cliente</th>
            <th className="px-3 py-3">Entrega</th>
            <th className="px-3 py-3">Valor</th>
            <th className="px-3 py-3">Pagamento</th>
            <th className="px-3 py-3">Status</th>
            {!compact && <th className="px-3 py-3">Ações</th>}
          </tr>
        </thead>
        <tbody className="divide-y">
          {orders.map((order) => (
            <tr key={order.id} className="hover:bg-muted/30">
              <td className="px-5 py-3.5">
                <p className="font-semibold">{order.id}</p>
                {order.orderDate && (
                  <p className="text-[11px] text-muted-foreground">
                    {formatIsoDate(order.orderDate)}
                  </p>
                )}
              </td>
              <td className="px-3 py-3.5">
                <p className="font-medium">{order.customer}</p>
                <p className="text-xs text-muted-foreground">{order.item}</p>
                {order.notes && (
                  <p className="mt-0.5 text-xs italic text-muted-foreground">
                    {order.notes}
                  </p>
                )}
              </td>
              <td className="px-3 py-3.5">
                <span
                  className={
                    isDeliverySoon(order)
                      ? 'inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-destructive'
                      : ''
                  }
                >
                  {isDeliverySoon(order) && <Clock3 className="size-3" />}
                  {order.date}
                </span>
              </td>
              <td className="px-3 py-3.5 font-medium">{money(order.value)}</td>
              <td className="px-3 py-3.5">
                {compact || !onMarkPaid ? (
                  <PaymentBadge order={order} />
                ) : order.paymentStatus === 'Pago' ? (
                  <div className="space-y-0.5">
                    <PaymentBadge order={order} />
                    {order.paymentMethod && (
                      <p className="text-[11px] text-muted-foreground">
                        {order.paymentMethod}
                      </p>
                    )}
                  </div>
                ) : (
                  <select
                    defaultValue=""
                    onChange={(e) => {
                      if (!e.target.value) return;
                      onMarkPaid(order.id, e.target.value as Order['paymentMethod']);
                    }}
                    className="h-8 rounded-lg border border-orange-300 bg-orange-50 px-2 text-xs font-semibold text-orange-800 outline-none focus:border-primary"
                  >
                    <option value="" disabled>
                      Marcar como pago...
                    </option>
                    {PAYMENT_METHODS.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                )}
              </td>
              <td className="px-3 py-3.5">
                {compact || !onStatus ? (
                  <StatusBadge status={order.status} />
                ) : (
                  <select
                    value={order.status}
                    onChange={(e) => onStatus(order.id, e.target.value)}
                    className="h-8 rounded-lg border bg-background px-2 text-xs font-semibold outline-none focus:border-primary"
                  >
                    {ORDER_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                )}
              </td>
              {!compact && (
                <td className="px-3 py-3.5">
                  <Button
                    onClick={() => onDelete?.(order.id)}
                    size="icon-sm"
                    variant="destructive"
                    aria-label="Excluir pedido"
                  >
                    <Trash2 />
                  </Button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {orders.length === 0 && <Empty label="Nenhum pedido cadastrado." />}
    </div>
  );
}

function PaymentBadge({ order }: { order: Order }) {
  return order.paymentStatus === 'Pago' ? (
    <span className="inline-flex rounded-full bg-[#e9f7ef] px-2.5 py-1 text-[11px] font-bold text-[#277447]">
      Pago
    </span>
  ) : (
    <span className="inline-flex rounded-full bg-orange-100 px-2.5 py-1 text-[11px] font-bold text-orange-800">
      Pendente
    </span>
  );
}

const NEW_CUSTOMER = '__new__';

function Orders({
  orders,
  setOrders,
  menuItems,
  menuEditions,
  products,
  customers,
  setFinance,
  setLoyalty,
}: {
  orders: Order[];
  setOrders: (v: Order[] | ((o: Order[]) => Order[])) => void;
  menuItems: MenuItem[];
  menuEditions: MenuEdition[];
  products: Product[];
  customers: LoyaltyItem[];
  setFinance: (v: FinanceItem[] | ((o: FinanceItem[]) => FinanceItem[])) => void;
  setLoyalty: (v: LoyaltyItem[] | ((o: LoyaltyItem[]) => LoyaltyItem[])) => void;
}) {
  const [customerChoice, setCustomerChoice] = useState('');
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newBirthday, setNewBirthday] = useState('');
  const [orderDate, setOrderDate] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [deliveryDate, setDeliveryDate] = useState('');
  const [deliveryTime, setDeliveryTime] = useState('');
  const [notes, setNotes] = useState('');
  const [paymentMethod, setPaymentMethod] =
    useState<Order['paymentMethod']>('Pix');
  const [alreadyPaid, setAlreadyPaid] = useState(false);
  const [quantities, setQuantities] = useState<Record<number, number>>({});
  const [productQuantities, setProductQuantities] = useState<
    Record<number, number>
  >({});
  const [productPrices, setProductPrices] = useState<Record<number, string>>(
    {},
  );
  const [submitting, setSubmitting] = useState(false);
  // 0 = a edição ao vivo (menuItems); 1, 2... = doce-menu-editions[n - 1],
  // uma semana arquivada — útil pra lançar um pedido retroativo com os
  // itens/preços que valiam naquela época.
  const [editionIndex, setEditionIndex] = useState(0);
  const [monthView, setMonthView] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [liveWeekTitle] = useStoredState('doce-menu-week', '');

  const salesStats = useMemo(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - 6);
    return {
      month: bestAndWorst(productSalesInRange(orders, monthStart, monthEnd)),
      week: bestAndWorst(productSalesInRange(orders, weekStart, now)),
    };
  }, [orders]);

  const viewedEdition =
    editionIndex > 0 ? menuEditions[editionIndex - 1] : undefined;
  const available = (viewedEdition ? viewedEdition.items : menuItems).filter(
    (item) => viewedEdition || item.available,
  );
  const weekLabel = viewedEdition
    ? viewedEdition.weekTitle ||
      (viewedEdition.weekStart && viewedEdition.weekEnd
        ? formatWeekRange(viewedEdition.weekStart, viewedEdition.weekEnd)
        : 'Edição arquivada')
    : liveWeekTitle || 'Semana atual';

  const cartItems = available
    .filter((item) => quantities[item.id] > 0)
    .map((item) => ({ ...item, quantity: quantities[item.id] }));
  const productCartItems = products
    .filter(
      (product) =>
        (productQuantities[product.id] ?? 0) > 0 &&
        Number(productPrices[product.id]) > 0,
    )
    .map((product) => ({
      id: product.id,
      name: `${product.name} - ${product.flavor}`,
      price: Number(productPrices[product.id]),
      quantity: productQuantities[product.id],
    }));
  const total =
    cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0) +
    productCartItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const customerName =
    customerChoice === NEW_CUSTOMER
      ? newName.trim()
      : customerChoice;
  const canSubmit =
    Boolean(customerName) &&
    (customerChoice !== NEW_CUSTOMER || Boolean(newBirthday)) &&
    Boolean(orderDate) &&
    Boolean(deliveryDate) &&
    Boolean(deliveryTime) &&
    cartItems.length + productCartItems.length > 0;

  const changeQuantity = (id: number, delta: number) =>
    setQuantities((old) => ({
      ...old,
      [id]: Math.max(0, (old[id] ?? 0) + delta),
    }));
  const changeProductQuantity = (id: number, delta: number) =>
    setProductQuantities((old) => ({
      ...old,
      [id]: Math.max(0, (old[id] ?? 0) + delta),
    }));

  const monthOrders = useMemo(
    () =>
      orders.filter((o) => o.deliveryDate && isSameMonth(o.deliveryDate, monthView)),
    [orders, monthView],
  );
  const monthLabel = monthView
    .toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
    .replace(/^\w/, (c) => c.toUpperCase());
  const changeMonthView = (delta: number) =>
    setMonthView((old) => new Date(old.getFullYear(), old.getMonth() + delta, 1));

  const add = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    const description = [...cartItems, ...productCartItems]
      .map((item) => `${item.quantity}× ${item.name}`)
      .join(', ');
    const formattedDate = `${deliveryDate.split('-').reverse().join('/')} às ${deliveryTime}`;
    const response = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customer: customerName,
        phone: customerChoice === NEW_CUSTOMER ? newPhone.trim() : undefined,
        birthday:
          customerChoice === NEW_CUSTOMER ? newBirthday : undefined,
        items: [
          ...cartItems.map((item) => ({
            name: item.name,
            quantity: item.quantity,
          })),
          ...productCartItems.map((item) => ({
            name: item.name,
            quantity: item.quantity,
            unitPrice: item.price,
          })),
        ],
        item: description,
        notes: notes.trim() || undefined,
        orderDate,
        deliveryDate,
        deliveryTime,
        date: formattedDate,
        value: total,
        status: 'Novo',
        editionId: viewedEdition?.id,
        paymentMethod,
        paymentStatus: alreadyPaid ? 'Pago' : 'Pendente',
      }),
    });
    setSubmitting(false);
    if (!response.ok) return;
    const { order, financeItem } = (await response.json()) as {
      order: Order;
      financeItem?: FinanceItem;
    };
    setOrders((old) => [order, ...old]);
    if (financeItem) setFinance((old) => [financeItem, ...old]);
    setCustomerChoice('');
    setNewName('');
    setNewPhone('');
    setNewBirthday('');
    setOrderDate(new Date().toISOString().slice(0, 10));
    setDeliveryDate('');
    setDeliveryTime('');
    setNotes('');
    setPaymentMethod('Pix');
    setAlreadyPaid(false);
    setQuantities({});
    setProductQuantities({});
    setProductPrices({});
    // Otherwise a retroactive order built from an archived week silently
    // leaves the picker parked on that old week — the next order (meant to
    // use today's live cardápio) would keep building from stale items/
    // prices unless the admin notices and clicks back manually.
    setEditionIndex(0);
  };
  const changeStatus = async (id: string, status: string) => {
    const response = await fetch(`/api/orders/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    if (!response.ok) return;
    const data = (await response.json()) as {
      order: Order;
      financeItem?: FinanceItem;
      customer?: LoyaltyItem;
    };
    setOrders((old) => old.map((o) => (o.id === id ? data.order : o)));
    if (data.financeItem) {
      const entry = data.financeItem;
      setFinance((old) => [entry, ...old]);
    }
    if (data.customer) {
      const updatedCustomer = data.customer;
      // Upsert, not a plain map — this component's local `loyalty` snapshot
      // was fetched once at mount, so a customer created by an order placed
      // afterwards (the common case: new customer's first order) won't be
      // in it yet. A `.map` that never matches still produces a "changed"
      // array reference, which would PUT that stale, customer-less list
      // back and erase the customer server-side just created.
      setLoyalty((old) =>
        old.some((c) => c.id === updatedCustomer.id)
          ? old.map((c) => (c.id === updatedCustomer.id ? updatedCustomer : c))
          : [...old, updatedCustomer],
      );
    }
  };
  const markPaid = async (id: string, method: Order['paymentMethod']) => {
    const response = await fetch(`/api/orders/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paymentStatus: 'Pago', paymentMethod: method }),
    });
    if (!response.ok) return;
    const data = (await response.json()) as {
      order: Order;
      financeItem?: FinanceItem;
    };
    setOrders((old) => old.map((o) => (o.id === id ? data.order : o)));
    if (data.financeItem) setFinance((old) => [data.financeItem!, ...old]);
  };
  return (
    <>
      <PageHeading
        title="Pedidos"
        subtitle="Lance, acompanhe, altere o status ou exclua encomendas."
      />
      <div className="mb-5 grid gap-4 sm:grid-cols-2">
        <Panel className="p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Produtos do mês
          </p>
          {salesStats.month.best ? (
            <div className="mt-3 space-y-2 text-sm">
              <p>
                🏆 Mais vendido:{' '}
                <strong>
                  {salesStats.month.best[0]} ({salesStats.month.best[1]})
                </strong>
              </p>
              <p>
                📉 Menos vendido:{' '}
                <strong>
                  {salesStats.month.worst![0]} ({salesStats.month.worst![1]})
                </strong>
              </p>
            </div>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">
              Sem pedidos com entrega agendada neste mês ainda.
            </p>
          )}
        </Panel>
        <Panel className="p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Produtos da semana
          </p>
          {salesStats.week.best ? (
            <div className="mt-3 space-y-2 text-sm">
              <p>
                🏆 Mais vendido:{' '}
                <strong>
                  {salesStats.week.best[0]} ({salesStats.week.best[1]})
                </strong>
              </p>
              <p>
                📉 Menos vendido:{' '}
                <strong>
                  {salesStats.week.worst![0]} ({salesStats.week.worst![1]})
                </strong>
              </p>
            </div>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">
              Sem pedidos com entrega agendada nos últimos 7 dias.
            </p>
          )}
        </Panel>
      </div>
      <Panel className="mb-5 p-5">
        <div className="grid gap-5 lg:grid-cols-2">
          <div className="space-y-3">
            <Field label="Cliente">
              <select
                value={customerChoice}
                onChange={(e) => setCustomerChoice(e.target.value)}
                className={inputClass}
              >
                <option value="" disabled>
                  Selecione...
                </option>
                {customers.map((c) => (
                  <option key={c.id} value={c.name}>
                    {c.name}
                  </option>
                ))}
                <option value={NEW_CUSTOMER}>+ Novo cliente</option>
              </select>
            </Field>
            {customerChoice === NEW_CUSTOMER && (
              <div className="grid grid-cols-2 gap-2 rounded-xl bg-muted/40 p-3">
                <Field label="Nome">
                  <input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    className={inputClass}
                    placeholder="Nome do cliente"
                  />
                </Field>
                <Field label="WhatsApp (opcional)">
                  <input
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
                    className={inputClass}
                    placeholder="(11) 90000-0000"
                  />
                </Field>
                <Field label="Aniversário">
                  <input
                    required
                    type="date"
                    value={newBirthday}
                    onChange={(e) => setNewBirthday(e.target.value)}
                    className={inputClass}
                  />
                </Field>
              </div>
            )}
            <Field label="Data do pedido">
              <input
                type="date"
                value={orderDate}
                onChange={(e) => setOrderDate(e.target.value)}
                className={inputClass}
              />
            </Field>
            <p className="-mt-2 text-[11px] text-muted-foreground">
              Mude para uma data passada ao lançar um pedido retroativo.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Data da entrega">
                <input
                  type="date"
                  value={deliveryDate}
                  onChange={(e) => setDeliveryDate(e.target.value)}
                  className={inputClass}
                />
              </Field>
              <Field label="Horário">
                <input
                  type="time"
                  value={deliveryTime}
                  onChange={(e) => setDeliveryTime(e.target.value)}
                  className={inputClass}
                />
              </Field>
            </div>
            <Field label="Observações (opcional)">
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className={`${inputClass} h-20 resize-none py-2`}
                placeholder="Sabor, decoração, restrições..."
              />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Forma de pagamento">
                <select
                  value={paymentMethod}
                  onChange={(e) =>
                    setPaymentMethod(e.target.value as Order['paymentMethod'])
                  }
                  className={inputClass}
                >
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </Field>
              <label className="mt-6 flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={alreadyPaid}
                  onChange={(e) => setAlreadyPaid(e.target.checked)}
                  className="size-4"
                />
                Já foi pago
              </label>
            </div>
          </div>
          <div className="space-y-4">
            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-semibold text-muted-foreground">
                  Produtos da semana
                </p>
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-sm"
                    aria-label="Semana anterior"
                    onClick={() =>
                      setEditionIndex((i) => Math.min(menuEditions.length, i + 1))
                    }
                    disabled={editionIndex >= menuEditions.length}
                  >
                    <ChevronLeft />
                  </Button>
                  <span className="w-28 truncate text-center text-[11px] text-muted-foreground">
                    {weekLabel}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-sm"
                    aria-label="Próxima semana"
                    onClick={() => setEditionIndex((i) => Math.max(0, i - 1))}
                    disabled={editionIndex === 0}
                  >
                    <ChevronRight />
                  </Button>
                </div>
              </div>
              {available.length === 0 ? (
                <p className="rounded-xl bg-muted/40 p-3 text-xs text-muted-foreground">
                  Nenhum produto publicado no cardápio desta semana.
                </p>
              ) : (
                <div className="max-h-60 space-y-1.5 overflow-y-auto rounded-xl border p-2">
                  {available.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-muted/40"
                    >
                      <span className="flex-1 truncate text-sm">
                        {item.name}{' '}
                        <span className="text-xs text-muted-foreground">
                          {money(item.price)}
                        </span>
                      </span>
                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          size="icon-sm"
                          variant="ghost"
                          onClick={() => changeQuantity(item.id, -1)}
                          aria-label={`Diminuir ${item.name}`}
                        >
                          <Minus />
                        </Button>
                        <span className="w-5 text-center text-sm font-semibold">
                          {quantities[item.id] ?? 0}
                        </span>
                        <Button
                          type="button"
                          size="icon-sm"
                          variant="ghost"
                          onClick={() => changeQuantity(item.id, 1)}
                          aria-label={`Aumentar ${item.name}`}
                        >
                          <Plus />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold text-muted-foreground">
                Produtos cadastrados
              </p>
              {products.length === 0 ? (
                <p className="rounded-xl bg-muted/40 p-3 text-xs text-muted-foreground">
                  Nenhum produto cadastrado ainda. Cadastre em &ldquo;Produtos&rdquo;.
                </p>
              ) : (
                <div className="max-h-60 space-y-1.5 overflow-y-auto rounded-xl border p-2">
                  {products.map((product) => (
                    <div
                      key={product.id}
                      className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-muted/40"
                    >
                      <span className="flex-1 truncate text-sm">
                        {product.name}{' '}
                        <span className="text-xs text-muted-foreground">
                          {product.flavor}
                        </span>
                      </span>
                      {(productQuantities[product.id] ?? 0) > 0 && (
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={productPrices[product.id] ?? ''}
                          onChange={(e) =>
                            setProductPrices((old) => ({
                              ...old,
                              [product.id]: e.target.value,
                            }))
                          }
                          placeholder="Preço"
                          className="h-8 w-20 rounded-lg border bg-background px-2 text-xs outline-none focus:border-primary"
                        />
                      )}
                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          size="icon-sm"
                          variant="ghost"
                          onClick={() => changeProductQuantity(product.id, -1)}
                          aria-label={`Diminuir ${product.name}`}
                        >
                          <Minus />
                        </Button>
                        <span className="w-5 text-center text-sm font-semibold">
                          {productQuantities[product.id] ?? 0}
                        </span>
                        <Button
                          type="button"
                          size="icon-sm"
                          variant="ghost"
                          onClick={() => changeProductQuantity(product.id, 1)}
                          aria-label={`Aumentar ${product.name}`}
                        >
                          <Plus />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="mt-4 flex items-center justify-between border-t pt-4">
          <div>
            <p className="text-xs text-muted-foreground">Valor do pedido</p>
            <p className="font-heading text-xl font-bold text-primary">
              {money(total)}
            </p>
          </div>
          <Button
            onClick={() => void add()}
            disabled={!canSubmit || submitting}
            className="h-10 rounded-xl"
          >
            <Plus /> Lançar pedido
          </Button>
        </div>
      </Panel>
      <div className="mb-5 flex items-center justify-center gap-3">
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Mês anterior"
          onClick={() => changeMonthView(-1)}
        >
          <ChevronLeft />
        </Button>
        <p className="w-44 text-center font-heading font-bold">{monthLabel}</p>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Próximo mês"
          onClick={() => changeMonthView(1)}
        >
          <ChevronRight />
        </Button>
      </div>
      <Panel className="overflow-hidden">
        <PanelTitle
          title={`${monthOrders.length} pedidos`}
          subtitle={`Entregues em ${monthLabel.toLowerCase()}`}
        />
        <OrderTable
          orders={monthOrders}
          onStatus={changeStatus}
          onMarkPaid={markPaid}
          onDelete={(id) => {
            void fetch(`/api/orders/${encodeURIComponent(id)}`, {
              method: 'DELETE',
            }).then((response) => {
              if (!response.ok) return;
              setOrders((old) => old.filter((o) => o.id !== id));
            });
          }}
        />
      </Panel>
    </>
  );
}

function StockSection({
  category,
  title,
  subtitle,
  stock,
  setStock,
}: {
  category: 'Ingrediente' | 'Embalagem';
  title: string;
  subtitle: string;
  stock: StockItem[];
  setStock: (v: StockItem[] | ((o: StockItem[]) => StockItem[])) => void;
}) {
  const items = stock.filter(
    (item) => (item.category ?? 'Ingrediente') === category,
  );
  const [weightUnit, setWeightUnit] = useState<'g' | 'kg'>('g');

  // Cadastrar um nome que já existe (na mesma categoria) é reposição: soma
  // na quantidade do item existente e recalcula o custo unitário como a
  // média ponderada entre a compra antiga e a nova, em vez de criar uma
  // linha duplicada — mesmo "match por nome" usado para clientes em
  // /api/orders.
  const add = (e: FormSubmit) => {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    const name = fieldValue(d, 'name').trim();
    const qty = Number(fieldValue(d, 'qty'));
    const purchaseValue = Number(fieldValue(d, 'purchaseValue'));
    if (!name || !Number.isFinite(qty) || qty <= 0) return;
    const weightValue =
      category === 'Ingrediente' ? Number(fieldValue(d, 'weightValue')) : 0;
    setStock((old) => {
      const match = old.find(
        (x) =>
          (x.category ?? 'Ingrediente') === category &&
          x.name.trim().toLowerCase() === name.toLowerCase(),
      );
      if (match) {
        const newQty = +(match.qty + qty).toFixed(3);
        const newCost = +((match.cost * match.qty + purchaseValue) / newQty).toFixed(4);
        return old.map((x) =>
          x.id === match.id
            ? {
                ...x,
                qty: newQty,
                cost: newCost,
                ...(weightValue > 0 && !x.weight
                  ? { weight: { value: weightValue, unit: weightUnit } }
                  : {}),
              }
            : x,
        );
      }
      return [
        ...old,
        {
          id: Date.now(),
          name,
          category,
          qty,
          unit: 'un',
          min: Number(fieldValue(d, 'min')) || 0,
          cost: qty > 0 ? +(purchaseValue / qty).toFixed(4) : 0,
          ...(weightValue > 0
            ? { weight: { value: weightValue, unit: weightUnit } }
            : {}),
        },
      ];
    });
    e.currentTarget.reset();
    setWeightUnit('g');
  };

  return (
    <>
      <PageHeading title={title} subtitle={subtitle} />
      <Panel className="mb-5 p-5">
        <form
          onSubmit={add}
          className={`grid gap-3 ${category === 'Ingrediente' ? 'md:grid-cols-6' : 'md:grid-cols-5'}`}
        >
          <Field label="Nome">
            <input
              required
              name="name"
              className={inputClass}
              placeholder="Repita um nome já cadastrado para repor"
            />
          </Field>
          {category === 'Ingrediente' && (
            <Field label="Peso do pacote">
              <div className="flex gap-1">
                <input
                  name="weightValue"
                  type="number"
                  step="0.01"
                  min="0"
                  className={`${inputClass} w-20`}
                  placeholder="Ex.: 395"
                />
                <select
                  value={weightUnit}
                  onChange={(e) => setWeightUnit(e.target.value as 'g' | 'kg')}
                  className={inputClass}
                >
                  <option value="g">g</option>
                  <option value="kg">kg</option>
                </select>
              </div>
            </Field>
          )}
          <Field label={category === 'Ingrediente' ? 'Quantidade' : 'Quantidade comprada'}>
            <input
              required
              name="qty"
              type="number"
              step="0.01"
              min="0.01"
              className={inputClass}
              placeholder="Nº de pacotes/unidades"
            />
          </Field>
          <Field label="Mínimo">
            <input
              name="min"
              type="number"
              step="0.01"
              className={inputClass}
              placeholder="Alerta de estoque baixo"
            />
          </Field>
          <Field label="Valor pago (R$)">
            <input
              required
              name="purchaseValue"
              type="number"
              step="0.01"
              min="0"
              className={inputClass}
            />
          </Field>
          <div className="flex items-end">
            <Button type="submit" className="h-10 w-full rounded-xl">
              <Plus /> Adicionar / repor
            </Button>
          </div>
        </form>
      </Panel>
      {items.length === 0 && (
        <Panel className="mb-8 p-10 text-center text-sm text-muted-foreground">
          Nenhum item cadastrado ainda.
        </Panel>
      )}
      <div className="mb-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => {
          const low = item.qty < item.min;
          const gCost = gramCostOf(item);
          return (
            <Panel key={item.id} className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">{item.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {money(item.cost)} / unidade
                    {item.weight
                      ? ` (${item.weight.value}${item.weight.unit})`
                      : ''}
                    {gCost != null ? ` • ${money(gCost)}/g` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <Badge variant={low ? 'destructive' : 'secondary'}>
                    {low ? 'Repor' : 'Normal'}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Excluir ${item.name}`}
                    onClick={() =>
                      setStock((old) => old.filter((x) => x.id !== item.id))
                    }
                  >
                    <Trash2 />
                  </Button>
                </div>
              </div>
              <div className="my-5 flex items-end justify-between">
                <p className="font-heading text-3xl font-bold">
                  {item.qty}{' '}
                  <span className="text-base font-medium text-muted-foreground">
                    {item.unit}
                  </span>
                </p>
                <p className="text-xs text-muted-foreground">mín. {item.min}</p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() =>
                    setStock((old) =>
                      old.map((x) =>
                        x.id === item.id
                          ? { ...x, qty: Math.max(0, +(x.qty - 1).toFixed(2)) }
                          : x,
                      ),
                    )
                  }
                >
                  − Saída
                </Button>
                <Button
                  className="flex-1"
                  onClick={() =>
                    setStock((old) =>
                      old.map((x) =>
                        x.id === item.id
                          ? { ...x, qty: +(x.qty + 1).toFixed(2) }
                          : x,
                      ),
                    )
                  }
                >
                  + Entrada
                </Button>
              </div>
            </Panel>
          );
        })}
      </div>
    </>
  );
}

function Stock({
  stock,
  setStock,
}: {
  stock: StockItem[];
  setStock: (v: StockItem[] | ((o: StockItem[]) => StockItem[])) => void;
}) {
  return (
    <>
      <StockSection
        category="Ingrediente"
        title="Ingredientes"
        subtitle="Cadastre insumos uma vez e reponha pelo nome — sem duplicar linhas."
        stock={stock}
        setStock={setStock}
      />
      <StockSection
        category="Embalagem"
        title="Embalagens"
        subtitle="Caixas, sacolas e etiquetas, separadas dos ingredientes."
        stock={stock}
        setStock={setStock}
      />
    </>
  );
}

// Preço por grama de um item de estoque — usado quando uma linha de receita
// mede em g/kg em vez de "un". Prioriza o peso do pacote cadastrado (novo
// modelo: valor pago ÷ (quantidade × peso do pacote)); sem isso, cai para a
// própria unidade de estoque do item quando ela já é de peso (kg/g) —
// mantém funcionando o estoque cadastrado antes desse campo existir.
function gramCostOf(item: StockItem): number | null {
  if (item.weight?.value) {
    const grams =
      item.weight.unit === 'kg' ? item.weight.value * 1000 : item.weight.value;
    return grams > 0 ? item.cost / grams : null;
  }
  if (item.unit === 'kg') return item.cost / 1000;
  if (item.unit === 'g') return item.cost;
  return null;
}

function lineCost(item: StockItem, quantity: number, unit: RecipeLine['unit']): number {
  if (unit === 'un') return quantity * item.cost;
  const grams = unit === 'kg' ? quantity * 1000 : quantity;
  const gCost = gramCostOf(item);
  return gCost != null ? grams * gCost : 0;
}

// Peso, em gramas, que essa linha contribui pro peso total da receita.
// Uma linha em "un" só soma peso se o item tiver o peso do pacote
// cadastrado (1 unidade = o pacote inteiro); embalagens nunca contam.
function lineWeightGrams(item: StockItem, quantity: number, unit: RecipeLine['unit']): number {
  if (unit === 'kg') return quantity * 1000;
  if (unit === 'g') return quantity;
  if (item.weight?.value) {
    return quantity * (item.weight.unit === 'kg' ? item.weight.value * 1000 : item.weight.value);
  }
  return 0;
}

function computeRecipeCost(recipe: {
  recipeItems: RecipeLine[];
  hiddenCosts: HiddenCost[];
}, stock: StockItem[]) {
  const enrichedItems = recipe.recipeItems
    .map((item) => ({
      ...item,
      stockItem: stock.find((entry) => entry.id === item.stockId),
    }))
    .filter((item) => item.stockItem);
  const ingredientLines = enrichedItems.filter(
    (item) => (item.stockItem?.category ?? 'Ingrediente') === 'Ingrediente',
  );
  const packagingLines = enrichedItems.filter(
    (item) => item.stockItem?.category === 'Embalagem',
  );
  const ingredientCost = ingredientLines.reduce(
    (sum, item) => sum + lineCost(item.stockItem!, item.quantity, item.unit),
    0,
  );
  const packagingCost = packagingLines.reduce(
    (sum, item) => sum + lineCost(item.stockItem!, item.quantity, item.unit),
    0,
  );
  const directCost = ingredientCost + packagingCost;
  const hiddenPercentage = recipe.hiddenCosts.reduce(
    (sum, item) => sum + item.percentage,
    0,
  );
  const hiddenTotal = (directCost * hiddenPercentage) / 100;
  const baseCost = directCost + hiddenTotal;
  const recipeWeightGrams = ingredientLines.reduce(
    (sum, item) => sum + lineWeightGrams(item.stockItem!, item.quantity, item.unit),
    0,
  );
  return {
    enrichedItems,
    ingredientCost,
    packagingCost,
    directCost,
    hiddenPercentage,
    hiddenTotal,
    baseCost,
    recipeWeightGrams,
  };
}

function Pricing({
  stock,
  menuItems,
  products,
  recipes,
  setRecipes,
}: {
  stock: StockItem[];
  menuItems: MenuItem[];
  products: Product[];
  recipes: ProductRecipe[];
  setRecipes: (v: ProductRecipe[] | ((o: ProductRecipe[]) => ProductRecipe[])) => void;
}) {
  const [tab, setTab] = useState<'ficha' | 'lucro'>('ficha');
  // "menu" = produto já publicado no cardápio (fluxo original); "catalog" =
  // produto cadastrado em Produtos, ainda sem entrar no cardápio — permite
  // montar a ficha técnica e já saber o preço antes de publicar.
  const [source, setSource] = useState<'menu' | 'catalog'>('menu');
  const [menuProductId, setMenuProductId] = useState<number | ''>(
    menuItems[0]?.id ?? '',
  );
  const [catalogProductId, setCatalogProductId] = useState<number | ''>(
    products[0]?.id ?? '',
  );
  const selectedProduct: { id: number; name: string; price?: number } | undefined =
    source === 'menu'
      ? menuItems.find((m) => m.id === menuProductId)
      : (() => {
          const p = products.find((x) => x.id === catalogProductId);
          return p ? { id: p.id, name: `${p.name} - ${p.flavor}`, price: p.price } : undefined;
        })();

  const saveRecipe = (recipe: ProductRecipe) =>
    setRecipes((old) =>
      old.some(
        (r) => r.productId === recipe.productId && (r.productKind ?? 'menu') === (recipe.productKind ?? 'menu'),
      )
        ? old.map((r) =>
            r.productId === recipe.productId && (r.productKind ?? 'menu') === (recipe.productKind ?? 'menu')
              ? recipe
              : r,
          )
        : [...old, recipe],
    );
  const removeRecipe = (productId: number, productKind: 'menu' | 'catalog') =>
    setRecipes((old) =>
      old.filter(
        (r) => !(r.productId === productId && (r.productKind ?? 'menu') === productKind),
      ),
    );

  const empty = source === 'menu' ? menuItems.length === 0 : products.length === 0;

  return (
    <>
      <PageHeading
        title="Ficha técnica e precificação"
        subtitle="Uma ficha por produto, com custo real e margem preservada — no cardápio ou ainda só cadastrado."
        action={
          <div className="flex gap-2">
            <Button
              variant={tab === 'ficha' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setTab('ficha')}
            >
              Ficha técnica
            </Button>
            <Button
              variant={tab === 'lucro' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setTab('lucro')}
            >
              Lucro por produto
            </Button>
          </div>
        }
      />
      {tab === 'ficha' ? (
        <>
          <Panel className="mb-5 p-5">
            <div className="mb-3 flex gap-2">
              <Button
                type="button"
                size="sm"
                variant={source === 'menu' ? 'default' : 'outline'}
                onClick={() => setSource('menu')}
              >
                Produto do cardápio
              </Button>
              <Button
                type="button"
                size="sm"
                variant={source === 'catalog' ? 'default' : 'outline'}
                onClick={() => setSource('catalog')}
              >
                Produto cadastrado (ainda fora do cardápio)
              </Button>
            </div>
            {source === 'menu' ? (
              <Field label="Produto do cardápio">
                <select
                  value={menuProductId}
                  onChange={(e) => setMenuProductId(Number(e.target.value))}
                  className={inputClass}
                >
                  {menuItems.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} — {money(item.price)}
                    </option>
                  ))}
                </select>
              </Field>
            ) : (
              <Field label="Produto cadastrado">
                <select
                  value={catalogProductId}
                  onChange={(e) => setCatalogProductId(Number(e.target.value))}
                  className={inputClass}
                >
                  {products.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} - {item.flavor}
                      {item.price ? ` — ${money(item.price)}` : ''}
                    </option>
                  ))}
                </select>
              </Field>
            )}
          </Panel>
          {empty ? (
            <Panel className="p-10 text-center text-sm text-muted-foreground">
              {source === 'menu'
                ? 'Cadastre produtos no cardápio antes de criar fichas técnicas.'
                : 'Cadastre um produto em "Produtos" antes de criar a ficha técnica.'}
            </Panel>
          ) : (
            selectedProduct &&
            (() => {
              const recipe = recipes.find(
                (r) => r.productId === selectedProduct.id && (r.productKind ?? 'menu') === source,
              );
              return (
                <RecipeEditor
                  // Remounts (resetting all local form state) sempre que o
                  // produto, a origem ou a existência da ficha mudam — sem
                  // isso, trocar de origem ou remover a ficha deixava o
                  // formulário com valores antigos na tela.
                  key={`${source}-${selectedProduct.id}-${recipe ? 'has-recipe' : 'no-recipe'}`}
                  product={selectedProduct}
                  stock={stock}
                  recipe={recipe}
                  onSave={(r) => saveRecipe({ ...r, productKind: source })}
                  onRemove={() => removeRecipe(selectedProduct.id, source)}
                />
              );
            })()
          )}
        </>
      ) : (
        <ProfitByProduct menuItems={menuItems} recipes={recipes} stock={stock} />
      )}
    </>
  );
}

const RECIPE_LINE_UNITS: { value: RecipeLine['unit']; label: string }[] = [
  { value: 'un', label: 'un' },
  { value: 'g', label: 'g' },
  { value: 'kg', label: 'kg' },
];

function RecipeEditor({
  product,
  stock,
  recipe,
  onSave,
  onRemove,
}: {
  product: { id: number; name: string; price?: number };
  stock: StockItem[];
  recipe: ProductRecipe | undefined;
  onSave: (recipe: ProductRecipe) => void;
  onRemove: () => void;
}) {
  const [productName, setProductName] = useState(
    recipe?.productName ?? product.name,
  );
  const [yieldCount, setYieldCount] = useState(recipe?.yieldCount ?? 1);
  const [recipeItems, setRecipeItems] = useState<RecipeLine[]>(
    recipe?.recipeItems ?? [],
  );
  const [hiddenCosts, setHiddenCosts] = useState<HiddenCost[]>(
    recipe?.hiddenCosts ?? [],
  );
  // Margem inicial em 100%: a confeitaria começa cobrindo o dobro do custo,
  // e ajusta para baixo caso ache melhor — nunca o contrário.
  const [profit, setProfit] = useState(recipe?.profit ?? 100);
  const [cardFee, setCardFee] = useState(recipe?.cardFee ?? 4.99);
  const [tax, setTax] = useState(recipe?.tax ?? 3);
  const [soldByWeight, setSoldByWeight] = useState(recipe?.soldByWeight ?? false);
  const [weightLossPercent, setWeightLossPercent] = useState(
    recipe?.weightLossPercent ?? 0,
  );
  const [lineUnit, setLineUnit] = useState<RecipeLine['unit']>('un');
  const [justSaved, setJustSaved] = useState(false);

  const {
    enrichedItems,
    ingredientCost,
    packagingCost,
    hiddenPercentage,
    hiddenTotal,
    baseCost,
    recipeWeightGrams,
  } = computeRecipeCost({ recipeItems, hiddenCosts }, stock);
  // Ordem pedida: custo (ingredientes + embalagens + gastos invisíveis) ->
  // soma o lucro pretendido sobre esse custo -> só depois soma taxa de
  // cartão/impostos sobre o preço já com lucro. Taxas nunca "comem" a
  // margem nem travam a conta — são só um adicional opcional no fim.
  const profitAmount = baseCost * (profit / 100);
  const priceBeforeFees = baseCost + profitAmount;
  const feesAmount = priceBeforeFees * ((cardFee + tax) / 100);
  const totalPrice = priceBeforeFees + feesAmount;
  const unitPrice = totalPrice / Math.max(1, yieldCount);
  // "Fixos" é a fatia de gastos indiretos (aluguel, marketing...) alocada
  // por %, que não muda com o quanto se produz. "Variáveis" é embalagem —
  // escala junto com cada unidade feita. Ingredientes fica separado por já
  // ser pedido como sua própria categoria.
  const fixedCost = hiddenTotal;
  const variableCost = packagingCost;
  const finalWeightGrams =
    recipeWeightGrams * (1 - Math.min(99, Math.max(0, weightLossPercent)) / 100);
  const pricePerKg = finalWeightGrams > 0 ? totalPrice / (finalWeightGrams / 1000) : 0;

  const addStockItem = (e: FormSubmit) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const stockId = Number(fieldValue(data, 'stockId'));
    const quantity = Number(fieldValue(data, 'quantity'));
    const unit = lineUnit;
    setRecipeItems((old) => {
      const found = old.find((item) => item.stockId === stockId && item.unit === unit);
      return found
        ? old.map((item) =>
            item.stockId === stockId && item.unit === unit
              ? { ...item, quantity: item.quantity + quantity }
              : item,
          )
        : [...old, { id: Date.now(), stockId, quantity, unit }];
    });
    e.currentTarget.reset();
    setLineUnit('un');
    setJustSaved(false);
  };
  const addHiddenCost = (e: FormSubmit) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    setHiddenCosts((old) => [
      ...old,
      {
        id: Date.now(),
        name: fieldValue(data, 'name'),
        percentage: Number(fieldValue(data, 'percentage')),
      },
    ]);
    e.currentTarget.reset();
    setJustSaved(false);
  };
  const save = () => {
    onSave({
      productId: product.id,
      productName: productName.trim() || product.name,
      yieldCount,
      recipeItems,
      hiddenCosts,
      profit,
      cardFee,
      tax,
      soldByWeight,
      ...(weightLossPercent > 0 ? { weightLossPercent } : {}),
    });
    setJustSaved(true);
  };

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_380px]">
      <div className="space-y-5">
        <Panel className="p-5">
          <div className="grid gap-4 sm:grid-cols-[1fr_150px]">
            <Field label="Nome do produto">
              <input
                value={productName}
                onChange={(e) => {
                  setProductName(e.target.value);
                  setJustSaved(false);
                }}
                className={inputClass}
              />
            </Field>
            <NumberField
              label="Rendimento (un.)"
              value={yieldCount}
              setValue={(v) => {
                setYieldCount(v);
                setJustSaved(false);
              }}
            />
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <p className="mb-1.5 text-xs font-semibold text-muted-foreground">
                Vendido por peso (kg)?
              </p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={soldByWeight ? 'default' : 'outline'}
                  onClick={() => {
                    setSoldByWeight(true);
                    setJustSaved(false);
                  }}
                >
                  Sim
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={!soldByWeight ? 'default' : 'outline'}
                  onClick={() => {
                    setSoldByWeight(false);
                    setJustSaved(false);
                  }}
                >
                  Não
                </Button>
              </div>
            </div>
            <NumberField
              label="Perda de peso ao assar/cozinhar (%, opcional)"
              value={weightLossPercent}
              setValue={(v) => {
                setWeightLossPercent(v);
                setJustSaved(false);
              }}
            />
          </div>
          <div className="mt-4 rounded-xl bg-muted/40 p-3 text-xs text-muted-foreground">
            Peso total da receita:{' '}
            <strong className="text-foreground">
              {recipeWeightGrams >= 1000
                ? `${(recipeWeightGrams / 1000).toFixed(3)} kg`
                : `${recipeWeightGrams.toFixed(0)} g`}
            </strong>
            {weightLossPercent > 0 && (
              <>
                {' '}
                • depois da perda:{' '}
                <strong className="text-foreground">
                  {finalWeightGrams >= 1000
                    ? `${(finalWeightGrams / 1000).toFixed(3)} kg`
                    : `${finalWeightGrams.toFixed(0)} g`}
                </strong>
              </>
            )}
          </div>
        </Panel>
        <Panel className="overflow-hidden">
          <PanelTitle
            title="Ingredientes da ficha técnica"
            subtitle="Escolha do estoque, a quantidade e a unidade usada nesta receita"
          />
          <form
            onSubmit={addStockItem}
            className="grid gap-3 border-b bg-muted/25 p-4 sm:grid-cols-[1fr_120px_100px_auto]"
          >
            <Field label="Ingrediente ou embalagem do estoque">
              <select
                required
                name="stockId"
                className={inputClass}
                defaultValue=""
              >
                <option value="" disabled>
                  Selecione...
                </option>
                <optgroup label="Ingredientes">
                  {stock
                    .filter(
                      (item) =>
                        (item.category ?? 'Ingrediente') === 'Ingrediente',
                    )
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name} — {money(item.cost)}/un
                        {item.weight ? ` (${item.weight.value}${item.weight.unit})` : ''}
                      </option>
                    ))}
                </optgroup>
                <optgroup label="Embalagens">
                  {stock
                    .filter((item) => item.category === 'Embalagem')
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name} — {money(item.cost)}/un
                      </option>
                    ))}
                </optgroup>
              </select>
            </Field>
            <Field label="Quantidade">
              <input
                required
                name="quantity"
                type="number"
                min="0.001"
                step="0.001"
                className={inputClass}
              />
            </Field>
            <Field label="Unidade">
              <select
                value={lineUnit}
                onChange={(e) => setLineUnit(e.target.value as RecipeLine['unit'])}
                className={inputClass}
              >
                {RECIPE_LINE_UNITS.map((u) => (
                  <option key={u.value} value={u.value}>
                    {u.label}
                  </option>
                ))}
              </select>
            </Field>
            <div className="flex items-end">
              <Button type="submit" className="h-10">
                <Plus /> Adicionar
              </Button>
            </div>
          </form>
          <div className="divide-y">
            {enrichedItems.map((item) => (
              <div
                key={item.id}
                className="grid grid-cols-[1fr_auto_auto] items-center gap-4 px-5 py-3.5"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold">
                      {item.stockItem?.name}
                    </p>
                    <Badge variant="outline">
                      {item.stockItem?.category ?? 'Ingrediente'}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {item.quantity} {item.unit} usado(s) • pacote de{' '}
                    {money(item.stockItem?.cost ?? 0)}
                    {item.stockItem?.weight
                      ? ` (${item.stockItem.weight.value}${item.stockItem.weight.unit})`
                      : ''}
                  </p>
                </div>
                <strong className="text-sm">
                  {money(lineCost(item.stockItem!, item.quantity, item.unit))}
                </strong>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Excluir ${item.stockItem?.name}`}
                  onClick={() => {
                    setRecipeItems((old) =>
                      old.filter((x) => x.id !== item.id),
                    );
                    setJustSaved(false);
                  }}
                >
                  <Trash2 />
                </Button>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3 bg-muted/35 px-5 py-4 text-sm">
            <span>
              Ingredientes{' '}
              <strong className="float-right">{money(ingredientCost)}</strong>
            </span>
            <span>
              Embalagens{' '}
              <strong className="float-right">{money(packagingCost)}</strong>
            </span>
          </div>
        </Panel>
        <Panel className="overflow-hidden">
          <PanelTitle
            title="Gastos invisíveis em porcentagem"
            subtitle="Cada percentual é aplicado sobre ingredientes + embalagens — vira o custo fixo abaixo"
          />
          <form
            onSubmit={addHiddenCost}
            className="grid gap-3 border-b bg-muted/25 p-4 sm:grid-cols-[1fr_180px_auto]"
          >
            <Field label="Descrição">
              <input
                required
                name="name"
                className={inputClass}
                placeholder="Ex.: Marketing"
              />
            </Field>
            <Field label="Percentual">
              <input
                required
                name="percentage"
                type="number"
                min="0"
                step="0.01"
                className={inputClass}
              />
            </Field>
            <div className="flex items-end">
              <Button type="submit" className="h-10">
                <Plus /> Adicionar gasto
              </Button>
            </div>
          </form>
          <div className="divide-y">
            {hiddenCosts.map((item) => (
              <div key={item.id} className="flex items-center gap-4 px-5 py-3.5">
                <span className="flex-1 text-sm font-medium">
                  {item.name}
                </span>
                <span className="text-xs text-muted-foreground">
                  {money(((ingredientCost + packagingCost) * item.percentage) / 100)}
                </span>
                <strong className="text-sm">{item.percentage}%</strong>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Excluir ${item.name}`}
                  onClick={() => {
                    setHiddenCosts((old) => old.filter((x) => x.id !== item.id));
                    setJustSaved(false);
                  }}
                >
                  <Trash2 />
                </Button>
              </div>
            ))}
          </div>
        </Panel>
        <Panel className="p-5">
          <PanelTitle title="Custos divididos" subtitle="" />
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl bg-muted p-3">
              <p className="text-[10px] uppercase text-muted-foreground">Ingredientes</p>
              <p className="mt-1 font-bold">{money(ingredientCost)}</p>
            </div>
            <div className="rounded-xl bg-muted p-3">
              <p className="text-[10px] uppercase text-muted-foreground">Custos fixos</p>
              <p className="mt-1 font-bold">{money(fixedCost)}</p>
            </div>
            <div className="rounded-xl bg-muted p-3">
              <p className="text-[10px] uppercase text-muted-foreground">Custos variáveis</p>
              <p className="mt-1 font-bold">{money(variableCost)}</p>
            </div>
            <div className="rounded-xl bg-secondary p-3">
              <p className="text-[10px] uppercase text-primary">Custo total</p>
              <p className="mt-1 font-bold text-primary">{money(baseCost)}</p>
            </div>
          </div>
        </Panel>
      </div>
      <div className="space-y-5 xl:sticky xl:top-24 xl:self-start">
        <Panel className="p-5">
          <h2 className="font-heading text-lg font-bold">
            Lucro e taxas da venda
          </h2>
          <div className="mt-4 grid gap-4">
            <NumberField
              label="Margem de lucro desejada (%)"
              value={profit}
              setValue={(v) => {
                setProfit(v);
                setJustSaved(false);
              }}
            />
            <NumberField
              label="Taxa do cartão / gateway (%)"
              value={cardFee}
              setValue={(v) => {
                setCardFee(v);
                setJustSaved(false);
              }}
            />
            <NumberField
              label="Impostos sobre a venda (%)"
              value={tax}
              setValue={(v) => {
                setTax(v);
                setJustSaved(false);
              }}
            />
          </div>
          <p className="mt-4 rounded-xl bg-secondary/60 p-3 text-xs text-secondary-foreground">
            Ordem do cálculo: custo (ingredientes + embalagens + gastos
            invisíveis) → soma o lucro pretendido → só depois soma taxa de
            cartão e impostos, se houver. As taxas nunca reduzem sua margem.
          </p>
        </Panel>
        <Panel className="overflow-hidden">
          <div className="bg-gradient-to-br from-primary to-[#8f4fb8] p-6 text-primary-foreground">
            <p className="text-sm opacity-80">
              {soldByWeight ? 'Preço sugerido por kg' : 'Preço sugerido por unidade'}
            </p>
            <p className="mt-2 font-heading text-4xl font-bold">
              {money(soldByWeight ? pricePerKg : unitPrice)}
            </p>
            <p className="mt-2 text-xs opacity-75">
              {productName} • rendimento de {yieldCount} un. •{' '}
              {product.price
                ? `preço no cardápio: ${money(product.price)}`
                : 'ainda fora do cardápio'}
            </p>
          </div>
          <div className="space-y-4 p-6">
            <CalcLine label="Ingredientes" value={money(ingredientCost)} />
            <CalcLine label="Embalagens" value={money(packagingCost)} />
            <CalcLine
              label={`Gastos invisíveis (${hiddenPercentage}%)`}
              value={money(hiddenTotal)}
            />
            <CalcLine label="Custo total da receita" value={money(baseCost)} />
            <CalcLine
              label="Lucro estimado"
              value={money(profitAmount)}
            />
            <CalcLine
              label="Preço com lucro (antes de taxas)"
              value={money(priceBeforeFees)}
            />
            <CalcLine
              label={`Taxas de cartão / impostos (${(cardFee + tax).toFixed(2)}%)`}
              value={money(feesAmount)}
            />
            <CalcLine label="Venda da receita inteira" value={money(totalPrice)} />
            <Button
              type="button"
              disabled={!enrichedItems.length}
              className="mt-2 w-full rounded-xl"
              onClick={save}
            >
              {justSaved ? <Check /> : null} {justSaved ? 'Ficha salva' : 'Salvar ficha técnica'}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full rounded-xl"
              onClick={() => window.print()}
            >
              <Printer /> Imprimir ficha técnica
            </Button>
            {recipe && (
              <Button
                type="button"
                variant="outline"
                className="w-full rounded-xl"
                onClick={onRemove}
              >
                <Trash2 /> Remover ficha técnica
              </Button>
            )}
          </div>
        </Panel>
      </div>
      <div className="print-ficha">
        <h1>{productName}</h1>
        <p>Rendimento: {yieldCount} un.{soldByWeight ? ' • Vendido por kg' : ''}</p>
        <p>
          Peso da receita: {recipeWeightGrams >= 1000 ? `${(recipeWeightGrams / 1000).toFixed(3)} kg` : `${recipeWeightGrams.toFixed(0)} g`}
          {weightLossPercent > 0 && ` (após perda de ${weightLossPercent}%: ${finalWeightGrams >= 1000 ? `${(finalWeightGrams / 1000).toFixed(3)} kg` : `${finalWeightGrams.toFixed(0)} g`})`}
        </p>
        <h2>Ingredientes</h2>
        <table>
          <thead>
            <tr><th>Item</th><th>Quantidade</th><th>Custo</th></tr>
          </thead>
          <tbody>
            {enrichedItems.map((item) => (
              <tr key={item.id}>
                <td>{item.stockItem?.name}</td>
                <td>{item.quantity} {item.unit}</td>
                <td>{money(lineCost(item.stockItem!, item.quantity, item.unit))}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <h2>Custos</h2>
        <p>Ingredientes: {money(ingredientCost)}</p>
        <p>Custos fixos: {money(fixedCost)}</p>
        <p>Custos variáveis: {money(variableCost)}</p>
        <p>Custo total: {money(baseCost)}</p>
        <p>Margem de lucro: {profit}%</p>
        <h2>{soldByWeight ? `Preço sugerido por kg: ${money(pricePerKg)}` : `Preço sugerido por unidade: ${money(unitPrice)}`}</h2>
      </div>
    </div>
  );
}

function ProfitByProduct({
  menuItems,
  recipes,
  stock,
}: {
  menuItems: MenuItem[];
  recipes: ProductRecipe[];
  stock: StockItem[];
}) {
  const rows = menuItems.map((product) => {
    const recipe = recipes.find(
      (r) => r.productId === product.id && (r.productKind ?? 'menu') === 'menu',
    );
    if (!recipe) return { product, recipe: null as ProductRecipe | null };
    const { baseCost } = computeRecipeCost(recipe, stock);
    const unitCost = baseCost / Math.max(1, recipe.yieldCount);
    // "Prolabore" é o lucro pretendido definido na ficha técnica (aplicado
    // sobre o custo, antes de taxas) dividido pelo rendimento — o que o
    // dono planejou tirar por unidade. O que sobra entre o preço realmente
    // praticado no cardápio e custo + prolabore fica para reinvestir na
    // confeitaria — pode ficar negativo se o produto estiver subprecificado.
    const profitAmount = baseCost * (recipe.profit / 100);
    const prolabore = profitAmount / Math.max(1, recipe.yieldCount);
    const grossProfit = product.price - unitCost;
    const companyShare = grossProfit - prolabore;
    return { product, recipe, unitCost, grossProfit, prolabore, companyShare };
  });

  return (
    <>
      <p className="mb-4 rounded-xl bg-secondary/60 p-3 text-xs text-secondary-foreground">
        Prolabore é a margem definida na ficha técnica de cada produto. O que
        sobra entre o preço do cardápio e (custo + prolabore) fica para a
        empresa reinvestir — se estiver negativo, o produto está vendendo
        abaixo do que a ficha técnica recomenda.
      </p>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {rows.map(({ product, recipe, unitCost, grossProfit, prolabore, companyShare }) => (
          <Panel key={product.id} className="p-5">
            <p className="font-semibold">{product.name}</p>
            <p className="text-xs text-muted-foreground">
              Preço no cardápio: {money(product.price)}
            </p>
            {!recipe ? (
              <p className="mt-4 text-sm text-muted-foreground">
                Sem ficha técnica cadastrada.
              </p>
            ) : (
              <div className="mt-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Custo unitário</span>
                  <strong>{money(unitCost ?? 0)}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Lucro bruto</span>
                  <strong>{money(grossProfit ?? 0)}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    Prolabore (dono)
                  </span>
                  <strong>{money(prolabore ?? 0)}</strong>
                </div>
                <div className="flex justify-between border-t pt-2">
                  <span className="text-muted-foreground">
                    Fica para a empresa
                  </span>
                  <strong
                    className={
                      (companyShare ?? 0) < 0 ? 'text-destructive' : ''
                    }
                  >
                    {money(companyShare ?? 0)}
                  </strong>
                </div>
              </div>
            )}
          </Panel>
        ))}
      </div>
    </>
  );
}
function NumberField({
  label,
  value,
  setValue,
}: {
  label: string;
  value: number;
  setValue: (n: number) => void;
}) {
  return (
    <Field label={label}>
      <input
        value={value}
        onChange={(e) => setValue(Number(e.target.value))}
        type="number"
        step="0.01"
        className={inputClass}
      />
    </Field>
  );
}
function CalcLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b pb-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

const financeChartConfig = {
  entradas: { label: 'Entradas', color: 'var(--chart-4)' },
  saidas: { label: 'Saídas', color: 'var(--destructive)' },
} satisfies ChartConfig;

function Finance({
  items,
  setItems,
}: {
  items: FinanceItem[];
  setItems: (v: FinanceItem[] | ((o: FinanceItem[]) => FinanceItem[])) => void;
}) {
  const [viewDate, setViewDate] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [type, setType] = useState<'Entrada' | 'Saída'>('Entrada');

  const monthItems = useMemo(
    () => items.filter((item) => isSameMonth(item.date, viewDate)),
    [items, viewDate],
  );
  const entries = monthItems
      .filter((x) => x.type === 'Entrada')
      .reduce((s, x) => s + x.value, 0),
    expenses = monthItems
      .filter((x) => x.type === 'Saída')
      .reduce((s, x) => s + x.value, 0);

  const chartData = useMemo(() => {
    const byMonth = new Map<
      string,
      { key: string; date: Date; entradas: number; saidas: number }
    >();
    for (const item of items) {
      const parsed = parseFinanceDate(item.date);
      if (!parsed) continue;
      const key = monthKey(parsed);
      const bucket = byMonth.get(key) ?? {
        key,
        date: new Date(parsed.getFullYear(), parsed.getMonth(), 1),
        entradas: 0,
        saidas: 0,
      };
      if (item.type === 'Entrada') bucket.entradas += item.value;
      else bucket.saidas += item.value;
      byMonth.set(key, bucket);
    }
    return Array.from(byMonth.values())
      .sort((a, b) => a.date.getTime() - b.date.getTime())
      .slice(-6)
      .map((bucket) => ({
        month: bucket.date
          .toLocaleDateString('pt-BR', { month: 'short' })
          .replace('.', ''),
        entradas: bucket.entradas,
        saidas: bucket.saidas,
      }));
  }, [items]);

  const add = (e: FormSubmit) => {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    const date = fieldValue(d, 'date') || new Date().toISOString().slice(0, 10);
    setItems((old) => [
      {
        id: Date.now(),
        description: fieldValue(d, 'description'),
        type: fieldValue(d, 'type') as 'Entrada' | 'Saída',
        category: fieldValue(d, 'category'),
        value: Number(fieldValue(d, 'value')),
        date,
      },
      ...old,
    ]);
    e.currentTarget.reset();
    setType('Entrada');
  };

  const monthLabel = viewDate
    .toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
    .replace(/^\w/, (c) => c.toUpperCase());
  const changeMonth = (delta: number) =>
    setViewDate((old) => new Date(old.getFullYear(), old.getMonth() + delta, 1));

  return (
    <>
      <PageHeading
        title="Financeiro"
        subtitle="Registre entradas e saídas para saber o resultado real da confeitaria."
      />
      <div className="mb-5 flex items-center justify-center gap-3">
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Mês anterior"
          onClick={() => changeMonth(-1)}
        >
          <ChevronLeft />
        </Button>
        <p className="w-44 text-center font-heading font-bold">{monthLabel}</p>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Próximo mês"
          onClick={() => changeMonth(1)}
        >
          <ChevronRight />
        </Button>
      </div>
      <section className="mb-5 grid gap-4 sm:grid-cols-3">
        <MetricCard
          icon={ArrowUpRight}
          label="Entradas"
          value={money(entries)}
          detail="No mês"
          positive
        />
        <MetricCard
          icon={ArrowDownRight}
          label="Saídas"
          value={money(expenses)}
          detail="No mês"
        />
        <MetricCard
          icon={WalletCards}
          label="Saldo"
          value={money(entries - expenses)}
          detail="Resultado do mês"
        />
      </section>
      <Panel className="mb-5 p-5">
        <PanelTitle
          title="Rateio do mês"
          subtitle="Sobre o total de entradas já recebidas neste mês"
        />
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl bg-secondary p-4">
            <p className="text-[10px] font-semibold uppercase text-primary">
              Pró-labore (40%)
            </p>
            <p className="mt-1 text-lg font-bold text-primary">
              {money(entries * 0.4)}
            </p>
          </div>
          <div className="rounded-xl bg-muted/50 p-4">
            <p className="text-[10px] font-semibold uppercase text-muted-foreground">
              Empresa (50%)
            </p>
            <p className="mt-1 text-lg font-bold">{money(entries * 0.5)}</p>
          </div>
          <div className="rounded-xl bg-green-50 p-4">
            <p className="text-[10px] font-semibold uppercase text-green-700">
              Reserva emergencial (10%)
            </p>
            <p className="mt-1 text-lg font-bold text-green-800">
              {money(entries * 0.1)}
            </p>
          </div>
        </div>
      </Panel>
      {chartData.length > 0 && (
        <Panel className="mb-5 p-5">
          <PanelTitle
            title="Entradas x saídas"
            subtitle="Últimos meses com lançamentos"
          />
          <ChartContainer config={financeChartConfig} className="mt-4 h-56 w-full">
            <BarChart data={chartData}>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="month"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    formatter={(value) => money(Number(value))}
                  />
                }
              />
              <Bar dataKey="entradas" fill="var(--color-entradas)" radius={4} />
              <Bar dataKey="saidas" fill="var(--color-saidas)" radius={4} />
            </BarChart>
          </ChartContainer>
        </Panel>
      )}
      <Panel className="mb-5 p-5">
        <form onSubmit={add} className="grid gap-3 md:grid-cols-5">
          <Field label="Descrição">
            <input required name="description" className={inputClass} />
          </Field>
          <Field label="Tipo">
            <select
              name="type"
              value={type}
              onChange={(e) => setType(e.target.value as 'Entrada' | 'Saída')}
              className={inputClass}
            >
              <option>Entrada</option>
              <option>Saída</option>
            </select>
          </Field>
          <Field label="Categoria">
            <select required name="category" className={inputClass}>
              {FINANCE_CATEGORIES[type].map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
          </Field>
          <Field label="Valor">
            <input
              required
              name="value"
              type="number"
              step="0.01"
              className={inputClass}
            />
          </Field>
          <Field label="Data">
            <input
              name="date"
              type="date"
              defaultValue={new Date().toISOString().slice(0, 10)}
              className={inputClass}
            />
          </Field>
          <div className="flex items-end md:col-span-5">
            <Button type="submit" className="h-10 w-full rounded-xl md:w-auto">
              <Plus /> Lançar
            </Button>
          </div>
        </form>
      </Panel>
      <Panel className="overflow-hidden">
        <PanelTitle
          title="Movimentações"
          subtitle={`Lançamentos de ${monthLabel.toLowerCase()}`}
        />
        <div className="divide-y">
          {monthItems.length === 0 && (
            <Empty label="Nenhum lançamento neste mês." />
          )}
          {monthItems.map((item) => (
            <div key={item.id} className="flex items-center gap-4 px-5 py-4">
              <span
                className={`grid size-9 shrink-0 place-items-center rounded-xl ${item.type === 'Entrada' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}
              >
                {item.type === 'Entrada' ? (
                  <ArrowUpRight />
                ) : (
                  <ArrowDownRight />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">
                  {item.description}
                </p>
                <p className="text-xs text-muted-foreground">
                  {item.category || 'Sem categoria'} •{' '}
                  {formatFinanceDate(item.date)}
                </p>
              </div>
              <p
                className={`shrink-0 font-semibold ${item.type === 'Entrada' ? 'text-green-700' : 'text-red-700'}`}
              >
                {item.type === 'Entrada' ? '+' : '−'} {money(item.value)}
              </p>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Excluir ${item.description}`}
                onClick={() =>
                  setItems((old) => old.filter((x) => x.id !== item.id))
                }
              >
                <Trash2 />
              </Button>
            </div>
          ))}
        </div>
      </Panel>
    </>
  );
}

function DigitalMenu({
  items,
  setItems,
  editions,
  setEditions,
  bakeryId,
}: {
  items: MenuItem[];
  setItems: (v: MenuItem[] | ((o: MenuItem[]) => MenuItem[])) => void;
  editions: MenuEdition[];
  setEditions: (v: MenuEdition[] | ((o: MenuEdition[]) => MenuEdition[])) => void;
  bakeryId: string;
}) {
  const [weekTitle, setWeekTitle] = useStoredState('doce-menu-week', '');
  const [weekStart, setWeekStart] = useStoredState('doce-menu-week-start', '');
  const [weekEnd, setWeekEnd] = useStoredState('doce-menu-week-end', '');
  // 0 = a edição ao vivo (doce-menu / doce-menu-week*, o que já existia);
  // 1, 2... = editions[n - 1], uma edição arquivada — as setinhas navegam
  // entre elas, e "reabrir" uma arquivada permite editar os itens dela sem
  // afetar o que está publicado no cardápio público.
  const [editionIndex, setEditionIndex] = useState(0);
  const archivedEdition = editionIndex > 0 ? editions[editionIndex - 1] : undefined;
  const viewedItems = archivedEdition ? archivedEdition.items : items;
  const updateViewedItems = (
    updater: (old: MenuItem[]) => MenuItem[],
  ) => {
    if (!archivedEdition) {
      setItems(updater);
      return;
    }
    setEditions((old) =>
      old.map((edition) =>
        edition.id === archivedEdition.id
          ? { ...edition, items: updater(edition.items) }
          : edition,
      ),
    );
  };
  const archiveCurrentEdition = () => {
    setEditions((old) => [
      {
        id: Date.now().toString(),
        weekTitle,
        weekStart,
        weekEnd,
        items,
        archivedAt: new Date().toISOString(),
      },
      ...old,
    ]);
    setItems([]);
    setWeekTitle('');
    setWeekStart('');
    setWeekEnd('');
    setEditionIndex(0);
  };

  useEffect(() => {
    if (weekStart && weekEnd) setWeekTitle(formatWeekRange(weekStart, weekEnd));
  }, [weekStart, weekEnd, setWeekTitle]);
  const [pendingPhoto, setPendingPhoto] = useState('');
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState('');
  const uploadProductPhoto: NonNullable<
    ComponentProps<'input'>['onChange']
  > = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) {
      setPhotoError('Escolha uma imagem de até 4 MB.');
      return;
    }
    setPhotoError('');
    setUploadingPhoto(true);
    const body = new FormData();
    body.append('file', file);
    fetch('/api/upload', { method: 'POST', body })
      .then((response) => {
        if (!response.ok) throw new Error('upload_failed');
        return response.json() as Promise<{ url: string }>;
      })
      .then(({ url }) => setPendingPhoto(url))
      .catch(() =>
        setPhotoError('Não foi possível enviar a foto. Tente novamente.'),
      )
      .finally(() => setUploadingPhoto(false));
  };
  const addProduct = (e: FormSubmit) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const weightValue = Number(fieldValue(data, 'weightValue'));
    updateViewedItems((old) => [
      ...old,
      {
        id: Date.now(),
        name: fieldValue(data, 'name'),
        category: fieldValue(data, 'category'),
        price: Number(fieldValue(data, 'price')),
        emoji: '🧁',
        photoUrl: pendingPhoto || undefined,
        available: true,
        ...(weightValue > 0
          ? {
              weight: {
                value: weightValue,
                unit: fieldValue(data, 'weightUnit') as 'kg' | 'g' | 'l',
              },
            }
          : {}),
      },
    ]);
    e.currentTarget.reset();
    setPendingPhoto('');
  };
  return (
    <>
      <PageHeading
        title="Cardápio digital"
        subtitle="Crie manualmente cada edição semanal, escolha os produtos e compartilhe com clientes."
        action={
          <Link
            href={`/${bakeryId}/cardapio`}
            target="_blank"
            className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border bg-background px-2.5 text-sm font-medium transition hover:bg-muted"
          >
            <Eye className="size-4" /> Abrir cardápio do cliente
          </Link>
        }
      />
      <div className="mb-5 grid gap-5">
        <Panel className="p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-heading text-lg font-bold">
                {archivedEdition ? 'Edição arquivada' : 'Edição da semana'}
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {archivedEdition
                  ? 'Reabra e edite os produtos desta semana passada — não afeta o cardápio publicado.'
                  : 'O título aparece imediatamente no cardápio enviado aos clientes.'}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                aria-label="Semana anterior"
                onClick={() =>
                  setEditionIndex((i) => Math.min(editions.length, i + 1))
                }
                disabled={editionIndex >= editions.length}
              >
                <ChevronLeft />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                aria-label="Próxima semana"
                onClick={() => setEditionIndex((i) => Math.max(0, i - 1))}
                disabled={editionIndex === 0}
              >
                <ChevronRight />
              </Button>
            </div>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Field label="Início da edição">
              <input
                type="date"
                value={archivedEdition ? archivedEdition.weekStart : weekStart}
                onChange={(e) => setWeekStart(e.target.value)}
                disabled={Boolean(archivedEdition)}
                className={inputClass}
              />
            </Field>
            <Field label="Fim da edição">
              <input
                type="date"
                value={archivedEdition ? archivedEdition.weekEnd : weekEnd}
                min={weekStart || undefined}
                onChange={(e) => setWeekEnd(e.target.value)}
                disabled={Boolean(archivedEdition)}
                className={inputClass}
              />
            </Field>
          </div>
          {(archivedEdition ? archivedEdition.weekTitle : weekTitle) && (
            <p className="mt-3 text-xs font-semibold text-primary">
              {archivedEdition ? archivedEdition.weekTitle : weekTitle}
            </p>
          )}
          {!archivedEdition && (
            <Button
              type="button"
              variant="outline"
              className="mt-4"
              onClick={archiveCurrentEdition}
            >
              Nova edição
            </Button>
          )}
        </Panel>
      </div>
      <Panel className="mb-5 p-5">
        <form
          onSubmit={addProduct}
          className="grid gap-3 md:grid-cols-[1.4fr_.8fr_.7fr_.5fr_.4fr_auto]"
        >
          <Field label="Produto">
            <input
              required
              name="name"
              className={inputClass}
              placeholder="Ex.: Brownie de pistache"
            />
          </Field>
          <Field label="Categoria">
            <input
              required
              name="category"
              className={inputClass}
              placeholder="Docinhos"
            />
          </Field>
          <Field label="Preço">
            <input
              required
              name="price"
              type="number"
              step="0.01"
              className={inputClass}
            />
          </Field>
          <Field label="Peso aproximado">
            <input
              name="weightValue"
              type="number"
              step="0.01"
              min="0"
              className={inputClass}
              placeholder="0"
            />
          </Field>
          <Field label="Unidade">
            <select name="weightUnit" className={inputClass} defaultValue="g">
              <option value="kg">kg</option>
              <option value="g">g</option>
              <option value="l">l</option>
            </select>
          </Field>
          <div className="flex items-end">
            <Button type="submit" className="h-10" disabled={uploadingPhoto}>
              <Plus /> Adicionar produto
            </Button>
          </div>
          <div className="md:col-span-6">
            <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed p-4 text-center transition hover:border-primary/50">
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={uploadProductPhoto}
                disabled={uploadingPhoto}
                className="hidden"
              />
              {uploadingPhoto ? (
                <LoaderCircle className="size-6 animate-spin text-muted-foreground" />
              ) : pendingPhoto ? (
                <Image
                  src={pendingPhoto}
                  alt="Pré-visualização"
                  width={48}
                  height={48}
                  unoptimized
                  className="size-12 rounded-lg object-cover"
                />
              ) : (
                <Upload className="size-6 text-muted-foreground" />
              )}
              <span className="text-xs text-muted-foreground">
                Imagem do produto
              </span>
            </label>
            {photoError && (
              <p className="mt-1 text-xs text-destructive">{photoError}</p>
            )}
          </div>
        </form>
      </Panel>
      <Panel className="overflow-hidden">
        <PanelTitle
          title="Produtos da edição"
          subtitle="Publique, oculte ou remova manualmente os itens desta semana"
        />
        <div className="divide-y">
          {viewedItems.length === 0 && (
            <Empty label="Nenhum produto cadastrado nesta edição ainda." />
          )}
          {viewedItems.map((item) => (
            <div key={item.id} className="flex items-center gap-4 px-5 py-4">
              {item.photoUrl ? (
                <Image
                  src={item.photoUrl}
                  alt={item.name}
                  width={44}
                  height={44}
                  unoptimized
                  className="size-11 shrink-0 rounded-xl object-cover"
                />
              ) : (
                <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-secondary text-2xl">
                  {item.emoji}
                </span>
              )}
              <div className="flex-1">
                <p className="font-semibold">{item.name}</p>
                <p className="text-xs text-muted-foreground">
                  {item.category} • {money(item.price)}
                  {item.weight ? ` • ${item.weight.value}${item.weight.unit}` : ''}
                </p>
              </div>
              <Badge variant={item.available ? 'secondary' : 'outline'}>
                {item.available ? 'Publicado' : 'Oculto'}
              </Badge>
              <Button
                variant={item.available ? 'outline' : 'default'}
                onClick={() =>
                  updateViewedItems((old) =>
                    old.map((x) =>
                      x.id === item.id ? { ...x, available: !x.available } : x,
                    ),
                  )
                }
              >
                {item.available ? 'Ocultar' : 'Publicar'}
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Excluir ${item.name}`}
                onClick={() =>
                  updateViewedItems((old) => old.filter((x) => x.id !== item.id))
                }
              >
                <Trash2 />
              </Button>
            </div>
          ))}
        </div>
      </Panel>
    </>
  );
}

function ProductsCatalog({
  items,
  setItems,
}: {
  items: Product[];
  setItems: (v: Product[] | ((o: Product[]) => Product[])) => void;
}) {
  const [weightUnit, setWeightUnit] = useState<
    'g' | 'kg' | 'ml' | 'l' | 'unidade'
  >('g');
  const add = (e: FormSubmit) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const name = fieldValue(data, 'name').trim();
    const flavor = fieldValue(data, 'flavor').trim();
    if (!name || !flavor) return;
    const price = Number(fieldValue(data, 'price'));
    const weightValue = Number(fieldValue(data, 'weightValue'));
    setItems((old) => [
      ...old,
      {
        id: Date.now(),
        name,
        flavor,
        ...(price > 0 ? { price } : {}),
        ...(weightValue > 0
          ? { weight: { value: weightValue, unit: weightUnit } }
          : {}),
      },
    ]);
    e.currentTarget.reset();
    setWeightUnit('g');
  };
  return (
    <>
      <PageHeading
        title="Produtos"
        subtitle="Cadastre produtos com sabor para usar rapidamente na hora de montar um pedido."
      />
      <Panel className="mb-5 p-5">
        <form onSubmit={add} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto_auto_auto]">
          <Field label="Nome do produto">
            <input
              required
              name="name"
              className={inputClass}
              placeholder="Ex.: Bolo de aniversário"
            />
          </Field>
          <Field label="Sabor">
            <input
              required
              name="flavor"
              className={inputClass}
              placeholder="Ex.: Ninho com Nutella"
            />
          </Field>
          <Field label="Valor (opcional)">
            <input
              name="price"
              type="number"
              step="0.01"
              min="0"
              className={`${inputClass} w-28`}
              placeholder="0,00"
            />
          </Field>
          <Field label="Peso/volume (opcional)">
            <div className="flex gap-1">
              <input
                name="weightValue"
                type="number"
                step="0.01"
                min="0"
                className={`${inputClass} w-20`}
                placeholder="0"
              />
              <select
                value={weightUnit}
                onChange={(e) =>
                  setWeightUnit(e.target.value as typeof weightUnit)
                }
                className={inputClass}
              >
                <option value="g">g</option>
                <option value="kg">kg</option>
                <option value="ml">ml</option>
                <option value="l">l</option>
                <option value="unidade">unidade</option>
              </select>
            </div>
          </Field>
          <div className="flex items-end">
            <Button type="submit" className="h-10 w-full sm:w-auto">
              <Plus /> Cadastrar
            </Button>
          </div>
        </form>
      </Panel>
      <Panel className="overflow-hidden">
        <PanelTitle
          title={`${items.length} produtos`}
          subtitle="Aparecem em Pedidos, na seção Produtos cadastrados"
        />
        <div className="divide-y">
          {items.length === 0 && (
            <Empty label="Nenhum produto cadastrado ainda." />
          )}
          {items.map((product) => (
            <div key={product.id} className="flex items-center gap-4 px-5 py-4">
              <div className="flex-1">
                <p className="font-semibold">{product.name}</p>
                <p className="text-xs text-muted-foreground">
                  {product.flavor}
                  {product.price ? ` • ${money(product.price)}` : ''}
                  {product.weight
                    ? ` • ${product.weight.value}${product.weight.unit === 'unidade' ? ' un' : product.weight.unit}`
                    : ''}
                  {pricePerBaseUnit(product) ? ` • ${pricePerBaseUnit(product)}` : ''}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Excluir ${product.name}`}
                onClick={() =>
                  setItems((old) => old.filter((x) => x.id !== product.id))
                }
              >
                <Trash2 />
              </Button>
            </div>
          ))}
        </div>
      </Panel>
    </>
  );
}

function favoriteProductOf(orders: Order[], customerName: string): string {
  const counts = new Map<string, number>();
  for (const order of orders) {
    if (order.customer !== customerName) continue;
    for (const item of order.items ?? []) {
      counts.set(item.name, (counts.get(item.name) ?? 0) + item.quantity);
    }
  }
  let best = '';
  let bestCount = 0;
  for (const [name, count] of counts) {
    if (count > bestCount) {
      best = name;
      bestCount = count;
    }
  }
  return best;
}

function formatIsoDate(date?: string, fallback = 'Sem data cadastrada'): string {
  if (!date) return fallback;
  const [year, month, day] = date.split('-');
  return `${day}/${month}/${year}`;
}

function Customers({
  loyalty,
  orders,
  setLoyalty,
}: {
  loyalty: LoyaltyItem[];
  orders: Order[];
  setLoyalty: (v: LoyaltyItem[] | ((o: LoyaltyItem[]) => LoyaltyItem[])) => void;
}) {
  const [editingId, setEditingId] = useState<number | null>(null);

  const addClient = (e: FormSubmit) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const name = fieldValue(data, 'name').trim();
    const birthday = fieldValue(data, 'birthday').trim();
    if (!name || !birthday) return;
    setLoyalty((old) => [
      ...old,
      {
        id: Date.now(),
        name,
        phone: fieldValue(data, 'phone'),
        birthday,
        stamps: 0,
      },
    ]);
    e.currentTarget.reset();
  };

  const saveEdit = async (e: FormSubmit, client: LoyaltyItem) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const name = fieldValue(data, 'name').trim();
    const birthday = fieldValue(data, 'birthday').trim();
    if (!name || !birthday) return;
    const phone = fieldValue(data, 'phone').trim();
    const response = await fetch(
      `/api/customers/${encodeURIComponent(client.id)}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, phone, birthday }),
      },
    );
    if (!response.ok) return;
    setLoyalty((old) =>
      old.map((c) =>
        c.id === client.id ? { ...c, name, phone, birthday } : c,
      ),
    );
    setEditingId(null);
  };

  const removeClient = async (id: number) => {
    const response = await fetch(`/api/customers/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    if (!response.ok) return;
    setLoyalty((old) => old.filter((c) => c.id !== id));
  };

  return (
    <>
      <PageHeading
        title="Clientes"
        subtitle="Visão rápida do relacionamento e histórico de compras."
      />
      <Panel className="mb-5 p-5">
        <form
          onSubmit={addClient}
          className="grid gap-3 md:grid-cols-[1.2fr_1fr_1fr_auto]"
        >
          <Field label="Nome ou apelido">
            <input
              required
              name="name"
              className={inputClass}
              placeholder="Ex.: Mariana Alves"
            />
          </Field>
          <Field label="WhatsApp (opcional)">
            <input name="phone" className={inputClass} placeholder="(11) 90000-0000" />
          </Field>
          <Field label="Aniversário">
            <input
              required
              type="date"
              name="birthday"
              className={inputClass}
            />
          </Field>
          <div className="flex items-end">
            <Button type="submit" className="h-10 w-full">
              <Plus /> Cadastrar cliente
            </Button>
          </div>
        </form>
      </Panel>
      {loyalty.length === 0 && (
        <Panel className="p-10 text-center text-sm text-muted-foreground">
          Nenhum cliente cadastrado ainda.
        </Panel>
      )}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {loyalty.map((client) => {
          const clientOrders = orders.filter((o) => o.customer === client.name);
          const totalPurchased = clientOrders.reduce(
            (sum, o) => sum + o.value,
            0,
          );
          const favorite = favoriteProductOf(orders, client.name);
          if (editingId === client.id) {
            return (
              <Panel key={client.id} className="p-5">
                <form
                  onSubmit={(e) => void saveEdit(e, client)}
                  className="space-y-3"
                >
                  <Field label="Nome ou apelido">
                    <input
                      required
                      name="name"
                      defaultValue={client.name}
                      className={inputClass}
                    />
                  </Field>
                  <Field label="WhatsApp">
                    <input
                      name="phone"
                      defaultValue={client.phone}
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Aniversário">
                    <input
                      required
                      type="date"
                      name="birthday"
                      defaultValue={client.birthday}
                      className={inputClass}
                    />
                  </Field>
                  <div className="flex gap-2">
                    <Button type="submit" className="flex-1">
                      Salvar
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="flex-1"
                      onClick={() => setEditingId(null)}
                    >
                      Cancelar
                    </Button>
                  </div>
                </form>
              </Panel>
            );
          }
          return (
            <Panel key={client.id} className="p-5">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3">
                  <span className="grid size-11 shrink-0 place-items-center rounded-full bg-secondary font-bold text-primary">
                    {client.name
                      .split(' ')
                      .map((x) => x[0])
                      .slice(0, 2)
                      .join('')}
                  </span>
                  <div>
                    <p className="font-semibold">{client.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {client.phone || 'Sem WhatsApp'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      🎂 {formatIsoDate(client.birthday)}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Editar ${client.name}`}
                    onClick={() => setEditingId(client.id)}
                  >
                    <Pencil />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Excluir ${client.name}`}
                    onClick={() => void removeClient(client.id)}
                  >
                    <Trash2 />
                  </Button>
                </div>
              </div>
              <div className="mt-5 grid grid-cols-3 gap-3">
                <div className="rounded-xl bg-muted p-3">
                  <p className="text-xs text-muted-foreground">Pedidos</p>
                  <p className="text-xl font-bold">{clientOrders.length}</p>
                </div>
                <div className="rounded-xl bg-muted p-3">
                  <p className="text-xs text-muted-foreground">Selos</p>
                  <p className="text-xl font-bold">{client.stamps}/10</p>
                </div>
                <div className="rounded-xl bg-secondary p-3">
                  <p className="text-xs text-primary">Total comprado</p>
                  <p className="text-lg font-bold text-primary">
                    {money(totalPurchased)}
                  </p>
                </div>
              </div>
              <div className="mt-3 rounded-xl bg-muted p-3">
                <p className="text-xs text-muted-foreground">Produto favorito</p>
                <p className="text-sm font-semibold">
                  {favorite || 'Ainda sem pedidos estruturados'}
                </p>
              </div>
            </Panel>
          );
        })}
      </div>
    </>
  );
}

// Desenhado direto num <canvas> (sem lib nenhuma) e baixado como PNG — dá
// pra mandar no WhatsApp do cliente como se fosse uma foto do cartão.
function downloadLoyaltyCard(client: LoyaltyItem) {
  const canvas = document.createElement('canvas');
  canvas.width = 720;
  canvas.height = 440;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  gradient.addColorStop(0, '#4f1f6e');
  gradient.addColorStop(1, '#a374c9');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.font = '20px sans-serif';
  ctx.fillText('Cartão fidelidade', 40, 60);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 34px sans-serif';
  ctx.fillText(client.name, 40, 105);

  const cols = 5;
  const cellSize = 88;
  const gap = 16;
  const startX = 40;
  const startY = 150;
  for (let i = 0; i < 10; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = startX + col * (cellSize + gap);
    const y = startY + row * (cellSize + gap);
    const filled = i < client.stamps;
    ctx.beginPath();
    ctx.arc(x + cellSize / 2, y + cellSize / 2, cellSize / 2, 0, Math.PI * 2);
    ctx.fillStyle = filled ? '#ffffff' : 'rgba(255,255,255,0.15)';
    ctx.fill();
    ctx.strokeStyle = filled ? '#ffffff' : 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = filled ? '#4f1f6e' : 'rgba(255,255,255,0.6)';
    ctx.font = 'bold 28px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(filled ? '✓' : String(i + 1), x + cellSize / 2, y + cellSize / 2 + 2);
  }
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.font = '18px sans-serif';
  const status =
    client.stamps >= 10
      ? 'Desconto liberado: 10%'
      : `Faltam ${10 - client.stamps} selos para o prêmio`;
  ctx.fillText(status, 40, startY + 2 * (cellSize + gap) + 20);

  const link = document.createElement('a');
  link.download = `cartao-fidelidade-${client.name.replace(/\s+/g, '-').toLowerCase()}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
}

function Loyalty({
  items,
  setItems,
}: {
  items: LoyaltyItem[];
  setItems: (v: LoyaltyItem[] | ((o: LoyaltyItem[]) => LoyaltyItem[])) => void;
}) {
  return (
    <>
      <PageHeading
        title="Fidelidade e descontos"
        subtitle="A cada compra, um selo. Com 10 selos, o cliente ganha 10% de desconto."
      />
      {items.length === 0 && (
        <Panel className="p-10 text-center text-sm text-muted-foreground">
          Nenhum cliente cadastrado ainda.
        </Panel>
      )}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {items.map((client) => (
          <Panel key={client.id} className="overflow-hidden">
            <div className="bg-gradient-to-br from-[#4f1f6e] to-[#a374c9] p-5 text-white">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-white/70">Cartão fidelidade</p>
                  <p className="font-heading text-xl font-bold">
                    {client.name}
                  </p>
                </div>
                <Gift />
              </div>
              <div className="mt-5 grid grid-cols-5 gap-2">
                {Array.from({ length: 10 }, (_, i) => (
                  <span
                    key={i}
                    className={`grid aspect-square place-items-center rounded-full border text-xs ${i < client.stamps ? 'border-white bg-white text-primary' : 'border-white/40 text-white/50'}`}
                  >
                    {i < client.stamps ? <Check className="size-3" /> : i + 1}
                  </span>
                ))}
              </div>
              <p className="mt-4 text-xs text-white/75">
                {client.stamps >= 10
                  ? 'Desconto liberado: 10%'
                  : `Faltam ${10 - client.stamps} selos para o prêmio`}
              </p>
            </div>
            <div className="flex gap-2 p-4">
              <Button
                variant="outline"
                size="icon"
                aria-label={`Remover selo de ${client.name}`}
                title="Remover selo"
                disabled={client.stamps <= 0}
                onClick={() =>
                  setItems((old) =>
                    old.map((x) =>
                      x.id === client.id
                        ? { ...x, stamps: Math.max(0, x.stamps - 1) }
                        : x,
                    ),
                  )
                }
              >
                <Minus />
              </Button>
              <Button
                className="flex-1"
                disabled={client.stamps >= 10}
                onClick={() =>
                  setItems((old) =>
                    old.map((x) =>
                      x.id === client.id
                        ? { ...x, stamps: Math.min(10, x.stamps + 1) }
                        : x,
                    ),
                  )
                }
              >
                <Plus /> Adicionar selo
              </Button>
              <Button
                variant="outline"
                size="icon"
                aria-label={`Baixar cartão de ${client.name}`}
                title="Baixar cartão"
                onClick={() => downloadLoyaltyCard(client)}
              >
                <Download />
              </Button>
              {client.stamps >= 10 && (
                <Button
                  variant="outline"
                  onClick={() =>
                    setItems((old) =>
                      old.map((x) =>
                        x.id === client.id ? { ...x, stamps: 0 } : x,
                      ),
                    )
                  }
                >
                  Usar desconto
                </Button>
              )}
            </div>
          </Panel>
        ))}
      </div>
    </>
  );
}

function Team({ isAdmin }: { isAdmin: boolean }) {
  const [invites, setInvites] = useState<Invite[]>([]);
  const [role, setRole] = useState<'admin' | 'production'>('production');
  const [generating, setGenerating] = useState(false);
  const [copiedCode, setCopiedCode] = useState('');

  const loadInvites = () => {
    void fetch('/api/invites')
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { invites: Invite[] } | null) => {
        if (data?.invites) setInvites(data.invites);
      });
  };

  useEffect(() => {
    if (isAdmin) loadInvites();
  }, [isAdmin]);

  const generate = async () => {
    setGenerating(true);
    const response = await fetch('/api/invites', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role }),
    });
    setGenerating(false);
    if (!response.ok) return;
    loadInvites();
  };

  const copyLink = (code: string) => {
    const link = `${window.location.origin}/cadastro?convite=${code}`;
    void navigator.clipboard.writeText(link).then(() => {
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(''), 2000);
    });
  };

  if (!isAdmin) {
    return (
      <>
        <PageHeading
          title="Equipe"
          subtitle="Convide outras pessoas para a sua confeitaria."
        />
        <Panel className="p-10 text-center text-sm text-muted-foreground">
          Só uma Administradora ou Administrador pode gerar convites.
        </Panel>
      </>
    );
  }

  return (
    <>
      <PageHeading
        title="Equipe"
        subtitle="Gere um link de convite para alguém entrar na sua confeitaria com o papel certo — sem criar uma confeitaria nova sem querer."
      />
      <Panel className="mb-5 p-5">
        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <Field label="Papel de quem for convidada(o)">
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as 'admin' | 'production')}
              className={inputClass}
            >
              <option value="production">Produção</option>
              <option value="admin">Administrador(a)</option>
            </select>
          </Field>
          <div className="flex items-end">
            <Button
              type="button"
              disabled={generating}
              onClick={() => void generate()}
              className="h-10 w-full sm:w-auto"
            >
              <UserPlus /> Gerar convite
            </Button>
          </div>
        </div>
      </Panel>
      <Panel className="overflow-hidden">
        <PanelTitle title="Convites" subtitle="Cada código só funciona uma vez" />
        <div className="divide-y">
          {invites.length === 0 && (
            <Empty label="Nenhum convite gerado ainda." />
          )}
          {invites.map((invite) => (
            <div
              key={invite.code}
              className="flex flex-wrap items-center gap-3 px-5 py-4"
            >
              <div className="flex-1">
                <p className="font-mono text-sm font-bold tracking-wide">
                  {invite.code}
                </p>
                <p className="text-xs text-muted-foreground">
                  {invite.role === 'admin' ? 'Administrador(a)' : 'Produção'} •{' '}
                  {invite.usedBy
                    ? `Usado por ${invite.usedBy} em ${new Date(invite.usedAt!).toLocaleDateString('pt-BR')}`
                    : `Gerado em ${new Date(invite.createdAt).toLocaleDateString('pt-BR')}`}
                </p>
              </div>
              <Badge variant={invite.usedBy ? 'outline' : 'secondary'}>
                {invite.usedBy ? 'Usado' : 'Pendente'}
              </Badge>
              {!invite.usedBy && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => copyLink(invite.code)}
                >
                  {copiedCode === invite.code ? <Check /> : <Copy />}
                  {copiedCode === invite.code ? 'Copiado' : 'Copiar link'}
                </Button>
              )}
            </div>
          ))}
        </div>
      </Panel>
    </>
  );
}

function Empty({ label }: { label: string }) {
  return (
    <div className="p-10 text-center text-sm text-muted-foreground">
      {label}
    </div>
  );
}
