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
  CakeSlice,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Eye,
  Gift,
  LayoutDashboard,
  LoaderCircle,
  LogOut,
  Minus,
  Menu,
  MessageCircleMore,
  PackageOpen,
  Pencil,
  Plus,
  Search,
  Settings2,
  ShoppingBag,
  Sparkles,
  Trash2,
  Users,
  WalletCards,
  X,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { BAKERY_KEY, type BakeryProfile } from '@/lib/bakery';
import { useUserSession, signOut, type UserSession } from '@/lib/auth';

type View =
  | 'dashboard'
  | 'orders'
  | 'stock'
  | 'pricing'
  | 'finance'
  | 'menu'
  | 'customers'
  | 'loyalty'
  | 'whatsapp';
type OrderItem = { name: string; quantity: number; unitPrice: number };
type Order = {
  id: string;
  customer: string;
  phone?: string;
  items?: OrderItem[];
  item: string;
  deliveryDate?: string;
  deliveryTime?: string;
  date: string;
  value: number;
  status: string;
};
const ORDER_STATUSES = ['Novo', 'Produção', 'Pronto', 'Entrega', 'Concluído'];
type StockItem = {
  id: number;
  name: string;
  qty: number;
  unit: string;
  min: number;
  cost: number;
  category?: 'Ingrediente' | 'Embalagem';
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
type MenuItem = {
  id: number;
  name: string;
  category: string;
  price: number;
  available: boolean;
  emoji: string;
  photoUrl?: string;
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
    { label: 'Clientes', icon: Users, view: 'customers' },
    { label: 'Fidelidade', icon: Gift, view: 'loyalty' },
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
  const [loyalty, setLoyalty] = useStoredState('doce-loyalty', initialLoyalty);
  const [bakery, setBakery] = useState<BakeryProfile | null>(null);
  const { session, isLoading: sessionLoading } = useUserSession();
  const isBrowserReady = !sessionLoading;

  useEffect(() => {
    if (!session) return;
    void fetch(`/api/data/${BAKERY_KEY}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { value: BakeryProfile } | null) => {
        if (data?.value) setBakery(data.value);
      });
  }, [session]);

  useEffect(() => {
    if (isBrowserReady && !session) window.location.replace('/login');
  }, [isBrowserReady, session]);

  const todaySales = orders.reduce((sum, order) => sum + order.value, 0);
  const profit = todaySales * 0.364;
  const lowStock = stock.filter((item) => item.qty < item.min);
  const visibleNavItems =
    session?.role === 'production'
      ? navItems.filter((item) =>
          ['dashboard', 'orders', 'stock', 'menu'].includes(item.view),
        )
      : navItems;
  const pageTitle =
    navItems.find((item) => item.view === view)?.label ?? 'WhatsApp';

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
    session,
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
            <div className="relative hidden max-w-md flex-1 sm:block">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                aria-label="Buscar no sistema"
                placeholder="Buscar pedido, produto ou cliente..."
                className="h-10 w-full rounded-xl border bg-muted/45 pl-10 pr-4 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
              />
            </div>
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
                lowStock={lowStock}
                finance={finance}
                todaySales={todaySales}
                profit={profit}
                setView={setView}
                firstName={session.name.trim().split(/\s+/)[0] || 'por aí'}
              />
            )}
            {view === 'orders' && (
              <Orders
                orders={orders}
                setOrders={setOrders}
                menuItems={menuItems}
                customers={loyalty}
              />
            )}
            {view === 'stock' && <Stock stock={stock} setStock={setStock} />}
            {view === 'pricing' && <Pricing stock={stock} />}
            {view === 'finance' && (
              <Finance items={finance} setItems={setFinance} />
            )}
            {view === 'menu' && (
              <DigitalMenu items={menuItems} setItems={setMenuItems} />
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
            {view === 'whatsapp' && <WhatsApp />}
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
    void fetch(`/api/data/${key}`)
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
  session,
  onNavigate,
}: {
  bakery: BakeryProfile | null;
  visibleNavItems: { label: string; icon: typeof LayoutDashboard; view: View }[];
  view: View;
  orders: Order[];
  session: UserSession;
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
      {session.role === 'admin' && (
        <button
          onClick={() => onNavigate('whatsapp')}
          className={`mt-auto rounded-2xl border p-4 text-left transition ${view === 'whatsapp' ? 'border-primary bg-primary/10' : 'border-[#ddc9ea] bg-[#f7f2fa] hover:border-primary/40'}`}
        >
          <div className="mb-3 grid size-9 place-items-center rounded-xl bg-[#ecdcf4] text-[#642e8a]">
            <MessageCircleMore className="size-5" />
          </div>
          <p className="text-sm font-semibold text-[#362040]">
            WhatsApp conectado
          </p>
          <p className="mt-1 text-xs leading-relaxed text-[#6f5a80]">
            Veja o fluxo planejado do bot de pedidos.
          </p>
          <span className="mt-3 flex items-center gap-1 text-xs font-bold text-[#6e3599]">
            Ver automações <ChevronRight className="size-3" />
          </span>
        </button>
      )}
    </>
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
          Doce Gestão
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
  lowStock,
  finance,
  todaySales,
  profit,
  setView,
  firstName,
}: {
  orders: Order[];
  lowStock: StockItem[];
  finance: FinanceItem[];
  todaySales: number;
  profit: number;
  setView: (v: View) => void;
  firstName: string;
}) {
  const entries = finance
    .filter((item) => item.type === 'Entrada')
    .reduce((sum, item) => sum + item.value, 0);
  const expenses = finance
    .filter((item) => item.type === 'Saída')
    .reduce((sum, item) => sum + item.value, 0);
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';
  return (
    <div className="space-y-7">
      <PageHeading
        title={`${greeting}, ${firstName}!`}
        subtitle={`Sua confeitaria está com ${orders.length} pedidos ativos hoje.`}
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
          detail="Atualizado pelos pedidos"
          positive
        />
        <MetricCard
          icon={ShoppingBag}
          label="Pedidos ativos"
          value={String(orders.length)}
          detail="Acompanhe por status"
        />
        <MetricCard
          icon={Sparkles}
          label="Lucro estimado"
          value={money(profit)}
          detail="Margem projetada de 36,4%"
        />
        <MetricCard
          icon={PackageOpen}
          label="Estoque baixo"
          value={String(lowStock.length)}
          detail="Itens abaixo do mínimo"
        />
      </section>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,.75fr)]">
        <Panel className="overflow-hidden">
          <PanelTitle
            title="Pedidos recentes"
            subtitle="Produção e entrega em um só lugar"
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
          <OrderTable orders={orders.slice(0, 5)} compact />
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
}: {
  orders: Order[];
  compact?: boolean;
  onStatus?: (id: string, status: string) => void;
  onDelete?: (id: string) => void;
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
            <th className="px-3 py-3">Status</th>
            {!compact && <th className="px-3 py-3">Ações</th>}
          </tr>
        </thead>
        <tbody className="divide-y">
          {orders.map((order) => (
            <tr key={order.id} className="hover:bg-muted/30">
              <td className="px-5 py-3.5 font-semibold">{order.id}</td>
              <td className="px-3 py-3.5">
                <p className="font-medium">{order.customer}</p>
                <p className="text-xs text-muted-foreground">{order.item}</p>
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

const NEW_CUSTOMER = '__new__';

function Orders({
  orders,
  setOrders,
  menuItems,
  customers,
}: {
  orders: Order[];
  setOrders: (v: Order[] | ((o: Order[]) => Order[])) => void;
  menuItems: MenuItem[];
  customers: LoyaltyItem[];
}) {
  const [customerChoice, setCustomerChoice] = useState('');
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newBirthday, setNewBirthday] = useState('');
  const [deliveryDate, setDeliveryDate] = useState('');
  const [deliveryTime, setDeliveryTime] = useState('');
  const [quantities, setQuantities] = useState<Record<number, number>>({});
  const [submitting, setSubmitting] = useState(false);

  const available = menuItems.filter((item) => item.available);
  const cartItems = available
    .filter((item) => quantities[item.id] > 0)
    .map((item) => ({ ...item, quantity: quantities[item.id] }));
  const total = cartItems.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0,
  );
  const customerName =
    customerChoice === NEW_CUSTOMER
      ? newName.trim()
      : customerChoice;
  const canSubmit =
    Boolean(customerName) &&
    (customerChoice !== NEW_CUSTOMER || Boolean(newBirthday)) &&
    Boolean(deliveryDate) &&
    Boolean(deliveryTime) &&
    cartItems.length > 0;

  const changeQuantity = (id: number, delta: number) =>
    setQuantities((old) => ({
      ...old,
      [id]: Math.max(0, (old[id] ?? 0) + delta),
    }));

  const add = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    const description = cartItems
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
        items: cartItems.map((item) => ({
          name: item.name,
          quantity: item.quantity,
          unitPrice: item.price,
        })),
        item: description,
        deliveryDate,
        deliveryTime,
        date: formattedDate,
        value: total,
        status: 'Novo',
      }),
    });
    setSubmitting(false);
    if (!response.ok) return;
    const { order } = (await response.json()) as { order: Order };
    setOrders((old) => [order, ...old]);
    setCustomerChoice('');
    setNewName('');
    setNewPhone('');
    setNewBirthday('');
    setDeliveryDate('');
    setDeliveryTime('');
    setQuantities({});
  };
  const changeStatus = async (id: string, status: string) => {
    const response = await fetch(`/api/orders/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    if (!response.ok) return;
    setOrders((old) => old.map((o) => (o.id === id ? { ...o, status } : o)));
  };
  return (
    <>
      <PageHeading
        title="Pedidos"
        subtitle="Lance, acompanhe, altere o status ou exclua encomendas."
      />
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
          </div>
          <div>
            <p className="mb-2 text-xs font-semibold text-muted-foreground">
              Produtos da semana
            </p>
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
      <Panel className="overflow-hidden">
        <PanelTitle
          title={`${orders.length} pedidos`}
          subtitle="Escolha o status na lista de cada pedido"
        />
        <OrderTable
          orders={orders}
          onStatus={changeStatus}
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

  // Cadastrar um nome que já existe (na mesma categoria) é reposição: soma
  // na quantidade do item existente em vez de criar uma linha duplicada —
  // mesmo "match por nome" usado para clientes em /api/orders.
  const add = (e: FormSubmit) => {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    const name = fieldValue(d, 'name').trim();
    const qty = Number(fieldValue(d, 'qty'));
    if (!name || !Number.isFinite(qty)) return;
    setStock((old) => {
      const match = old.find(
        (x) =>
          (x.category ?? 'Ingrediente') === category &&
          x.name.trim().toLowerCase() === name.toLowerCase(),
      );
      if (match) {
        return old.map((x) =>
          x.id === match.id ? { ...x, qty: +(x.qty + qty).toFixed(2) } : x,
        );
      }
      return [
        ...old,
        {
          id: Date.now(),
          name,
          category,
          qty,
          unit: fieldValue(d, 'unit'),
          min: Number(fieldValue(d, 'min')),
          cost: Number(fieldValue(d, 'cost')),
        },
      ];
    });
    e.currentTarget.reset();
  };

  return (
    <>
      <PageHeading title={title} subtitle={subtitle} />
      <Panel className="mb-5 p-5">
        <form onSubmit={add} className="grid gap-3 md:grid-cols-6">
          <Field label="Item">
            <input
              required
              name="name"
              className={inputClass}
              placeholder="Repita um nome já cadastrado para repor"
            />
          </Field>
          <Field label="Quantidade">
            <input
              required
              name="qty"
              type="number"
              step="0.01"
              className={inputClass}
            />
          </Field>
          <Field label="Unidade">
            <select name="unit" className={inputClass}>
              <option>kg</option>
              <option>g</option>
              <option>un</option>
              <option>L</option>
              <option>ml</option>
            </select>
          </Field>
          <Field label="Mínimo">
            <input
              required
              name="min"
              type="number"
              step="0.01"
              className={inputClass}
            />
          </Field>
          <Field label="Custo unitário">
            <input
              required
              name="cost"
              type="number"
              step="0.01"
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
          return (
            <Panel key={item.id} className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">{item.name}</p>
                  <p className="text-xs text-muted-foreground">
                    Custo: {money(item.cost)} / {item.unit}
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

function Pricing({ stock }: { stock: StockItem[] }) {
  const [recipeName, setRecipeName] = useState('Bolo Red Velvet 2 kg');
  const [yieldCount, setYieldCount] = useState(1);
  const [recipeItems, setRecipeItems] = useState([
    { id: 1, stockId: 4, quantity: 0.5 },
    { id: 2, stockId: 1, quantity: 0.25 },
    { id: 3, stockId: 6, quantity: 1 },
  ]);
  const [hiddenCosts, setHiddenCosts] = useState([
    { id: 1, name: 'Gás e energia', percentage: 6 },
    { id: 2, name: 'Mão de obra', percentage: 18 },
    { id: 3, name: 'Perdas e desperdícios', percentage: 4 },
  ]);
  const [profit, setProfit] = useState(35);
  const [cardFee, setCardFee] = useState(4.99);
  const [tax, setTax] = useState(3);
  const enrichedItems = recipeItems
    .map((item) => ({
      ...item,
      stockItem: stock.find((entry) => entry.id === item.stockId),
    }))
    .filter((item) => item.stockItem);
  const ingredientCost = enrichedItems
    .filter(
      (item) => (item.stockItem?.category ?? 'Ingrediente') === 'Ingrediente',
    )
    .reduce(
      (sum, item) => sum + item.quantity * (item.stockItem?.cost ?? 0),
      0,
    );
  const packagingCost = enrichedItems
    .filter((item) => item.stockItem?.category === 'Embalagem')
    .reduce(
      (sum, item) => sum + item.quantity * (item.stockItem?.cost ?? 0),
      0,
    );
  const directCost = ingredientCost + packagingCost;
  const hiddenPercentage = hiddenCosts.reduce(
    (sum, item) => sum + item.percentage,
    0,
  );
  const hiddenTotal = (directCost * hiddenPercentage) / 100;
  const baseCost = directCost + hiddenTotal;
  const denominator = 1 - (profit + cardFee + tax) / 100;
  const totalPrice = denominator > 0 ? baseCost / denominator : 0;
  const unitPrice = totalPrice / Math.max(1, yieldCount);
  const addStockItem = (e: FormSubmit) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const stockId = Number(fieldValue(data, 'stockId'));
    const quantity = Number(fieldValue(data, 'quantity'));
    setRecipeItems((old) => {
      const found = old.find((item) => item.stockId === stockId);
      return found
        ? old.map((item) =>
            item.stockId === stockId
              ? { ...item, quantity: item.quantity + quantity }
              : item,
          )
        : [...old, { id: Date.now(), stockId, quantity }];
    });
    e.currentTarget.reset();
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
  };
  return (
    <>
      <PageHeading
        title="Ficha técnica e precificação"
        subtitle="Selecione ingredientes e embalagens do estoque, aplique gastos percentuais e preserve sua margem."
      />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_380px]">
        <div className="space-y-5">
          <Panel className="p-5">
            <div className="grid gap-4 sm:grid-cols-[1fr_150px]">
              <Field label="Nome da receita">
                <input
                  className={inputClass}
                  value={recipeName}
                  onChange={(e) => setRecipeName(e.target.value)}
                />
              </Field>
              <NumberField
                label="Rendimento (un.)"
                value={yieldCount}
                setValue={setYieldCount}
              />
            </div>
          </Panel>
          <Panel className="overflow-hidden">
            <PanelTitle
              title="Itens consumidos na receita"
              subtitle="A lista vem diretamente do estoque, incluindo embalagens"
            />
            <form
              onSubmit={addStockItem}
              className="grid gap-3 border-b bg-muted/25 p-4 sm:grid-cols-[1fr_170px_auto]"
            >
              <Field label="Item do estoque">
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
                          {item.name} — {money(item.cost)}/{item.unit}
                        </option>
                      ))}
                  </optgroup>
                  <optgroup label="Embalagens">
                    {stock
                      .filter((item) => item.category === 'Embalagem')
                      .map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name} — {money(item.cost)}/{item.unit}
                        </option>
                      ))}
                  </optgroup>
                </select>
              </Field>
              <Field label="Quantidade utilizada">
                <input
                  required
                  name="quantity"
                  type="number"
                  min="0.001"
                  step="0.001"
                  className={inputClass}
                />
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
                      {item.quantity} {item.stockItem?.unit} ×{' '}
                      {money(item.stockItem?.cost ?? 0)} • saldo{' '}
                      {item.stockItem?.qty} {item.stockItem?.unit}
                    </p>
                  </div>
                  <strong className="text-sm">
                    {money(item.quantity * (item.stockItem?.cost ?? 0))}
                  </strong>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Excluir ${item.stockItem?.name}`}
                    onClick={() =>
                      setRecipeItems((old) =>
                        old.filter((x) => x.id !== item.id),
                      )
                    }
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
              subtitle="Cada percentual é aplicado sobre ingredientes + embalagens"
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
                <div
                  key={item.id}
                  className="flex items-center gap-4 px-5 py-3.5"
                >
                  <span className="flex-1 text-sm font-medium">
                    {item.name}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {money((directCost * item.percentage) / 100)}
                  </span>
                  <strong className="text-sm">{item.percentage}%</strong>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Excluir ${item.name}`}
                    onClick={() =>
                      setHiddenCosts((old) =>
                        old.filter((x) => x.id !== item.id),
                      )
                    }
                  >
                    <Trash2 />
                  </Button>
                </div>
              ))}
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
                setValue={setProfit}
              />
              <NumberField
                label="Taxa do cartão / gateway (%)"
                value={cardFee}
                setValue={setCardFee}
              />
              <NumberField
                label="Impostos sobre a venda (%)"
                value={tax}
                setValue={setTax}
              />
            </div>
            <p className="mt-4 rounded-xl bg-secondary/60 p-3 text-xs text-secondary-foreground">
              Gastos invisíveis incidem no custo. Taxas e lucro incidem no preço
              final, evitando que sejam retirados da sua margem.
            </p>
          </Panel>
          <Panel className="overflow-hidden">
            <div className="bg-gradient-to-br from-primary to-[#8f4fb8] p-6 text-primary-foreground">
              <p className="text-sm opacity-80">Preço sugerido por unidade</p>
              <p className="mt-2 font-heading text-4xl font-bold">
                {money(unitPrice)}
              </p>
              <p className="mt-2 text-xs opacity-75">
                {recipeName} • rendimento de {yieldCount} un.
              </p>
            </div>
            <div className="space-y-4 p-6">
              <CalcLine label="Ingredientes" value={money(ingredientCost)} />
              <CalcLine label="Embalagens" value={money(packagingCost)} />
              <CalcLine
                label={`Gastos invisíveis (${hiddenPercentage}%)`}
                value={money(hiddenTotal)}
              />
              <CalcLine
                label="Custo total da receita"
                value={money(baseCost)}
              />
              <CalcLine
                label="Taxas sobre venda"
                value={`${(cardFee + tax).toFixed(2)}%`}
              />
              <CalcLine
                label="Lucro estimado"
                value={money((totalPrice * profit) / 100)}
              />
              <CalcLine
                label="Venda da receita inteira"
                value={money(totalPrice)}
              />
              <Button
                disabled={denominator <= 0 || !enrichedItems.length}
                className="mt-2 w-full rounded-xl"
              >
                Salvar ficha técnica
              </Button>
              {denominator <= 0 && (
                <p className="text-xs font-medium text-destructive">
                  Lucro + taxas precisam somar menos de 100%.
                </p>
              )}
            </div>
          </Panel>
        </div>
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
}: {
  items: MenuItem[];
  setItems: (v: MenuItem[] | ((o: MenuItem[]) => MenuItem[])) => void;
}) {
  const [weekTitle, setWeekTitle] = useStoredState('doce-menu-week', '');
  const [weekStart, setWeekStart] = useStoredState('doce-menu-week-start', '');
  const [weekEnd, setWeekEnd] = useStoredState('doce-menu-week-end', '');

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
    setItems((old) => [
      ...old,
      {
        id: Date.now(),
        name: fieldValue(data, 'name'),
        category: fieldValue(data, 'category'),
        price: Number(fieldValue(data, 'price')),
        emoji: fieldValue(data, 'emoji') || '🧁',
        photoUrl: pendingPhoto || undefined,
        available: true,
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
            href="/cardapio"
            target="_blank"
            className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border bg-background px-2.5 text-sm font-medium transition hover:bg-muted"
          >
            <Eye className="size-4" /> Abrir cardápio do cliente
          </Link>
        }
      />
      <div className="mb-5 grid gap-5">
        <Panel className="p-5">
          <h2 className="font-heading text-lg font-bold">Edição da semana</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            O título aparece imediatamente no cardápio enviado aos clientes.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Field label="Início da edição">
              <input
                type="date"
                value={weekStart}
                onChange={(e) => setWeekStart(e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="Fim da edição">
              <input
                type="date"
                value={weekEnd}
                min={weekStart || undefined}
                onChange={(e) => setWeekEnd(e.target.value)}
                className={inputClass}
              />
            </Field>
          </div>
          {weekTitle && (
            <p className="mt-3 text-xs font-semibold text-primary">
              {weekTitle}
            </p>
          )}
        </Panel>
      </div>
      <Panel className="mb-5 p-5">
        <form
          onSubmit={addProduct}
          className="grid gap-3 md:grid-cols-[1.4fr_.8fr_.7fr_.45fr_auto]"
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
          <Field label="Emoji">
            <input name="emoji" className={inputClass} placeholder="🧁" />
          </Field>
          <div className="flex items-end">
            <Button type="submit" className="h-10" disabled={uploadingPhoto}>
              <Plus /> Adicionar produto
            </Button>
          </div>
          <div className="md:col-span-5">
            <Field label="Foto do produto (opcional)">
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={uploadProductPhoto}
                disabled={uploadingPhoto}
                className={inputClass}
              />
            </Field>
            {uploadingPhoto && (
              <p className="mt-1 text-xs text-muted-foreground">
                Enviando foto...
              </p>
            )}
            {photoError && (
              <p className="mt-1 text-xs text-destructive">{photoError}</p>
            )}
            {pendingPhoto && !uploadingPhoto && (
              <p className="mt-1 text-xs text-muted-foreground">
                Foto pronta — será usada no próximo produto adicionado.
              </p>
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
          {items.length === 0 && (
            <Empty label="Nenhum produto cadastrado nesta edição ainda." />
          )}
          {items.map((item) => (
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
                </p>
              </div>
              <Badge variant={item.available ? 'secondary' : 'outline'}>
                {item.available ? 'Publicado' : 'Oculto'}
              </Badge>
              <Button
                variant={item.available ? 'outline' : 'default'}
                onClick={() =>
                  setItems((old) =>
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

function formatBirthday(birthday?: string): string {
  if (!birthday) return 'Sem data cadastrada';
  const [year, month, day] = birthday.split('-');
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
                      🎂 {formatBirthday(client.birthday)}
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
              <div className="mt-5 grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-muted p-3">
                  <p className="text-xs text-muted-foreground">Pedidos</p>
                  <p className="text-xl font-bold">{clientOrders.length}</p>
                </div>
                <div className="rounded-xl bg-muted p-3">
                  <p className="text-xs text-muted-foreground">Selos</p>
                  <p className="text-xl font-bold">{client.stamps}/10</p>
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

function WhatsApp() {
  const commands = [
    [
      'Qualquer mensagem',
      'O bot responde com o link do cardápio público para o cliente pedir.',
    ],
    [
      'Número do pedido (ex.: 2001)',
      'O bot consulta o Cosmos DB e responde com status, entrega e valor.',
    ],
  ];
  return (
    <>
      <PageHeading
        title="Bot de pedidos no WhatsApp"
        subtitle="Webhook implementado — falta só conectar a conta da Meta."
      />
      <div className="grid gap-5 lg:grid-cols-[1fr_.8fr]">
        <Panel className="overflow-hidden">
          <PanelTitle
            title="O que o bot já faz"
            subtitle="app/api/whatsapp/webhook"
          />
          <div className="divide-y">
            {commands.map(([title, detail], i) => (
              <div key={title} className="flex gap-4 p-5">
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[#f0e4f6] text-sm font-bold text-[#5e2c80]">
                  {i + 1}
                </span>
                <div>
                  <p className="font-semibold">{title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{detail}</p>
                </div>
              </div>
            ))}
          </div>
        </Panel>
        <Panel className="p-6">
          <span className="grid size-12 place-items-center rounded-2xl bg-[#ebdcf3] text-[#642e8a]">
            <MessageCircleMore />
          </span>
          <h2 className="mt-5 font-heading text-xl font-bold">
            Falta conectar a conta
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Crie um app em developers.facebook.com com o produto WhatsApp e
            preencha as variáveis WHATSAPP_* — o passo a passo está no
            README.md.
          </p>
          <div className="mt-5 space-y-2 text-sm">
            <Step done label="Webhook e comandos implementados" />
            <Step done label="Conectado ao banco de pedidos" />
            <Step label="Criar app na Meta e obter credenciais" />
            <Step label="Verificação da empresa (Meta)" />
          </div>
        </Panel>
      </div>
    </>
  );
}
function Step({ label, done = false }: { label: string; done?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className={`grid size-5 place-items-center rounded-full ${done ? 'bg-green-100 text-green-700' : 'bg-muted text-muted-foreground'}`}
      >
        {done ? <Check className="size-3" /> : ''}
      </span>
      <span>{label}</span>
    </div>
  );
}
function Empty({ label }: { label: string }) {
  return (
    <div className="p-10 text-center text-sm text-muted-foreground">
      {label}
    </div>
  );
}
