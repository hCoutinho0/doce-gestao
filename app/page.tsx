'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowDownRight,
  ArrowUpRight,
  BadgeDollarSign,
  CakeSlice,
  Check,
  ChevronRight,
  CircleDollarSign,
  Eye,
  Gift,
  LayoutDashboard,
  LoaderCircle,
  LogOut,
  Menu,
  MessageCircleMore,
  PackageOpen,
  Plus,
  Search,
  Settings2,
  ShoppingBag,
  Sparkles,
  Trash2,
  Users,
  WalletCards,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { BAKERY_KEY, type BakeryProfile } from '@/lib/bakery';
import { useUserSession, signOut } from '@/lib/auth';

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
type Order = {
  id: string;
  customer: string;
  item: string;
  date: string;
  value: number;
  status: string;
};
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
  value: number;
  date: string;
};
type MenuItem = {
  id: number;
  name: string;
  category: string;
  price: number;
  available: boolean;
  emoji: string;
};
type LoyaltyItem = { id: number; name: string; phone: string; stamps: number };

const initialOrders: Order[] = [
  {
    id: '#1048',
    customer: 'Mariana Alves',
    item: 'Bolo Red Velvet',
    date: 'Hoje, 10:30',
    value: 148,
    status: 'Produção',
  },
  {
    id: '#1047',
    customer: 'Bruno Lima',
    item: 'Caixa 12 brigadeiros',
    date: 'Hoje, 11:15',
    value: 72,
    status: 'Novo',
  },
  {
    id: '#1046',
    customer: 'Cláudia Nunes',
    item: 'Kit festa pequeno',
    date: 'Hoje, 14:00',
    value: 219,
    status: 'Pronto',
  },
  {
    id: '#1045',
    customer: 'Ana Beatriz',
    item: 'Torta de limão',
    date: 'Hoje, 16:30',
    value: 92,
    status: 'Entrega',
  },
];
const initialStock: StockItem[] = [
  {
    id: 1,
    name: 'Chocolate 50%',
    qty: 1.2,
    unit: 'kg',
    min: 3,
    cost: 42,
    category: 'Ingrediente',
  },
  {
    id: 2,
    name: 'Leite condensado',
    qty: 6,
    unit: 'un',
    min: 12,
    cost: 7.5,
    category: 'Ingrediente',
  },
  {
    id: 3,
    name: 'Creme de leite',
    qty: 4,
    unit: 'un',
    min: 10,
    cost: 4.8,
    category: 'Ingrediente',
  },
  {
    id: 4,
    name: 'Farinha de trigo',
    qty: 8,
    unit: 'kg',
    min: 5,
    cost: 6.2,
    category: 'Ingrediente',
  },
  {
    id: 5,
    name: 'Açúcar refinado',
    qty: 10,
    unit: 'kg',
    min: 4,
    cost: 4.9,
    category: 'Ingrediente',
  },
  {
    id: 6,
    name: 'Caixa para bolo 25 cm',
    qty: 18,
    unit: 'un',
    min: 10,
    cost: 6.5,
    category: 'Embalagem',
  },
  {
    id: 7,
    name: 'Caixa para 12 doces',
    qty: 24,
    unit: 'un',
    min: 15,
    cost: 3.9,
    category: 'Embalagem',
  },
];
const initialFinance: FinanceItem[] = [
  {
    id: 1,
    description: 'Pedidos do dia',
    type: 'Entrada',
    value: 1284,
    date: '02/09/2026',
  },
  {
    id: 2,
    description: 'Compra de embalagens',
    type: 'Saída',
    value: 186.5,
    date: '02/09/2026',
  },
  {
    id: 3,
    description: 'Ingredientes atacado',
    type: 'Saída',
    value: 342.8,
    date: '01/09/2026',
  },
  {
    id: 4,
    description: 'Encomendas via Pix',
    type: 'Entrada',
    value: 680,
    date: '01/09/2026',
  },
];
const initialMenu: MenuItem[] = [
  {
    id: 1,
    name: 'Bolo Red Velvet',
    category: 'Bolos',
    price: 148,
    available: true,
    emoji: '🍰',
  },
  {
    id: 2,
    name: 'Torta de limão',
    category: 'Tortas',
    price: 92,
    available: true,
    emoji: '🥧',
  },
  {
    id: 3,
    name: 'Caixa 12 brigadeiros',
    category: 'Docinhos',
    price: 72,
    available: true,
    emoji: '🍫',
  },
  {
    id: 4,
    name: 'Kit festa pequeno',
    category: 'Kits',
    price: 219,
    available: false,
    emoji: '🎉',
  },
];
const initialLoyalty: LoyaltyItem[] = [
  { id: 1, name: 'Mariana Alves', phone: '(11) 98812-4401', stamps: 8 },
  { id: 2, name: 'Ana Beatriz', phone: '(11) 97124-1890', stamps: 5 },
  { id: 3, name: 'Cláudia Nunes', phone: '(11) 98177-8200', stamps: 10 },
];

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
type FormSubmit = {
  preventDefault: () => void;
  currentTarget: HTMLFormElement;
};

export default function Home() {
  const [view, setView] = useState<View>('dashboard');
  const [orders, setOrders] = useStoredState('doce-orders', initialOrders);
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

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto grid min-h-screen max-w-[1680px] lg:grid-cols-[256px_minmax(0,1fr)]">
        <aside className="hidden border-r border-sidebar-border bg-sidebar px-4 py-6 lg:flex lg:flex-col">
          <Brand bakery={bakery} />
          <nav aria-label="Navegação principal" className="space-y-1">
            {visibleNavItems.map(({ label, icon: Icon, view: target }) => (
              <button
                key={label}
                onClick={() => setView(target)}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-colors ${view === target ? 'bg-primary text-primary-foreground shadow-sm' : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'}`}
              >
                <Icon className="size-[18px]" />
                <span>{label}</span>
                {target === 'orders' && orders.length ? (
                  <span className="ml-auto rounded-full bg-[#dec7ff] px-2 py-0.5 text-[11px] font-bold text-[#492477]">
                    {orders.length}
                  </span>
                ) : null}
              </button>
            ))}
          </nav>
          {session.role === 'admin' && (
            <button
              onClick={() => setView('whatsapp')}
              className={`mt-auto rounded-2xl border p-4 text-left transition ${view === 'whatsapp' ? 'border-primary bg-primary/10' : 'border-[#ddcff0] bg-[#faf7ff] hover:border-primary/40'}`}
            >
              <div className="mb-3 grid size-9 place-items-center rounded-xl bg-[#eadcff] text-[#63369a]">
                <MessageCircleMore className="size-5" />
              </div>
              <p className="text-sm font-semibold text-[#352047]">
                WhatsApp conectado
              </p>
              <p className="mt-1 text-xs leading-relaxed text-[#735e82]">
                Veja o fluxo planejado do bot de pedidos.
              </p>
              <span className="mt-3 flex items-center gap-1 text-xs font-bold text-[#7040a3]">
                Ver automações <ChevronRight className="size-3" />
              </span>
            </button>
          )}
        </aside>

        <section className="min-w-0">
          <header className="sticky top-0 z-20 flex h-[72px] items-center gap-3 border-b bg-background/90 px-4 backdrop-blur-xl sm:px-7">
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              aria-label="Abrir menu"
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
                <div className="grid size-9 place-items-center rounded-full bg-[#e5d4fa] text-sm font-bold text-[#5b2e8c]">
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
              />
            )}
            {view === 'orders' && (
              <Orders orders={orders} setOrders={setOrders} />
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
              <Customers loyalty={loyalty} orders={orders} />
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
}: {
  orders: Order[];
  lowStock: StockItem[];
  finance: FinanceItem[];
  todaySales: number;
  profit: number;
  setView: (v: View) => void;
}) {
  const entries = finance
    .filter((item) => item.type === 'Entrada')
    .reduce((sum, item) => sum + item.value, 0);
  const expenses = finance
    .filter((item) => item.type === 'Saída')
    .reduce((sum, item) => sum + item.value, 0);
  return (
    <div className="space-y-7">
      <PageHeading
        title="Bom dia, Gabi!"
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
    Novo: 'bg-[#eef1ff] text-[#535f9f]',
    Produção: 'bg-[#fff4d9] text-[#8b6412]',
    Pronto: 'bg-[#e9f7ef] text-[#277447]',
    Entrega: 'bg-[#f8eefa] text-[#82468e]',
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
function OrderTable({
  orders,
  compact = false,
  onStatus,
  onDelete,
}: {
  orders: Order[];
  compact?: boolean;
  onStatus?: (id: string) => void;
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
              <td className="px-3 py-3.5">{order.date}</td>
              <td className="px-3 py-3.5 font-medium">{money(order.value)}</td>
              <td className="px-3 py-3.5">
                <StatusBadge status={order.status} />
              </td>
              {!compact && (
                <td className="px-3 py-3.5">
                  <div className="flex gap-1">
                    <Button
                      onClick={() => onStatus?.(order.id)}
                      size="sm"
                      variant="outline"
                    >
                      Avançar
                    </Button>
                    <Button
                      onClick={() => onDelete?.(order.id)}
                      size="icon-sm"
                      variant="destructive"
                      aria-label="Excluir pedido"
                    >
                      <Trash2 />
                    </Button>
                  </div>
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

function Orders({
  orders,
  setOrders,
}: {
  orders: Order[];
  setOrders: (v: Order[] | ((o: Order[]) => Order[])) => void;
}) {
  const add = (e: FormSubmit) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const value = Number(fieldValue(data, 'value').replace(',', '.'));
    setOrders((old) => [
      {
        id: `#${1049 + old.length}`,
        customer: fieldValue(data, 'customer'),
        item: fieldValue(data, 'item'),
        date: fieldValue(data, 'date'),
        value,
        status: 'Novo',
      },
      ...old,
    ]);
    e.currentTarget.reset();
  };
  const advance = (id: string) => {
    const flow = ['Novo', 'Produção', 'Pronto', 'Entrega', 'Concluído'];
    setOrders((old) =>
      old.map((o) =>
        o.id === id
          ? {
              ...o,
              status:
                flow[Math.min(flow.length - 1, flow.indexOf(o.status) + 1)],
            }
          : o,
      ),
    );
  };
  return (
    <>
      <PageHeading
        title="Pedidos"
        subtitle="Lance, acompanhe, altere o status ou exclua encomendas."
      />
      <Panel className="mb-5 p-5">
        <form onSubmit={add} className="grid gap-3 md:grid-cols-5">
          <Field label="Cliente">
            <input
              required
              name="customer"
              className={inputClass}
              placeholder="Nome do cliente"
            />
          </Field>
          <Field label="Produto">
            <input
              required
              name="item"
              className={inputClass}
              placeholder="Ex.: Bolo 2 kg"
            />
          </Field>
          <Field label="Entrega">
            <input
              required
              name="date"
              className={inputClass}
              placeholder="Ex.: Sex, 14:00"
            />
          </Field>
          <Field label="Valor">
            <input
              required
              name="value"
              type="number"
              step="0.01"
              className={inputClass}
              placeholder="0,00"
            />
          </Field>
          <div className="flex items-end">
            <Button type="submit" className="h-10 w-full rounded-xl">
              <Plus /> Lançar pedido
            </Button>
          </div>
        </form>
      </Panel>
      <Panel className="overflow-hidden">
        <PanelTitle
          title={`${orders.length} pedidos`}
          subtitle="Clique em Avançar para mudar o status"
        />
        <OrderTable
          orders={orders}
          onStatus={advance}
          onDelete={(id) => setOrders((old) => old.filter((o) => o.id !== id))}
        />
      </Panel>
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
  const add = (e: FormSubmit) => {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    setStock((old) => [
      ...old,
      {
        id: Date.now(),
        name: fieldValue(d, 'name'),
        category: fieldValue(d, 'category') as 'Ingrediente' | 'Embalagem',
        qty: Number(fieldValue(d, 'qty')),
        unit: fieldValue(d, 'unit'),
        min: Number(fieldValue(d, 'min')),
        cost: Number(fieldValue(d, 'cost')),
      },
    ]);
    e.currentTarget.reset();
  };
  return (
    <>
      <PageHeading
        title="Estoque e embalagens"
        subtitle="Cadastre insumos uma vez e reutilize-os automaticamente nas fichas técnicas."
      />
      <Panel className="mb-5 p-5">
        <form onSubmit={add} className="grid gap-3 md:grid-cols-7">
          <Field label="Item">
            <input required name="name" className={inputClass} />
          </Field>
          <Field label="Categoria">
            <select name="category" className={inputClass}>
              <option>Ingrediente</option>
              <option>Embalagem</option>
            </select>
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
            <Button className="h-10 w-full rounded-xl">
              <Plus /> Adicionar
            </Button>
          </div>
        </form>
      </Panel>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {stock.map((item) => {
          const low = item.qty < item.min;
          return (
            <Panel key={item.id} className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <Badge variant="outline" className="mb-2">
                    {item.category ?? 'Ingrediente'}
                  </Badge>
                  <p className="font-semibold">{item.name}</p>
                  <p className="text-xs text-muted-foreground">
                    Custo: {money(item.cost)} / {item.unit}
                  </p>
                </div>
                <Badge variant={low ? 'destructive' : 'secondary'}>
                  {low ? 'Repor' : 'Normal'}
                </Badge>
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
                <Button className="h-10">
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
                <Button className="h-10">
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
            <div className="bg-gradient-to-br from-primary to-[#8b5bc4] p-6 text-primary-foreground">
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

function Finance({
  items,
  setItems,
}: {
  items: FinanceItem[];
  setItems: (v: FinanceItem[] | ((o: FinanceItem[]) => FinanceItem[])) => void;
}) {
  const entries = items
      .filter((x) => x.type === 'Entrada')
      .reduce((s, x) => s + x.value, 0),
    expenses = items
      .filter((x) => x.type === 'Saída')
      .reduce((s, x) => s + x.value, 0);
  const add = (e: FormSubmit) => {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    setItems((old) => [
      {
        id: Date.now(),
        description: fieldValue(d, 'description'),
        type: fieldValue(d, 'type') as 'Entrada' | 'Saída',
        value: Number(fieldValue(d, 'value')),
        date: new Date().toLocaleDateString('pt-BR'),
      },
      ...old,
    ]);
    e.currentTarget.reset();
  };
  return (
    <>
      <PageHeading
        title="Financeiro"
        subtitle="Registre entradas e saídas para saber o resultado real da confeitaria."
      />
      <section className="mb-5 grid gap-4 sm:grid-cols-3">
        <MetricCard
          icon={ArrowUpRight}
          label="Entradas"
          value={money(entries)}
          detail="No período"
          positive
        />
        <MetricCard
          icon={ArrowDownRight}
          label="Saídas"
          value={money(expenses)}
          detail="No período"
        />
        <MetricCard
          icon={WalletCards}
          label="Saldo"
          value={money(entries - expenses)}
          detail="Resultado registrado"
        />
      </section>
      <Panel className="mb-5 p-5">
        <form onSubmit={add} className="grid gap-3 md:grid-cols-4">
          <Field label="Descrição">
            <input required name="description" className={inputClass} />
          </Field>
          <Field label="Tipo">
            <select name="type" className={inputClass}>
              <option>Entrada</option>
              <option>Saída</option>
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
          <div className="flex items-end">
            <Button className="h-10 w-full rounded-xl">
              <Plus /> Lançar
            </Button>
          </div>
        </form>
      </Panel>
      <Panel className="overflow-hidden">
        <PanelTitle title="Movimentações" subtitle="Histórico de caixa" />
        <div className="divide-y">
          {items.map((item) => (
            <div key={item.id} className="flex items-center gap-4 px-5 py-4">
              <span
                className={`grid size-9 place-items-center rounded-xl ${item.type === 'Entrada' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}
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
                <p className="text-xs text-muted-foreground">{item.date}</p>
              </div>
              <p
                className={`font-semibold ${item.type === 'Entrada' ? 'text-green-700' : 'text-red-700'}`}
              >
                {item.type === 'Entrada' ? '+' : '−'} {money(item.value)}
              </p>
              <Button
                variant="ghost"
                size="icon-sm"
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
  const [weekTitle, setWeekTitle] = useStoredState(
    'doce-menu-week',
    'Semana de 2 a 8 de setembro',
  );
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
        available: true,
      },
    ]);
    e.currentTarget.reset();
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
          <Field label="Período ou nome da edição">
            <input
              value={weekTitle}
              onChange={(e) => setWeekTitle(e.target.value)}
              className={`${inputClass} mt-4`}
              placeholder="Ex.: Semana das Tortas • 9 a 15/09"
            />
          </Field>
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
            <Button className="h-10">
              <Plus /> Adicionar produto
            </Button>
          </div>
        </form>
      </Panel>
      <Panel className="overflow-hidden">
        <PanelTitle
          title="Produtos da edição"
          subtitle="Publique, oculte ou remova manualmente os itens desta semana"
        />
        <div className="divide-y">
          {items.map((item) => (
            <div key={item.id} className="flex items-center gap-4 px-5 py-4">
              <span className="grid size-11 place-items-center rounded-xl bg-secondary text-2xl">
                {item.emoji}
              </span>
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

function Customers({
  loyalty,
  orders,
}: {
  loyalty: LoyaltyItem[];
  orders: Order[];
}) {
  return (
    <>
      <PageHeading
        title="Clientes"
        subtitle="Visão rápida do relacionamento e histórico de compras."
      />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {loyalty.map((client) => {
          const clientOrders = orders.filter((o) => o.customer === client.name);
          return (
            <Panel key={client.id} className="p-5">
              <div className="flex items-center gap-3">
                <span className="grid size-11 place-items-center rounded-full bg-secondary font-bold text-primary">
                  {client.name
                    .split(' ')
                    .map((x) => x[0])
                    .slice(0, 2)
                    .join('')}
                </span>
                <div>
                  <p className="font-semibold">{client.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {client.phone}
                  </p>
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
              <Button variant="outline" className="mt-4 w-full">
                Ver histórico
              </Button>
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
        subtitle="A cada compra, um selo. Com 10 selos, o cliente ganha 15% de desconto."
      />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {items.map((client) => (
          <Panel key={client.id} className="overflow-hidden">
            <div className="bg-gradient-to-br from-[#4f237c] to-[#9a63ce] p-5 text-white">
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
                  ? 'Desconto liberado: 15%'
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
      'Novo pedido',
      'Cliente envia “quero pedir” e o bot apresenta o cardápio.',
    ],
    ['Acompanhar', 'Cliente consulta o status pelo número do pedido.'],
    [
      'Atualizar status',
      'Equipe usa comando protegido para avançar a produção.',
    ],
    ['Cancelar', 'Cancelamento confirma antes de excluir e registra o motivo.'],
  ];
  return (
    <>
      <PageHeading
        title="Bot de pedidos no WhatsApp"
        subtitle="Fluxo preparado para integrar a API oficial do WhatsApp após o protótipo."
      />
      <div className="grid gap-5 lg:grid-cols-[1fr_.8fr]">
        <Panel className="overflow-hidden">
          <PanelTitle
            title="Automações planejadas"
            subtitle="Tudo refletido na aba Pedidos"
          />
          <div className="divide-y">
            {commands.map(([title, detail], i) => (
              <div key={title} className="flex gap-4 p-5">
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[#eee5fb] text-sm font-bold text-[#61358f]">
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
          <span className="grid size-12 place-items-center rounded-2xl bg-[#e9dcfa] text-[#66359a]">
            <MessageCircleMore />
          </span>
          <h2 className="mt-5 font-heading text-xl font-bold">
            Próxima etapa da integração
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Usaremos a API oficial da Meta ou um provedor homologado. O webhook
            receberá mensagens, validará o usuário e gravará os pedidos no banco
            online, mantendo os computadores sincronizados.
          </p>
          <div className="mt-5 space-y-2 text-sm">
            <Step done label="Fluxo e comandos definidos" />
            <Step label="Criar banco e autenticação" />
            <Step label="Conectar WhatsApp Business" />
            <Step label="Publicar webhook seguro" />
          </div>
          <Button className="mt-6 w-full">Configurar integração</Button>
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
