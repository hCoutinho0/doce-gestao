'use client';

import Image from 'next/image';
import { useEffect, useMemo, useState, type ComponentProps } from 'react';
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
  BarChart3,
  Bell,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronLeft,
  Circle,
  ClipboardList,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Download,
  Eye,
  Gift,
  LoaderCircle,
  Minus,
  Menu,
  PackageOpen,
  Pencil,
  Printer,
  Plus,
  Settings,
  Search,
  ShoppingBag,
  ShoppingCart,
  MessageCircle,
  Sparkles,
  Trash2,
  Copy,
  Upload,
  UserPlus,
  WalletCards,
  X,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  IconeCardapio,
  IconeClientes,
  IconeEquipe,
  IconeEstoque,
  IconeFidelidade,
  IconeFinanceiro,
  IconePedidos,
  IconePrecificacao,
  IconeProdutos,
  IconeVisaoGeral,
} from '@/components/icones-interface';
import { usePanelLoading, useServerFetchedState, useStoredState } from '@/lib/use-painel';
import { BAKERY_KEY, type BakeryProfile } from '@/lib/bakery';
import { useUserSession, signOut } from '@/lib/auth';
import type { Invite } from '@/lib/tenant';
import { MenuConta } from '@/components/menu-conta';
import { formatPhone, normalizePhone } from '@/lib/phone';
import type {
  FinanceItem,
  LoyaltyItem,
  MenuItem,
  MenuPeriod,
  Order,
  Product,
  ProductRecipe,
  RecipeLine,
  ShoppingItem,
  StockItem,
} from '@/lib/tipos';
import { computeRecipeCost, gramCostOf, lineCost, lineWeightGrams, recipeKey } from '@/lib/custos';
import { Empty, Field, PageHeading, Panel, PanelTitle, inputClass, money } from '@/components/painel-ui';
import { Agenda } from '@/components/agenda';
import { Lembretes } from '@/components/lembretes';
import { Ajustes as AjustesPanel } from '@/components/ajustes';
import { AcoesPedido } from '@/components/acoes-pedido';
import { AvisoPedidos } from '@/components/aviso-pedidos';
import { Relatorios } from '@/components/relatorios';
import { ReceberPagamento } from '@/components/receber-pagamento';
import { RegistrarPerda } from '@/components/registrar-perda';
import { balanceDue, paidSoFar } from '@/lib/orders';
import { dayIsFull } from '@/lib/agenda';
import { expiryStatus, daysUntil } from '@/lib/validade';
import { suggestPurchases } from '@/lib/compras';
import type { Ajustes, Perda } from '@/lib/tipos';

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
  | 'team'
  | 'agenda'
  | 'reports'
  | 'settings'
  | 'help';
const ORDER_STATUSES = ['Novo', 'Produção', 'Pronto', 'Entrega', 'Concluído'];
const PAYMENT_METHODS = ['Pix', 'Cartão', 'Dinheiro', 'Presente'] as const;
// Caixa da empresa: o saldo que a conta bancária tinha quando foi
// informado (setAt) + tudo que entrou e saiu no Financeiro depois disso.
type CashBalance = { amount: number; setAt: number } | null;

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


// Real confeitarias start with none of this — orders, stock, finance,
// cardápio and clientes all begin empty and fill up from what the admin
// and their customers actually do, not from sample rows.
const initialOrders: Order[] = [];
const initialStock: StockItem[] = [];
const initialFinance: FinanceItem[] = [];
const initialMenu: MenuItem[] = [];
const initialLoyalty: LoyaltyItem[] = [];

type NavIcon = (props: { className?: string }) => React.ReactNode;
const navItems: { label: string; icon: NavIcon; view: View }[] =
  [
    { label: 'Visão geral', icon: IconeVisaoGeral, view: 'dashboard' },
    { label: 'Pedidos', icon: IconePedidos, view: 'orders' },
    { label: 'Agenda', icon: CalendarDays, view: 'agenda' },
    { label: 'Estoque', icon: IconeEstoque, view: 'stock' },
    { label: 'Precificação', icon: IconePrecificacao, view: 'pricing' },
    { label: 'Financeiro', icon: IconeFinanceiro, view: 'finance' },
    { label: 'Relatórios', icon: BarChart3, view: 'reports' },
    { label: 'Cardápio', icon: IconeCardapio, view: 'menu' },
    { label: 'Produtos', icon: IconeProdutos, view: 'products' },
    { label: 'Clientes', icon: IconeClientes, view: 'customers' },
    { label: 'Fidelidade', icon: IconeFidelidade, view: 'loyalty' },
    { label: 'Equipe', icon: IconeEquipe, view: 'team' },
    { label: 'Ajustes', icon: Settings, view: 'settings' },
  ];
// Nome do item como vai no pedido ("Brownie — Pistache"); o servidor
// confere o preço pelo mesmo nome (app/api/orders).
const menuLabel = (item: Pick<MenuItem, 'name' | 'flavor'>) =>
  item.flavor?.trim() ? `${item.name} — ${item.flavor.trim()}` : item.name;
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
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [orders, setOrders] = useServerFetchedState('doce-orders', initialOrders);
  const [stock, setStock] = useStoredState('doce-stock-v2', initialStock);
  const [shopping, setShopping] = useStoredState<ShoppingItem[]>('doce-compras', []);
  const [finance, setFinance] = useStoredState('doce-finance', initialFinance);
  const [menuItems, setMenuItems] = useStoredState('doce-menu', initialMenu);
  const [cash, setCash] = useStoredState<CashBalance>('doce-caixa', null);
  const [menuPeriod, setMenuPeriod] = useStoredState<MenuPeriod>('doce-menu-periodo', null);
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
  const [ajustes, setAjustes] = useStoredState<Ajustes>('doce-ajustes', {});
  const [perdas, setPerdas] = useStoredState<Perda[]>('doce-perdas', []);
  const [bakery] = useServerFetchedState<BakeryProfile | null>(BAKERY_KEY, null);
  const { session, isLoading: sessionLoading } = useUserSession();
  const isBrowserReady = !sessionLoading;

  const panelLoading = usePanelLoading();

  useEffect(() => {
    if (isBrowserReady && !session) window.location.replace('/login');
  }, [isBrowserReady, session]);

  // App no celular: registra o service worker (não no aplicativo de desktop,
  // que roda em 127.0.0.1).
  useEffect(() => {
    if ('serviceWorker' in navigator && location.hostname !== '127.0.0.1') {
      void navigator.serviceWorker.register('/sw.js').catch(() => undefined);
    }
  }, []);

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
          ['dashboard', 'orders', 'agenda', 'stock', 'menu', 'help'].includes(item.view),
        )
      : navItems;
  const pageTitle =
    view === 'help' ? 'Ajuda' : (navItems.find((item) => item.view === view)?.label ?? '');

  if (!isBrowserReady || !session) {
    return (
      <main id="conteudo" tabIndex={-1} className="grid min-h-screen place-items-center bg-background">
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
    conta: {
      nome: session.name,
      email: session.email,
      papel: session.roleLabel,
      iniciais: session.initials,
      admin: session.role === 'admin',
      onSair: () => void signOut(),
    },
  };

  return (
    <main id="conteudo" tabIndex={-1} className="min-h-screen bg-background pb-[env(safe-area-inset-bottom)] text-foreground">
      <div className="mx-auto grid min-h-screen max-w-[1680px] lg:grid-cols-[16rem_minmax(0,1fr)]">
        <aside className="vidro-sidebar hidden border-r border-sidebar-border px-3 py-5 lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col lg:self-start">
          <SidebarNav {...sidebarProps} />
        </aside>
        {mobileNavOpen && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <button
              aria-label="Fechar menu"
              className="absolute inset-0 bg-foreground/30 backdrop-blur-sm"
              onClick={() => setMobileNavOpen(false)}
            />
            <div className="absolute inset-y-0 left-0 flex w-[min(17.5rem,85vw)] flex-col bg-sidebar px-4 py-6 shadow-xl">
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
          <header className="vidro sticky top-0 z-20 flex h-[64px] items-center gap-3 border-b px-4 sm:px-7">
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
              <AvisoPedidos orders={orders} ready={!panelLoading} onOpen={() => setView('orders')} />
              <Badge
                variant="outline"
                className="hidden border-[#cce7d7] bg-[#edf9f2] text-[#28724a] sm:inline-flex"
              >
                <span className="size-1.5 rounded-full bg-[#3aa66c]" /> Dados
                sincronizados
              </Badge>
            </div>
          </header>

          <MobileNav view={view} setView={setView} items={visibleNavItems} />
          <div
            className={`p-4 transition-opacity sm:p-7 xl:p-9 ${panelLoading ? 'opacity-50' : ''}`}
            aria-busy={panelLoading}
          >
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
                stock={stock}
                recipes={recipes}
                menuItems={menuItems}
                customers={loyalty}
                confeitaria={bakery?.name ?? 'Confeitaria'}
              />
            )}
            {view === 'help' && <HelpCenter />}
            {view === 'orders' && (
              <Orders
                orders={orders}
                setOrders={setOrders}
                menuItems={menuItems}
                customers={loyalty}
                setFinance={setFinance}
                setLoyalty={setLoyalty}
                ajustes={ajustes}
                confeitaria={bakery?.name ?? 'Confeitaria'}
              />
            )}
            {view === 'agenda' && (
              <Agenda
                orders={orders}
                dailyLimit={ajustes.dailyLimit}
                confeitaria={bakery?.name ?? 'Confeitaria'}
                onOpenOrders={() => setView('orders')}
              />
            )}
            {view === 'stock' && (
              <Stock
                stock={stock}
                setStock={setStock}
                shopping={shopping}
                setShopping={setShopping}
                orders={orders}
                menuItems={menuItems}
                products={products}
                recipes={recipes}
                setPerdas={setPerdas}
              />
            )}
            {view === 'pricing' && (
              <Pricing
                stock={stock}
                setStock={setStock}
                menuItems={menuItems}
                setMenuItems={setMenuItems}
                products={products}
                setProducts={setProducts}
                recipes={recipes}
                setRecipes={setRecipes}
              />
            )}
            {view === 'finance' && (
              <Finance
                items={finance}
                setItems={setFinance}
                cash={cash}
                setCash={setCash}
              />
            )}
            {view === 'menu' && (
              <DigitalMenu
                items={menuItems}
                setItems={setMenuItems}
                bakeryId={session.bakeryId ?? ''}
                products={products}
                period={menuPeriod}
                setPeriod={setMenuPeriod}
              />
            )}
            {view === 'products' && (
              <ProductsCatalog
                items={products}
                setItems={setProducts}
                menuItems={menuItems}
                setMenuItems={setMenuItems}
              />
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
            {view === 'reports' && (
              <Relatorios
                orders={orders}
                finance={finance}
                recipes={recipes}
                stock={stock}
                menuItems={menuItems}
                products={products}
                perdas={perdas}
                confeitaria={bakery?.name ?? 'Confeitaria'}
              />
            )}
            {view === 'settings' && <AjustesPanel ajustes={ajustes} setAjustes={setAjustes} />}
            <p className="mt-8 text-center text-xs text-muted-foreground">
              {pageTitle} • Dados sincronizados na nuvem • Acesso: {session.roleLabel}
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}

function SidebarNav({
  bakery,
  visibleNavItems,
  view,
  orders,
  onNavigate,
  conta,
}: {
  bakery: BakeryProfile | null;
  visibleNavItems: { label: string; icon: NavIcon; view: View }[];
  view: View;
  orders: Order[];
  onNavigate: (target: View) => void;
  conta: Omit<ComponentProps<typeof MenuConta>, 'onAjuda'>;
}) {
  return (
    <>
      <Brand bakery={bakery} />
      <nav aria-label="Navegação principal" className="-mx-1 min-h-0 flex-1 space-y-1 overflow-y-auto px-1">
        {visibleNavItems.map(({ label, icon: Icon, view: target }) => (
          <button
            key={label}
            onClick={() => onNavigate(target)}
            className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-[0.9375rem] font-medium transition-colors duration-150 ${view === target ? 'bg-primary text-primary-foreground shadow-sm' : 'text-sidebar-foreground hover:bg-sidebar-accent'}`}
          >
            <Icon className={`size-[18px] ${view === target ? '' : 'text-primary'}`} />
            <span>{label}</span>
            {target === 'orders' && orders.length ? (
              <span className={`ml-auto rounded-full px-2 py-0.5 text-[11px] font-bold ${view === target ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-primary/12 text-primary'}`}>
                {orders.length}
              </span>
            ) : null}
          </button>
        ))}
      </nav>
      <MenuConta {...conta} onAjuda={() => onNavigate('help')} />
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
          <Image src="/assets/brand/app-icon.svg" alt="Confeitto" width={40} height={40} unoptimized className="size-full" />
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
    <div className="vidro sticky top-[64px] z-10 flex gap-2 overflow-x-auto border-b px-4 py-2 lg:hidden">
      {items.map(({ label, view: target }) => (
        <button
          key={target}
          onClick={() => setView(target)}
          className={`shrink-0 rounded-full px-4 py-3 text-xs font-semibold ${view === target ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}


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
  stock,
  recipes,
  menuItems,
  customers,
  confeitaria,
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
  stock: StockItem[];
  recipes: ProductRecipe[];
  menuItems: MenuItem[];
  customers: LoyaltyItem[];
  confeitaria: string;
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
      <OnboardingChecklist
        hasStock={stock.length > 0}
        hasRecipe={recipes.length > 0}
        hasPublishedMenuItem={menuItems.some((m) => m.available)}
        hasOrder={orders.length > 0}
        setView={setView}
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
      <Lembretes stock={stock} customers={customers} confeitaria={confeitaria} />
      <TasksPanel tasks={tasks} setTasks={setTasks} />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,.75fr)]">
        <Panel className="min-w-0 overflow-hidden">
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
              <div className="min-w-0 rounded-xl bg-green-50 p-3">
                <p className="text-[10px] font-semibold uppercase text-green-700">
                  Entradas
                </p>
                <p className="[overflow-wrap:anywhere] mt-1 text-sm font-bold text-green-800">
                  {money(entries)}
                </p>
              </div>
              <div className="min-w-0 rounded-xl bg-red-50 p-3">
                <p className="text-[10px] font-semibold uppercase text-red-700">
                  Saídas
                </p>
                <p className="[overflow-wrap:anywhere] mt-1 text-sm font-bold text-red-800">
                  {money(expenses)}
                </p>
              </div>
              <div className="min-w-0 rounded-xl bg-secondary p-3">
                <p className="text-[10px] font-semibold uppercase text-primary">
                  Saldo
                </p>
                <p className="[overflow-wrap:anywhere] mt-1 text-sm font-bold text-primary">
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

// Steps computed from real data (never their own separate checkbox state) —
// a step reads "done" the moment the thing it describes actually exists, so
// it can't drift from what the confeitaria has actually set up. Only the
// "dispensar" choice is stored, under 'doce-onboarding'.
function OnboardingChecklist({
  hasStock,
  hasRecipe,
  hasPublishedMenuItem,
  hasOrder,
  setView,
}: {
  hasStock: boolean;
  hasRecipe: boolean;
  hasPublishedMenuItem: boolean;
  hasOrder: boolean;
  setView: (v: View) => void;
}) {
  const [state, setState] = useStoredState<{ dismissed: boolean }>(
    'doce-onboarding',
    { dismissed: false },
  );

  const steps: {
    label: string;
    done: boolean;
    view: View;
    cta: string;
  }[] = [
    {
      label: 'Cadastre seu primeiro ingrediente ou embalagem',
      done: hasStock,
      view: 'stock',
      cta: 'Ir para Estoque',
    },
    {
      label: 'Monte a ficha técnica de um produto',
      done: hasRecipe,
      view: 'pricing',
      cta: 'Ir para Precificação',
    },
    {
      label: 'Publique um produto no cardápio online',
      done: hasPublishedMenuItem,
      view: 'menu',
      cta: 'Ir para Cardápio',
    },
    {
      label: 'Lance o primeiro pedido',
      done: hasOrder,
      view: 'orders',
      cta: 'Ir para Pedidos',
    },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  const allDone = doneCount === steps.length;

  if (state.dismissed || allDone) return null;

  return (
    <Panel className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-heading text-lg font-bold">Primeiros passos</h2>
          <p className="text-xs text-muted-foreground">
            {doneCount} de {steps.length} concluídos — leva menos de 10
            minutos para deixar tudo pronto.
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setState({ dismissed: true })}
        >
          Dispensar
        </Button>
      </div>
      <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{ width: `${(doneCount / steps.length) * 100}%` }}
        />
      </div>
      <div className="mt-4 divide-y">
        {steps.map((step) => (
          <div
            key={step.label}
            className="flex items-center justify-between gap-3 py-2.5"
          >
            <div className="flex items-center gap-2.5">
              {step.done ? (
                <CheckCircle2 className="size-[18px] shrink-0 text-primary" />
              ) : (
                <Circle className="size-[18px] shrink-0 text-muted-foreground/40" />
              )}
              <span
                className={`text-sm ${step.done ? 'text-muted-foreground line-through' : 'font-medium'}`}
              >
                {step.label}
              </span>
            </div>
            {!step.done && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setView(step.view)}
              >
                {step.cta} <ArrowUpRight />
              </Button>
            )}
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Ficou com dúvida em algum passo?{' '}
        <button
          type="button"
          onClick={() => setView('help')}
          className="font-semibold text-primary hover:underline"
        >
          Veja a Ajuda
        </button>
        .
      </p>
    </Panel>
  );
}

function TasksPanel({
  tasks,
  setTasks,
}: {
  tasks: Task[];
  setTasks: (v: Task[] | ((o: Task[]) => Task[])) => void;
}) {
  const [text, setText] = useState('');
  const add = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setTasks((old) => [
      { id: Date.now(), text: trimmed, done: false, createdAt: new Date().toISOString() },
      ...old,
    ]);
    setText('');
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
        <span
          className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold text-muted-foreground"
          title="O Confeitto avisa no Windows, uma vez por dia a partir das 8h (quando o aplicativo estiver aberto), se houver tarefas pendentes."
        >
          <Bell className="size-3.5" /> Lembrete diário às 8h
        </span>
      </div>
      <div className="mt-4 flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') add();
          }}
          placeholder="O que você precisa fazer?"
          aria-label="Nova tarefa"
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
                aria-label={`Concluir: ${task.text}`}
                className="size-4"
              />
              <span
                className={`min-w-0 flex-1 break-words text-sm ${task.done ? 'text-muted-foreground line-through' : ''}`}
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

type FaqEntry = { q: string; a: string };
type FaqSection = { title: string; entries: FaqEntry[] };

const FAQ_SECTIONS: FaqSection[] = [
  {
    title: 'Pedidos',
    entries: [
      {
        q: 'Como eu lanço um pedido novo?',
        a: 'Vá em Pedidos, escolha (ou digite) o nome do cliente, selecione os produtos do cardápio, defina data de entrega e forma de pagamento, e clique em Lançar pedido.',
      },
      {
        q: 'Os produtos não aparecem para eu escolher no pedido',
        a: 'A tela de Pedidos só mostra produtos já publicados no Cardápio. Publique o produto em Cardápio, ou em Produtos → Publicar no cardápio.',
      },
    ],
  },
  {
    title: 'Estoque',
    entries: [
      {
        q: 'Como cadastro um ingrediente ou embalagem?',
        a: 'Em Estoque, clique em Novo ingrediente (ou Novo embalagem) e preencha nome, quantidade, peso do pacote e valor pago — o sistema calcula sozinho o custo por grama ou por unidade.',
      },
      {
        q: "Para que serve o campo 'Local de compra'?",
        a: 'É só controle de fornecedor — ajuda a lembrar onde repor depois. Não entra em nenhum cálculo de custo ou preço.',
      },
      {
        q: 'Como faço para repor um item que já cadastrei?',
        a: 'Cadastre de novo com o mesmo nome, a nova quantidade e o novo valor pago. O sistema soma ao estoque existente e recalcula a média ponderada do custo — não precisa apagar o item antigo.',
      },
    ],
  },
  {
    title: 'Precificação',
    entries: [
      {
        q: 'Como crio a ficha técnica de um produto?',
        a: 'Em Precificação, escolha o produto (do cardápio ou só cadastrado), use + Adicionar item para puxar ingredientes do estoque, e preencha os percentuais de custos fixos, lucro e taxa de cartão/iFood. O preço de venda sugerido aparece sozinho.',
      },
      {
        q: 'Por que o preço de venda não muda mais quando edito os percentuais?',
        a: 'Assim que você edita o preço de venda manualmente (por exemplo, para arredondar), ele para de seguir a sugestão automática — assim um ajuste manual seu nunca é perdido só porque outro campo mudou.',
      },
    ],
  },
  {
    title: 'Financeiro',
    entries: [
      {
        q: 'O que é o Rateio do mês?',
        a: 'Divide automaticamente as entradas já recebidas no mês entre pró-labore, empresa e reserva emergencial, nos percentuais que você define.',
      },
      {
        q: 'Preciso lançar as vendas de pedidos manualmente no financeiro?',
        a: 'Não — quando um pedido é marcado como pago, a entrada correspondente já aparece sozinha no Financeiro.',
      },
    ],
  },
  {
    title: 'Cardápio',
    entries: [
      {
        q: 'Como meus clientes acessam o cardápio online?',
        a: 'Cada confeitaria tem um link próprio (confeitto.com.br/sua-confeitaria) — copie em Cardápio digital e compartilhe direto do WhatsApp ou Instagram.',
      },
      {
        q: 'Publiquei um produto mas ele não aparece no cardápio',
        a: 'Confira se o produto está marcado como Disponível — um produto indisponível fica automaticamente oculto do cardápio público, mesmo já publicado.',
      },
    ],
  },
  {
    title: 'Produtos',
    entries: [
      {
        q: 'Qual a diferença entre Produtos e Cardápio?',
        a: 'Produtos é o catálogo interno, com fotos. Cardápio é o que os clientes realmente veem. Publicar um produto manda uma cópia dele para o cardápio — editar o produto depois não atualiza o que já foi publicado.',
      },
    ],
  },
  {
    title: 'Fidelidade e equipe',
    entries: [
      {
        q: 'Como funciona o programa de fidelidade?',
        a: 'Cada cliente acumula carimbos conforme os pedidos que faz. Você define quantos carimbos valem o prêmio em Fidelidade.',
      },
      {
        q: 'Como convido alguém para a minha equipe?',
        a: 'Em Equipe, gere um convite escolhendo o papel (Administradora ou Produção) e envie o código — a pessoa usa esse código na tela de cadastro.',
      },
      {
        q: 'Qual a diferença entre os papéis Administradora e Produção?',
        a: 'Produção só enxerga Pedidos, Estoque e Cardápio. Financeiro, Precificação, Produtos, Clientes e Fidelidade ficam visíveis só para Administradoras.',
      },
    ],
  },
];

function HelpCenter() {
  return (
    <div className="space-y-7">
      <PageHeading
        title="Ajuda"
        subtitle="Respostas rápidas para as dúvidas mais comuns de quem está começando com o Confeitto."
      />
      <div className="grid gap-5 lg:grid-cols-2">
        {FAQ_SECTIONS.map((section) => (
          <Panel key={section.title} className="p-5">
            <h2 className="font-heading font-bold">{section.title}</h2>
            <Accordion className="mt-2">
              {section.entries.map((entry) => (
                <AccordionItem key={entry.q} value={entry.q}>
                  <AccordionTrigger>{entry.q}</AccordionTrigger>
                  <AccordionContent>
                    <p className="text-muted-foreground">{entry.a}</p>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </Panel>
        ))}
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
    <article className="rounded-2xl border bg-card p-5 shadow-[0_1px_2px_rgb(0_0_0/0.04),0_4px_16px_-8px_rgb(0_0_0/0.08)] transition duration-200 hover:-translate-y-0.5 hover:shadow-md">
      <div className="mb-4 flex items-center justify-between">
        <span className="grid size-9 place-items-center rounded-xl bg-primary/10 text-primary">
          <Icon className="size-[18px]" />
        </span>
        {positive && (
          <span className="text-xs font-semibold text-[#2f8c5a]">↗ em dia</span>
        )}
      </div>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 font-heading text-2xl font-bold tracking-tight [overflow-wrap:anywhere]">
        {value}
      </p>
      <p className="mt-2 text-xs text-muted-foreground">{detail}</p>
    </article>
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
  onReceive,
  ajustes,
  confeitaria = 'Confeitaria',
}: {
  orders: Order[];
  compact?: boolean;
  onStatus?: (id: string, status: string) => void;
  onDelete?: (id: string) => void;
  onReceive?: (id: string, amount: number, method: Order['paymentMethod']) => Promise<void>;
  ajustes?: Ajustes;
  confeitaria?: string;
}) {
  const delivery = (order: Order) => (
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
  );
  const payment = (order: Order) =>
    compact || !onReceive ? (
      <PaymentBadge order={order} />
    ) : order.paymentStatus === 'Pago' ? (
      <div className="space-y-0.5">
        <PaymentBadge order={order} />
        {order.paymentMethod && (
          <p className="text-[11px] text-muted-foreground">{order.paymentMethod}</p>
        )}
      </div>
    ) : (
      <div className="space-y-1">
        <PaymentBadge order={order} />
        {paidSoFar(order) > 0 && (
          <p className="text-[11px] text-muted-foreground">
            recebido {money(paidSoFar(order))} · falta {money(balanceDue(order))}
          </p>
        )}
        <ReceberPagamento
          order={order}
          ajustes={ajustes ?? {}}
          confeitaria={confeitaria}
          onReceive={(amount, method) => onReceive(order.id, amount, method)}
        />
      </div>
    );
  const status = (order: Order) =>
    compact || !onStatus ? (
      <StatusBadge status={order.status} />
    ) : (
      <select
        value={order.status}
        aria-label={`Status do pedido ${order.id}`}
        onChange={(e) => onStatus(order.id, e.target.value)}
        className="h-8 rounded-lg border bg-background px-2 text-xs font-semibold outline-none focus:border-primary"
      >
        {ORDER_STATUSES.map((st) => (
          <option key={st} value={st}>
            {st}
          </option>
        ))}
      </select>
    );
  const actions = (order: Order) => (
    <div className="flex items-center gap-1.5">
      <AcoesPedido order={order} confeitaria={confeitaria} />
      <Button
        onClick={() => onDelete?.(order.id)}
        size="icon-sm"
        variant="destructive"
        aria-label="Excluir pedido"
      >
        <Trash2 />
      </Button>
    </div>
  );
  return (
    <div>
      {/* Celular: um cartão por pedido (a tabela não cabe na tela). */}
      <ul className="divide-y md:hidden">
        {orders.map((order) => (
          <li key={order.id} className="space-y-3 px-4 py-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold">
                  {order.id} · <span className="[overflow-wrap:anywhere]">{order.customer}</span>
                </p>
                <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">{order.item}</p>
                {order.notes && (
                  <p className="mt-0.5 text-xs italic text-muted-foreground [overflow-wrap:anywhere]">
                    {order.notes}
                  </p>
                )}
              </div>
              <p className="font-nums shrink-0 font-semibold">{money(order.value)}</p>
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
              {delivery(order)}
              {status(order)}
            </div>
            <div className="flex flex-wrap items-start justify-between gap-3">
              {payment(order)}
              {!compact && actions(order)}
            </div>
          </li>
        ))}
      </ul>
      <div className="hidden overflow-x-auto md:block">
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
                    <p className="mt-0.5 text-xs italic text-muted-foreground">{order.notes}</p>
                  )}
                </td>
                <td className="px-3 py-3.5">{delivery(order)}</td>
                <td className="px-3 py-3.5 font-medium">{money(order.value)}</td>
                <td className="px-3 py-3.5">{payment(order)}</td>
                <td className="px-3 py-3.5">{status(order)}</td>
                {!compact && <td className="px-3 py-3.5">{actions(order)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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
      {paidSoFar(order) > 0 ? 'Parcial' : 'Pendente'}
    </span>
  );
}

const NEW_CUSTOMER = '__new__';

function Orders({
  orders,
  setOrders,
  menuItems,
  customers,
  setFinance,
  setLoyalty,
  ajustes,
  confeitaria,
}: {
  orders: Order[];
  setOrders: (v: Order[] | ((o: Order[]) => Order[])) => void;
  menuItems: MenuItem[];
  customers: LoyaltyItem[];
  setFinance: (v: FinanceItem[] | ((o: FinanceItem[]) => FinanceItem[])) => void;
  setLoyalty: (v: LoyaltyItem[] | ((o: LoyaltyItem[]) => LoyaltyItem[])) => void;
  ajustes: Ajustes;
  confeitaria: string;
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
  const [deposit, setDeposit] = useState('');
  const [quantities, setQuantities] = useState<Record<number, number>>({});
  const [submitting, setSubmitting] = useState(false);
  const [monthView, setMonthView] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

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

  const available = menuItems.filter((item) => item.available);

  const cartItems = available
    .filter((item) => quantities[item.id] > 0)
    .map((item) => ({ ...item, quantity: quantities[item.id] }));
  const total = cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
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
    cartItems.length > 0;

  const changeQuantity = (id: number, delta: number) =>
    setQuantities((old) => ({
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
    const description = cartItems
      .map((item) => `${item.quantity}× ${menuLabel(item)}`)
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
          name: menuLabel(item),
          quantity: item.quantity,
        })),
        item: description,
        notes: notes.trim() || undefined,
        orderDate,
        deliveryDate,
        deliveryTime,
        date: formattedDate,
        value: total,
        status: 'Novo',
        paymentMethod,
        paymentStatus: alreadyPaid ? 'Pago' : 'Pendente',
        ...(!alreadyPaid && Number(deposit.replace(',', '.')) > 0
          ? { deposit: Number(deposit.replace(',', '.')) }
          : {}),
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
    setDeposit('');
    setQuantities({});
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
  const receive = async (id: string, amount: number, method: Order['paymentMethod']) => {
    const response = await fetch(`/api/orders/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ receive: amount, paymentMethod: method }),
    });
    if (!response.ok) return;
    const data = (await response.json()) as {
      order: Order;
      financeItem?: FinanceItem;
    };
    setOrders((old) => old.map((o) => (o.id === id ? data.order : o)));
    if (data.financeItem) setFinance((old) => [data.financeItem!, ...old]);
  };
  const dayCount = deliveryDate ? orders.filter((o) => o.deliveryDate === deliveryDate).length : 0;
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
          <div className="min-w-0 space-y-3">
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
                    type="tel"
                    inputMode="numeric"
                    maxLength={16}
                    onChange={(e) => setNewPhone(formatPhone(e.target.value))}
                    aria-invalid={Boolean(newPhone) && newPhone.replace(/\D/g, '').length >= 10 && !normalizePhone(newPhone)}
                    className={`${inputClass} aria-[invalid=true]:border-destructive`}
                    placeholder="(11) 91234-5678"
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
            {dayCount > 0 && (
              <p
                className={`-mt-1 text-xs ${dayIsFull(dayCount, ajustes.dailyLimit) ? 'font-semibold text-destructive' : 'text-muted-foreground'}`}
              >
                Esse dia já tem {dayCount} {dayCount === 1 ? 'pedido' : 'pedidos'}
                {ajustes.dailyLimit ? ` (limite ${ajustes.dailyLimit})` : ''}.
              </p>
            )}
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
            {!alreadyPaid && (
              <Field label="Sinal recebido agora (R$, opcional)">
                <input
                  inputMode="decimal"
                  value={deposit}
                  onChange={(e) => setDeposit(e.target.value)}
                  className={inputClass}
                  placeholder="0,00"
                />
              </Field>
            )}
          </div>
          <div className="min-w-0 space-y-4">
            <div>
              <p className="mb-2 text-xs font-semibold text-muted-foreground">
                Produtos do cardápio
              </p>
              {available.length === 0 ? (
                <p className="rounded-xl bg-muted/40 p-3 text-xs text-muted-foreground">
                  Nenhum produto publicado no cardápio.
                </p>
              ) : (
                <div className="max-h-60 space-y-1.5 overflow-y-auto rounded-xl border p-2">
                  {available.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-muted/40"
                    >
                      <span className="min-w-0 flex-1 text-sm [overflow-wrap:anywhere]">
                        {menuLabel(item)}{' '}
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
          onReceive={receive}
          ajustes={ajustes}
          confeitaria={confeitaria}
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
  onAddToList,
  isInList,
  onLoss,
}: {
  category: 'Ingrediente' | 'Embalagem';
  title: string;
  subtitle: string;
  stock: StockItem[];
  setStock: (v: StockItem[] | ((o: StockItem[]) => StockItem[])) => void;
  onAddToList: (item: StockItem) => void;
  isInList: (item: StockItem) => boolean;
  onLoss: (item: StockItem, qty: number, reason: string) => void;
}) {
  const items = stock.filter(
    (item) => (item.category ?? 'Ingrediente') === category,
  );
  const [weightUnit, setWeightUnit] = useState<'g' | 'kg'>('g');
  const [open, setOpen] = useState(false);

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
    const supplier = fieldValue(d, 'supplier').trim();
    const expiry = fieldValue(d, 'expiry').trim();
    if (!name || !Number.isFinite(qty) || qty <= 0) return;
    const weightValue = Number(fieldValue(d, 'weightValue'));
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
                // A reposição mais recente é o fornecedor que vale — troca
                // o registrado antes, em vez de ignorar a nova compra.
                ...(supplier ? { supplier } : {}),
                ...(expiry ? { expiry } : {}),
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
          min: 0,
          cost: qty > 0 ? +(purchaseValue / qty).toFixed(4) : 0,
          ...(supplier ? { supplier } : {}),
          ...(expiry ? { expiry } : {}),
          ...(weightValue > 0
            ? { weight: { value: weightValue, unit: weightUnit } }
            : {}),
        },
      ];
    });
    e.currentTarget.reset();
    setWeightUnit('g');
    setOpen(false);
  };

  return (
    <>
      <PageHeading
        title={title}
        subtitle={subtitle}
        action={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger render={<Button className="h-10 rounded-xl" />}>
              <Plus /> Novo {category === 'Ingrediente' ? 'ingrediente' : 'embalagem'}
            </DialogTrigger>
            <DialogContent className="ficha-theme">
              <DialogHeader>
                <DialogTitle>
                  Novo {category === 'Ingrediente' ? 'ingrediente' : 'embalagem'}
                </DialogTitle>
              </DialogHeader>
              <form onSubmit={add} className="grid gap-3">
                <Field label="Nome">
                  <input
                    required
                    name="name"
                    className={inputClass}
                    placeholder={
                      category === 'Ingrediente' ? 'Ex.: Leite condensado' : 'Ex.: Saquinho plástico'
                    }
                  />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label={category === 'Ingrediente' ? 'Quantidade' : 'Quantidade comprada'}>
                    <input
                      required
                      name="qty"
                      type="number"
                      step="0.01"
                      min="0.01"
                      defaultValue="1"
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Peso (opcional)">
                    <div className="flex gap-1">
                      <input
                        name="weightValue"
                        type="number"
                        step="0.01"
                        min="0"
                        className={`${inputClass} w-full`}
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
                </div>
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
                <Field label="Local de compra (opcional)">
                  <input
                    name="supplier"
                    className={inputClass}
                    placeholder="Ex.: Atacadão, fornecedor X"
                  />
                </Field>
                <Field label="Validade (opcional)">
                  <input name="expiry" type="date" className={inputClass} />
                </Field>
                <Button type="submit" className="w-full justify-self-end rounded-xl sm:w-auto">
                  Salvar
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        }
      />
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
                <div className="min-w-0">
                  <p className="font-semibold [overflow-wrap:anywhere]">{item.name}</p>
                  <p className="font-nums text-xs text-muted-foreground">
                    {money(item.cost)} / unidade
                    {item.weight
                      ? ` (${item.weight.value}${item.weight.unit})`
                      : ''}
                    {gCost != null ? ` • ${money(gCost)}/g` : ''}
                  </p>
                  {item.supplier && (
                    <p className="text-xs text-muted-foreground">
                      Comprado em: {item.supplier}
                    </p>
                  )}
                  {item.expiry && <ExpiryNote expiry={item.expiry} />}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Badge variant={low ? 'destructive' : 'secondary'}>
                    {low ? 'Repor' : 'Normal'}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={
                      isInList(item)
                        ? `${item.name} já está na lista de compras`
                        : `Adicionar ${item.name} à lista de compras`
                    }
                    title={isInList(item) ? 'Já está na lista de compras' : 'Adicionar à lista de compras'}
                    disabled={isInList(item)}
                    onClick={() => onAddToList(item)}
                  >
                    {isInList(item) ? <Check /> : <ShoppingCart />}
                  </Button>
                  <RegistrarPerda item={item} onConfirm={(qty, reason) => onLoss(item, qty, reason)} />
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
              <div className="my-5 flex items-end justify-between gap-3">
                <p className="font-nums text-3xl font-bold [overflow-wrap:anywhere]">
                  {item.qty}{' '}
                  <span className="font-sans text-base font-medium text-muted-foreground">
                    {item.unit}
                  </span>
                </p>
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  mín.
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={item.min}
                    aria-label={`Estoque mínimo de ${item.name}`}
                    title="Abaixo disso, o item aparece como sugestão na lista de compras"
                    onChange={(e) => {
                      const min = Math.max(0, Number(e.target.value) || 0);
                      setStock((old) => old.map((x) => (x.id === item.id ? { ...x, min } : x)));
                    }}
                    className="font-nums h-8 w-16 rounded-lg border bg-background px-2 text-sm text-foreground outline-none focus:border-primary"
                  />
                </label>
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

function ExpiryNote({ expiry }: { expiry: string }) {
  const status = expiryStatus(expiry, new Date());
  const days = daysUntil(expiry, new Date());
  const text =
    status === 'vencido'
      ? `Vencido há ${Math.abs(days ?? 0)} ${Math.abs(days ?? 0) === 1 ? 'dia' : 'dias'}`
      : status === 'vence-logo'
        ? days === 0
          ? 'Vence hoje'
          : `Vence em ${days} ${days === 1 ? 'dia' : 'dias'}`
        : `Validade: ${formatFinanceDate(expiry)}`;
  return (
    <p
      className={`text-xs ${status === 'vencido' ? 'font-semibold text-destructive' : status === 'vence-logo' ? 'font-semibold text-orange-700' : 'text-muted-foreground'}`}
    >
      {text}
    </p>
  );
}

type SetShopping = (v: ShoppingItem[] | ((o: ShoppingItem[]) => ShoppingItem[])) => void;

const sameName = (a: string, b: string) =>
  a.trim().toLocaleLowerCase('pt-BR') === b.trim().toLocaleLowerCase('pt-BR');

// Quanto falta para chegar no mínimo (ou 1, para o que acabou sem mínimo).
function suggestedQty(item: StockItem): string {
  const needed = item.min > item.qty ? Math.ceil(item.min - item.qty) : 1;
  return `${needed} ${item.unit}`;
}

function ShoppingList({
  stock,
  shopping,
  setShopping,
  orders,
  menuItems,
  products,
  recipes,
}: {
  stock: StockItem[];
  shopping: ShoppingItem[];
  setShopping: SetShopping;
  orders: Order[];
  menuItems: MenuItem[];
  products: Product[];
  recipes: ProductRecipe[];
}) {
  const [copied, setCopied] = useState(false);
  const pending = shopping.filter((i) => !i.done);
  const bought = shopping.filter((i) => i.done);
  const stockOf = (i: ShoppingItem) =>
    stock.find((s) => (i.stockId != null ? s.id === i.stockId : sameName(s.name, i.name)));
  const listed = (item: StockItem) =>
    pending.some((i) => i.stockId === item.id || sameName(i.name, item.name));

  // Sugestões: abaixo do mínimo ou zerado, e ainda não na lista.
  const suggestions = stock.filter(
    (item) => (item.qty < item.min || item.qty <= 0) && !listed(item),
  );

  // Pelo que os pedidos abertos dos próximos 7 dias vão consumir (fichas
  // técnicas), além do mínimo de cada item.
  const weekSuggestions = (() => {
    const from = new Date();
    const to = new Date(from.getFullYear(), from.getMonth(), from.getDate() + 7);
    const iso = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return suggestPurchases(orders, menuItems, products, recipes, stock, iso(from), iso(to)).filter(
      (x) => !listed(x.stock),
    );
  })();

  const addItem = (name: string, qty: string, stockId?: number) => {
    const clean = name.trim();
    if (!clean) return;
    setShopping((old) => {
      const existing = old.find((i) => !i.done && sameName(i.name, clean));
      if (existing) {
        return old.map((i) => (i.id === existing.id && qty ? { ...i, qty } : i));
      }
      const linkedId = stockId ?? stock.find((s) => sameName(s.name, clean))?.id;
      return [
        ...old,
        {
          id: Date.now() + Math.floor(Math.random() * 1000),
          name: clean,
          qty: qty.trim(),
          ...(linkedId != null ? { stockId: linkedId } : {}),
          done: false,
          createdAt: new Date().toISOString(),
        },
      ];
    });
  };

  const submit = (e: FormSubmit) => {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    addItem(fieldValue(d, 'name'), fieldValue(d, 'qty'));
    e.currentTarget.reset();
    (e.currentTarget.elements.namedItem('name') as HTMLInputElement | null)?.focus();
  };

  const addSuggestions = () => {
    const now = Date.now();
    setShopping((old) => [
      ...old,
      ...suggestions.map((item, index) => ({
        id: now + index,
        name: item.name,
        qty: suggestedQty(item),
        stockId: item.id,
        done: false,
        createdAt: new Date().toISOString(),
      })),
    ]);
  };

  const listText = () => {
    const lines = pending.map((i) => {
      const where = stockOf(i)?.supplier;
      return `• ${i.name}${i.qty ? ` — ${i.qty}` : ''}${where ? ` (${where})` : ''}`;
    });
    return `🛒 Lista de compras\n${lines.join('\n')}`;
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(listText());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Sem permissão de área de transferência: nada a fazer.
    }
  };

  return (
    <>
      <PageHeading
        title="Lista de compras"
        subtitle="O que precisa comprar — a mesma lista para todos da confeitaria."
        action={
          pending.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" className="h-10 rounded-xl" onClick={() => void copy()}>
                {copied ? <Check /> : <Copy />} {copied ? 'Lista copiada' : 'Copiar lista'}
              </Button>
              <a
                href={`https://wa.me/?text=${encodeURIComponent(listText())}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
              >
                <MessageCircle className="size-4" aria-hidden="true" /> Enviar no WhatsApp
              </a>
            </div>
          ) : undefined
        }
      />

      <Panel className="mb-8 p-5">
        <form onSubmit={submit} className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto] sm:items-end">
          <Field label="Item">
            <input
              required
              name="name"
              list="estoque-nomes"
              maxLength={80}
              autoComplete="off"
              className={inputClass}
              placeholder="Ex.: Leite condensado"
            />
          </Field>
          <Field label="Quantidade (opcional)">
            <input
              name="qty"
              maxLength={40}
              className={inputClass}
              placeholder="Ex.: 3 latas"
            />
          </Field>
          <Button type="submit" className="h-10 rounded-xl">
            <Plus /> Adicionar
          </Button>
          <datalist id="estoque-nomes">
            {stock.map((item) => (
              <option key={item.id} value={item.name} />
            ))}
          </datalist>
        </form>

        {suggestions.length > 0 && (
          <div className="mt-5 rounded-xl bg-muted/60 p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold">
                Acabando no estoque{' '}
                <span className="font-normal text-muted-foreground">
                  ({suggestions.length})
                </span>
              </p>
              {suggestions.length > 1 && (
                <Button variant="outline" size="sm" onClick={addSuggestions}>
                  <Plus /> Adicionar todos
                </Button>
              )}
            </div>
            <ul className="flex flex-wrap gap-2">
              {suggestions.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => addItem(item.name, suggestedQty(item), item.id)}
                    className="inline-flex max-w-full items-center gap-1.5 rounded-full border bg-background px-3 py-1.5 text-left text-xs font-medium transition hover:border-primary"
                    aria-label={`Adicionar ${item.name} à lista (tem ${item.qty}, mínimo ${item.min})`}
                  >
                    <Plus className="size-3.5 shrink-0" aria-hidden="true" />
                    <span className="[overflow-wrap:anywhere]">{item.name}</span>
                    <span className="shrink-0 text-muted-foreground">
                      tem {item.qty}
                      {item.min > 0 ? ` / mín. ${item.min}` : ''}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {weekSuggestions.length > 0 && (
          <div className="mt-5 rounded-xl bg-muted/60 p-4">
            <p className="mb-1 text-sm font-semibold">
              Faltam para os pedidos da semana{' '}
              <span className="font-normal text-muted-foreground">({weekSuggestions.length})</span>
            </p>
            <p className="mb-3 text-xs text-muted-foreground">
              Conta o que as fichas técnicas dos pedidos abertos (próximos 7 dias) vão consumir, mais o mínimo.
            </p>
            <ul className="flex flex-wrap gap-2">
              {weekSuggestions.map(({ stock: item, need, missing }) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => addItem(item.name, `${Math.ceil(missing)} ${item.unit}`, item.id)}
                    className="inline-flex max-w-full items-center gap-1.5 rounded-full border bg-background px-3 py-1.5 text-left text-xs font-medium transition hover:border-primary"
                    aria-label={`Adicionar ${item.name} à lista (faltam ${missing}, pedidos usam ${need})`}
                  >
                    <Plus className="size-3.5 shrink-0" aria-hidden="true" />
                    <span className="[overflow-wrap:anywhere]">{item.name}</span>
                    <span className="shrink-0 text-muted-foreground">
                      faltam {missing} (usa {need})
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {shopping.length === 0 ? (
          <p className="mt-5 text-center text-sm text-muted-foreground">
            A lista está vazia. Adicione itens acima ou pelo carrinho em cada item do estoque.
          </p>
        ) : (
          <ul className="mt-5 divide-y" aria-label="Itens da lista de compras">
            {[...pending, ...bought].map((item) => {
              const where = stockOf(item)?.supplier;
              return (
                <li key={item.id} className="flex items-center gap-3 py-2.5">
                  <input
                    type="checkbox"
                    checked={item.done}
                    onChange={() =>
                      setShopping((old) =>
                        old.map((i) => (i.id === item.id ? { ...i, done: !i.done } : i)),
                      )
                    }
                    aria-label={
                      item.done ? `Desmarcar ${item.name}` : `Marcar ${item.name} como comprado`
                    }
                    className="size-4 shrink-0 accent-[var(--primary)]"
                  />
                  <div className="min-w-0 flex-1">
                    <p
                      className={`text-sm font-medium [overflow-wrap:anywhere] ${item.done ? 'text-muted-foreground line-through' : ''}`}
                    >
                      {item.name}
                      {item.qty && (
                        <span className="font-normal text-muted-foreground"> — {item.qty}</span>
                      )}
                    </p>
                    {where && !item.done && (
                      <p className="text-xs text-muted-foreground">Comprado em: {where}</p>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Tirar ${item.name} da lista`}
                    onClick={() => setShopping((old) => old.filter((i) => i.id !== item.id))}
                  >
                    <Trash2 />
                  </Button>
                </li>
              );
            })}
          </ul>
        )}

        {bought.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t pt-3">
            <p className="text-xs text-muted-foreground">
              {bought.length} {bought.length === 1 ? 'item comprado' : 'itens comprados'}.
              Lembre de dar entrada no estoque.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShopping((old) => old.filter((i) => !i.done))}
            >
              Limpar comprados
            </Button>
          </div>
        )}
      </Panel>
    </>
  );
}

function Stock({
  stock,
  setStock,
  shopping,
  setShopping,
  orders,
  menuItems,
  products,
  recipes,
  setPerdas,
}: {
  stock: StockItem[];
  setStock: (v: StockItem[] | ((o: StockItem[]) => StockItem[])) => void;
  shopping: ShoppingItem[];
  setShopping: SetShopping;
  orders: Order[];
  menuItems: MenuItem[];
  products: Product[];
  recipes: ProductRecipe[];
  setPerdas: (v: Perda[] | ((o: Perda[]) => Perda[])) => void;
}) {
  const onLoss = (item: StockItem, qty: number, reason: string) => {
    setStock((old) =>
      old.map((x) => (x.id === item.id ? { ...x, qty: Math.max(0, +(x.qty - qty).toFixed(3)) } : x)),
    );
    setPerdas((old) => [
      {
        id: Date.now(),
        date: new Date().toISOString().slice(0, 10),
        stockId: item.id,
        name: item.name,
        qty,
        unit: item.unit,
        cost: +(qty * item.cost).toFixed(2),
        reason,
      },
      ...old,
    ]);
  };
  const isInList = (item: StockItem) =>
    shopping.some((i) => !i.done && (i.stockId === item.id || sameName(i.name, item.name)));
  const onAddToList = (item: StockItem) => {
    if (isInList(item)) return;
    setShopping((old) => [
      ...old,
      {
        id: Date.now(),
        name: item.name,
        qty: suggestedQty(item),
        stockId: item.id,
        done: false,
        createdAt: new Date().toISOString(),
      },
    ]);
  };
  return (
    <div className="ficha-theme">
      <ShoppingList
        stock={stock}
        shopping={shopping}
        setShopping={setShopping}
        orders={orders}
        menuItems={menuItems}
        products={products}
        recipes={recipes}
      />
      <StockSection
        category="Ingrediente"
        title="Ingredientes"
        subtitle="Cadastre insumos uma vez e reponha pelo nome — sem duplicar linhas."
        stock={stock}
        setStock={setStock}
        onAddToList={onAddToList}
        isInList={isInList}
        onLoss={onLoss}
      />
      <StockSection
        category="Embalagem"
        title="Embalagens"
        subtitle="Caixas, sacolas e etiquetas, separadas dos ingredientes."
        stock={stock}
        setStock={setStock}
        onAddToList={onAddToList}
        isInList={isInList}
        onLoss={onLoss}
      />
    </div>
  );
}






function Pricing({
  stock,
  setStock,
  menuItems,
  setMenuItems,
  products,
  setProducts,
  recipes,
  setRecipes,
}: {
  stock: StockItem[];
  setStock: (v: StockItem[] | ((o: StockItem[]) => StockItem[])) => void;
  menuItems: MenuItem[];
  setMenuItems: (v: MenuItem[] | ((o: MenuItem[]) => MenuItem[])) => void;
  products: Product[];
  setProducts: (v: Product[] | ((o: Product[]) => Product[])) => void;
  recipes: ProductRecipe[];
  setRecipes: (v: ProductRecipe[] | ((o: ProductRecipe[]) => ProductRecipe[])) => void;
}) {
  const [tab, setTab] = useState<'ficha' | 'lucro'>('ficha');
  const [selectedKey, setSelectedKey] = useState<number | null>(null);

  const saveRecipe = (recipe: ProductRecipe) => {
    const key = recipeKey(recipe);
    setRecipes((old) =>
      old.some((r) => recipeKey(r) === key)
        ? old.map((r) => (recipeKey(r) === key ? recipe : r))
        : [...old, recipe],
    );
    setSelectedKey(key);
  };
  const removeRecipe = (key: number) => {
    setRecipes((old) => old.filter((r) => recipeKey(r) !== key));
    setSelectedKey(null);
  };
  const createRecipe = (input: {
    name: string;
    productId?: number;
    productKind?: 'menu' | 'catalog';
  }) => {
    const id = Date.now();
    const fresh: ProductRecipe = {
      id,
      productName: input.name,
      ...(input.productId != null
        ? { productId: input.productId, productKind: input.productKind }
        : {}),
      yieldCount: 1,
      recipeItems: [],
      overheadPercent: 0,
      profit: 100,
      feePercent: 7.99,
      proLaborePercent: 80,
      companyPercent: 20,
      soldByWeight: false,
    };
    setRecipes((old) => [...old, fresh]);
    setSelectedKey(id);
  };

  const selectedRecipe = recipes.find((r) => recipeKey(r) === selectedKey);

  return (
    <div className="ficha-theme">
      <PageHeading
        title="Ficha técnica e precificação"
        subtitle="Suas receitas, com custo real e margem preservada — vincular a um produto é opcional."
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
        selectedRecipe ? (
          <RecipeEditor
            key={recipeKey(selectedRecipe)}
            recipe={selectedRecipe}
            stock={stock}
            setStock={setStock}
            menuItems={menuItems}
            setMenuItems={setMenuItems}
            products={products}
            setProducts={setProducts}
            onSave={saveRecipe}
            onRemove={() => removeRecipe(recipeKey(selectedRecipe))}
            onBack={() => setSelectedKey(null)}
          />
        ) : (
          <RecipeLibrary
            recipes={recipes}
            stock={stock}
            menuItems={menuItems}
            products={products}
            onSelect={setSelectedKey}
            onCreate={createRecipe}
          />
        )
      ) : (
        <ProfitByProduct menuItems={menuItems} recipes={recipes} stock={stock} />
      )}
    </div>
  );
}

// Tela inicial de Precificação: a lista de receitas já criadas, mais o
// botão que abre "Nova receita" — vincular a um produto do cardápio ou do
// catálogo é uma escolha dentro desse mesmo formulário, nunca um passo
// obrigatório antes de conseguir precificar algo.
function RecipeLibrary({
  recipes,
  stock,
  menuItems,
  products,
  onSelect,
  onCreate,
}: {
  recipes: ProductRecipe[];
  stock: StockItem[];
  menuItems: MenuItem[];
  products: Product[];
  onSelect: (key: number) => void;
  onCreate: (input: {
    name: string;
    productId?: number;
    productKind?: 'menu' | 'catalog';
  }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [linkMode, setLinkMode] = useState<'none' | 'menu' | 'catalog'>('none');
  const [linkedId, setLinkedId] = useState<number | ''>('');

  const create = (e: FormSubmit) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    onCreate({
      name: trimmed,
      ...(linkMode !== 'none' && linkedId !== ''
        ? { productId: Number(linkedId), productKind: linkMode }
        : {}),
    });
    setName('');
    setLinkMode('none');
    setLinkedId('');
    setOpen(false);
  };

  return (
    <>
      <Panel className="mb-5 flex flex-wrap items-center justify-between gap-3 p-5">
        <div>
          <h2 className="font-heading font-bold">Suas receitas</h2>
          <p className="text-xs text-muted-foreground">
            Crie e precifique quantas quiser — vincular a um produto é opcional.
          </p>
        </div>
        <Dialog
          open={open}
          onOpenChange={(v) => {
            setOpen(v);
            if (!v) {
              setName('');
              setLinkMode('none');
              setLinkedId('');
            }
          }}
        >
          <DialogTrigger render={<Button className="rounded-xl" />}>
            <Plus /> Nova receita
          </DialogTrigger>
          <DialogContent className="ficha-theme">
            <DialogHeader>
              <DialogTitle>Nova receita</DialogTitle>
            </DialogHeader>
            <form onSubmit={create} className="grid gap-3">
              <Field label="Nome da receita">
                <input
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={inputClass}
                  placeholder="Ex.: Bolo de chocolate trufado"
                />
              </Field>
              <Field label="Vincular a um produto (opcional)">
                <select
                  value={linkMode}
                  onChange={(e) => {
                    setLinkMode(e.target.value as 'none' | 'menu' | 'catalog');
                    setLinkedId('');
                  }}
                  className={inputClass}
                >
                  <option value="none">Nenhum — receita avulsa</option>
                  <option value="menu">Produto do cardápio</option>
                  <option value="catalog">Produto cadastrado</option>
                </select>
              </Field>
              {linkMode !== 'none' && (
                <Field
                  label={
                    linkMode === 'menu' ? 'Produto do cardápio' : 'Produto cadastrado'
                  }
                >
                  <select
                    required
                    value={linkedId}
                    onChange={(e) => {
                      const id = Number(e.target.value);
                      setLinkedId(id);
                      if (name.trim()) return;
                      if (linkMode === 'menu') {
                        const found = menuItems.find((m) => m.id === id);
                        if (found) setName(found.name);
                      } else {
                        const found = products.find((p) => p.id === id);
                        if (found) setName(`${found.name} - ${found.flavor}`);
                      }
                    }}
                    className={inputClass}
                  >
                    <option value="" disabled>
                      Selecione...
                    </option>
                    {(linkMode === 'menu' ? menuItems : products).map((item) => (
                      <option key={item.id} value={item.id}>
                        {'flavor' in item ? `${item.name} - ${item.flavor}` : item.name}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
              <Button type="submit" className="w-full justify-self-end rounded-xl sm:w-auto">
                Criar receita
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </Panel>
      {recipes.length === 0 ? (
        <Panel className="p-10 text-center text-sm text-muted-foreground">
          Nenhuma receita criada ainda.
        </Panel>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {recipes.map((recipe) => {
            const { baseCost } = computeRecipeCost(recipe, stock);
            const sellPrice = recipe.sellPrice ?? baseCost * (1 + recipe.profit / 100);
            return (
              <button
                key={recipeKey(recipe)}
                type="button"
                onClick={() => onSelect(recipeKey(recipe))}
                className="rounded-2xl border bg-card p-5 text-left shadow-sm transition hover:border-primary"
              >
                <p className="font-semibold">
                  {recipe.productName || 'Receita sem nome'}
                </p>
                <Badge variant="outline" className="mt-1">
                  {recipe.productId
                    ? recipe.productKind === 'catalog'
                      ? 'Produto cadastrado'
                      : 'No cardápio'
                    : 'Receita avulsa'}
                </Badge>
                <div className="mt-4 flex items-end justify-between">
                  <div>
                    <p className="text-[11px] uppercase text-muted-foreground">Custo</p>
                    <p className="font-nums font-semibold">{money(baseCost)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[11px] uppercase text-muted-foreground">
                      Venda sugerida
                    </p>
                    <p className="font-nums font-bold text-primary">{money(sellPrice)}</p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
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
  recipe,
  stock,
  setStock,
  menuItems,
  setMenuItems,
  products,
  setProducts,
  onSave,
  onRemove,
  onBack,
}: {
  recipe: ProductRecipe;
  stock: StockItem[];
  setStock: (v: StockItem[] | ((o: StockItem[]) => StockItem[])) => void;
  menuItems: MenuItem[];
  setMenuItems: (v: MenuItem[] | ((o: MenuItem[]) => MenuItem[])) => void;
  products: Product[];
  setProducts: (v: Product[] | ((o: Product[]) => Product[])) => void;
  onSave: (recipe: ProductRecipe) => void;
  onRemove: () => void;
  onBack: () => void;
}) {
  const [productName, setProductName] = useState(recipe.productName ?? '');
  const [linkedProductId, setLinkedProductId] = useState(recipe.productId);
  const [linkedProductKind, setLinkedProductKind] = useState(recipe.productKind);
  const [yieldCount, setYieldCount] = useState(recipe.yieldCount ?? 1);
  const [recipeItems, setRecipeItems] = useState<RecipeLine[]>(
    recipe.recipeItems ?? [],
  );
  const [overheadPercent, setOverheadPercent] = useState(
    recipe.overheadPercent ?? 0,
  );
  // Margem inicial em 100%: a confeitaria começa cobrindo o dobro do custo,
  // e ajusta para baixo caso ache melhor — nunca o contrário.
  const [profit, setProfit] = useState(recipe.profit ?? 100);
  const [feePercent, setFeePercent] = useState(recipe.feePercent ?? 7.99);
  const [extraCharge, setExtraCharge] = useState(recipe.extraCharge ?? 0);
  const [proLaborePercent, setProLaborePercent] = useState(
    recipe.proLaborePercent ?? 80,
  );
  const [companyPercent, setCompanyPercent] = useState(
    recipe.companyPercent ?? 20,
  );
  const [soldByWeight, setSoldByWeight] = useState(recipe.soldByWeight ?? false);
  const [weightLossPercent, setWeightLossPercent] = useState(
    recipe.weightLossPercent ?? 0,
  );
  const [lineUnit, setLineUnit] = useState<RecipeLine['unit']>('un');
  const [addItemOpen, setAddItemOpen] = useState(false);
  // "estoque": escolhe um item já cadastrado; "novo": cadastra no estoque
  // ali mesmo (com o estoque vazio, a lista não teria o que escolher).
  const [addMode, setAddMode] = useState<'estoque' | 'novo'>(stock.length ? 'estoque' : 'novo');
  const [newCategory, setNewCategory] = useState<'Ingrediente' | 'Embalagem'>('Ingrediente');
  const [newWeightUnit, setNewWeightUnit] = useState<'g' | 'kg'>('g');
  const [applyOpen, setApplyOpen] = useState(false);
  const [applyKind, setApplyKind] = useState<'menu' | 'catalog'>('menu');
  const [applyId, setApplyId] = useState<number | ''>('');
  const [justSaved, setJustSaved] = useState(false);
  // Preço de venda: começa igual à sugestão (custo + margem) e continua
  // acompanhando ela enquanto o usuário não digitar um valor diferente —
  // a partir daí, para de seguir e vira só o que foi digitado.
  const [priceTouched, setPriceTouched] = useState(Boolean(recipe.sellPrice));
  const [manualPrice, setManualPrice] = useState(recipe.sellPrice ?? 0);

  const {
    enrichedItems,
    directCost,
    overheadTotal,
    baseCost,
    recipeWeightGrams,
  } = computeRecipeCost({ recipeItems, overheadPercent }, stock);
  const suggestedPrice = baseCost * (1 + profit / 100);
  const sellPrice = priceTouched ? manualPrice : suggestedPrice;
  const feesAmount = sellPrice * (feePercent / 100);
  const priceWithFees = sellPrice + feesAmount + extraCharge;
  const availableProfit = sellPrice - baseCost;
  const proLaboreValue = (availableProfit * proLaborePercent) / 100;
  const companyValue = (availableProfit * companyPercent) / 100;
  const profitMargin = sellPrice > 0 ? (availableProfit / sellPrice) * 100 : 0;
  const finalWeightGrams =
    recipeWeightGrams * (1 - Math.min(99, Math.max(0, weightLossPercent)) / 100);
  const perUnitDivisor = soldByWeight
    ? finalWeightGrams > 0
      ? finalWeightGrams / 1000
      : 0
    : Math.max(1, yieldCount);
  const costPerUnit = perUnitDivisor > 0 ? baseCost / perUnitDivisor : 0;
  const sellPricePerUnit = perUnitDivisor > 0 ? sellPrice / perUnitDivisor : 0;
  const priceWithFeesPerUnit = perUnitDivisor > 0 ? priceWithFees / perUnitDivisor : 0;

  const addStockItem = (e: FormSubmit) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const quantity = Number(fieldValue(data, 'quantity'));
    if (!Number.isFinite(quantity) || quantity <= 0) return;
    const unit = lineUnit;
    let stockId = Number(fieldValue(data, 'stockId'));
    if (addMode === 'novo') {
      const name = fieldValue(data, 'newName').trim();
      const boughtQty = Number(fieldValue(data, 'newQty')) || 1;
      const paid = Number(fieldValue(data, 'newPaid')) || 0;
      const weightValue = Number(fieldValue(data, 'newWeight'));
      if (!name) return;
      const existing = stock.find(
        (x) =>
          (x.category ?? 'Ingrediente') === newCategory &&
          x.name.trim().toLowerCase() === name.toLowerCase(),
      );
      if (existing) {
        stockId = existing.id;
      } else {
        stockId = Date.now();
        const created: StockItem = {
          id: stockId,
          name,
          category: newCategory,
          qty: boughtQty,
          unit: 'un',
          min: 0,
          cost: boughtQty > 0 ? +(paid / boughtQty).toFixed(4) : 0,
          ...(weightValue > 0 ? { weight: { value: weightValue, unit: newWeightUnit } } : {}),
        };
        setStock((old) => [...old, created]);
      }
    }
    if (!stockId) return;
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
    setNewWeightUnit('g');
    setAddMode('estoque');
    setJustSaved(false);
    setAddItemOpen(false);
  };
  const buildRecipe = (
    overrides: Partial<Pick<ProductRecipe, 'productId' | 'productKind'>> = {},
  ): ProductRecipe => ({
    id: recipe.id ?? recipe.productId,
    productName: productName.trim() || 'Receita sem nome',
    yieldCount,
    recipeItems,
    overheadPercent,
    profit,
    feePercent,
    sellPrice,
    ...(extraCharge > 0 ? { extraCharge } : {}),
    proLaborePercent,
    companyPercent,
    soldByWeight,
    ...(weightLossPercent > 0 ? { weightLossPercent } : {}),
    ...(linkedProductId != null
      ? { productId: linkedProductId, productKind: linkedProductKind }
      : {}),
    ...overrides,
  });
  const save = () => {
    onSave(buildRecipe());
    setJustSaved(true);
  };
  // "Precificar produto": a única ação que efetivamente muda o preço de um
  // produto real (cardápio ou catálogo) — empurra o preço de venda
  // calculado aqui para lá, e guarda esse vínculo na receita (é o que
  // permite "Lucro por produto" encontrar essa ficha depois).
  const applyToProduct = (e: FormSubmit) => {
    e.preventDefault();
    if (applyId === '') return;
    const id = Number(applyId);
    if (applyKind === 'menu') {
      setMenuItems((old) =>
        old.map((m) => (m.id === id ? { ...m, price: sellPrice } : m)),
      );
    } else {
      setProducts((old) =>
        old.map((p) => (p.id === id ? { ...p, price: sellPrice } : p)),
      );
    }
    setLinkedProductId(id);
    setLinkedProductKind(applyKind);
    onSave(buildRecipe({ productId: id, productKind: applyKind }));
    setJustSaved(true);
    setApplyOpen(false);
  };
  const weightLabel = (grams: number) =>
    grams >= 1000 ? `${(grams / 1000).toFixed(3)} kg` : `${grams.toFixed(0)} g`;
  const linkedProductName =
    linkedProductId != null
      ? linkedProductKind === 'catalog'
        ? (() => {
            const p = products.find((x) => x.id === linkedProductId);
            return p ? `${p.name} - ${p.flavor}` : null;
          })()
        : menuItems.find((m) => m.id === linkedProductId)?.name
      : null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b pb-4">
        <div>
          <button
            type="button"
            onClick={onBack}
            className="mb-2 flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="size-3.5" /> Início
          </button>
          <Field label="Nome da receita">
            <input
              value={productName}
              onChange={(e) => {
                setProductName(e.target.value);
                setJustSaved(false);
              }}
              className="font-heading h-auto border-none bg-transparent p-0 text-2xl font-bold outline-none focus:ring-0 sm:text-3xl"
            />
          </Field>
          <p className="mt-1 text-xs text-muted-foreground">
            {linkedProductName
              ? `Precificando: ${linkedProductName}`
              : 'Receita avulsa — ainda não precifica nenhum produto'}
          </p>
        </div>
        <div className="flex gap-2">
          <Dialog open={applyOpen} onOpenChange={setApplyOpen}>
            <DialogTrigger render={<Button type="button" />}>
              <BadgeDollarSign /> Precificar produto
            </DialogTrigger>
            <DialogContent className="ficha-theme">
              <DialogHeader>
                <DialogTitle>Precificar produto</DialogTitle>
              </DialogHeader>
              {menuItems.length === 0 && products.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Cadastre um produto no Cardápio ou em Produtos antes de aplicar
                  este preço.
                </p>
              ) : (
                <form onSubmit={applyToProduct} className="grid gap-3">
                  <p className="text-xs text-muted-foreground">
                    Aplica o preço de venda calculado nesta receita ({money(sellPrice)})
                    direto no produto escolhido.
                  </p>
                  <Field label="Onde">
                    <select
                      value={applyKind}
                      onChange={(e) => {
                        setApplyKind(e.target.value as 'menu' | 'catalog');
                        setApplyId('');
                      }}
                      className={inputClass}
                    >
                      <option value="menu">Produto do cardápio</option>
                      <option value="catalog">Produto cadastrado</option>
                    </select>
                  </Field>
                  <Field label="Produto">
                    <select
                      required
                      value={applyId}
                      onChange={(e) => setApplyId(Number(e.target.value))}
                      className={inputClass}
                    >
                      <option value="" disabled>
                        Selecione...
                      </option>
                      {(applyKind === 'menu' ? menuItems : products).map((item) => (
                        <option key={item.id} value={item.id}>
                          {'flavor' in item ? `${item.name} - ${item.flavor}` : item.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Button type="submit" className="w-full justify-self-end rounded-xl sm:w-auto">
                    Aplicar preço
                  </Button>
                </form>
              )}
            </DialogContent>
          </Dialog>
          <Button type="button" variant="outline" onClick={() => window.print()}>
            <Printer /> Imprimir ficha técnica
          </Button>
        </div>
      </div>

      <Panel className="overflow-hidden">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div>
            <h2 className="font-heading font-bold">Ingredientes da ficha técnica</h2>
            <p className="text-xs text-muted-foreground">
              Escolha do estoque, a quantidade e a unidade usada nesta receita
            </p>
          </div>
          <Dialog
            open={addItemOpen}
            onOpenChange={(open) => {
              setAddItemOpen(open);
              if (open) setAddMode(stock.length ? 'estoque' : 'novo');
            }}
          >
            <DialogTrigger render={<Button className="rounded-xl" />}>
              <Plus /> Adicionar item
            </DialogTrigger>
            <DialogContent className="ficha-theme sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Adicionar item</DialogTitle>
              </DialogHeader>
              <form onSubmit={addStockItem} className="grid gap-3">
                <div role="radiogroup" aria-label="De onde vem o item" className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1">
                  {(
                    [
                      ['estoque', 'Escolher do estoque'],
                      ['novo', 'Cadastrar novo'],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      role="radio"
                      aria-checked={addMode === value}
                      onClick={() => setAddMode(value)}
                      className={`rounded-lg px-2 py-1.5 text-sm font-semibold transition ${addMode === value ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {addMode === 'estoque' && stock.length === 0 && (
                  <p className="rounded-xl bg-muted p-3 text-sm text-muted-foreground">
                    O estoque ainda está vazio. Use &ldquo;Cadastrar novo&rdquo; para criar o
                    ingrediente ou a embalagem aqui mesmo.
                  </p>
                )}
                {addMode === 'novo' ? (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Tipo">
                        <select
                          value={newCategory}
                          onChange={(e) => setNewCategory(e.target.value as 'Ingrediente' | 'Embalagem')}
                          className={inputClass}
                        >
                          <option value="Ingrediente">Ingrediente</option>
                          <option value="Embalagem">Embalagem</option>
                        </select>
                      </Field>
                      <Field label="Nome">
                        <input
                          required
                          name="newName"
                          maxLength={80}
                          className={inputClass}
                          placeholder={newCategory === 'Ingrediente' ? 'Ex.: Leite condensado' : 'Ex.: Caixa 10x10'}
                        />
                      </Field>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <Field label="Qtd. comprada">
                        <input name="newQty" type="number" min="0.01" step="0.01" defaultValue="1" className={inputClass} />
                      </Field>
                      <Field label="Valor pago (R$)">
                        <input required name="newPaid" type="number" min="0" step="0.01" className={inputClass} />
                      </Field>
                      <Field label="Peso de 1 un.">
                        <div className="flex gap-1">
                          <input name="newWeight" type="number" min="0" step="0.01" className={inputClass} placeholder="395" />
                          <select
                            value={newWeightUnit}
                            onChange={(e) => setNewWeightUnit(e.target.value as 'g' | 'kg')}
                            aria-label="Unidade do peso"
                            className={`${inputClass} w-16!`}
                          >
                            <option value="g">g</option>
                            <option value="kg">kg</option>
                          </select>
                        </div>
                      </Field>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      O item também entra no Estoque. O peso é opcional, mas permite usar g/kg na receita.
                    </p>
                  </>
                ) : (
                <Field label="Ingrediente ou embalagem do estoque">
                  <select required name="stockId" className={inputClass} defaultValue="">
                    <option value="" disabled>
                      Selecione...
                    </option>
                    <optgroup label="Ingredientes">
                      {stock
                        .filter((item) => (item.category ?? 'Ingrediente') === 'Ingrediente')
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
                )}
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Quantidade usada na receita">
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
                </div>
                <Button type="submit" className="w-full justify-self-end rounded-xl sm:w-auto">
                  Adicionar
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-5 py-3">Ingrediente</th>
                <th className="px-3 py-3">Qtd.</th>
                <th className="px-3 py-3">Un.</th>
                <th className="px-3 py-3">Peso</th>
                <th className="px-3 py-3">Custo</th>
                <th className="px-3 py-3">
                  <span className="sr-only">Remover</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {enrichedItems.map((item) => (
                <tr key={item.id}>
                  <td className="px-5 py-3">
                    <p className="font-medium">{item.stockItem?.name}</p>
                    <Badge variant="outline" className="mt-0.5">
                      {item.stockItem?.category ?? 'Ingrediente'}
                    </Badge>
                  </td>
                  <td className="px-3 py-3 font-nums">{item.quantity}</td>
                  <td className="px-3 py-3">{item.unit}</td>
                  <td className="px-3 py-3 font-nums">
                    {weightLabel(lineWeightGrams(item.stockItem!, item.quantity, item.unit))}
                  </td>
                  <td className="px-3 py-3 font-nums font-semibold">
                    {money(lineCost(item.stockItem!, item.quantity, item.unit))}
                  </td>
                  <td className="px-3 py-3">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Excluir ${item.stockItem?.name}`}
                      onClick={() => {
                        setRecipeItems((old) => old.filter((x) => x.id !== item.id));
                        setJustSaved(false);
                      }}
                    >
                      <Trash2 />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
            {enrichedItems.length > 0 && (
              <tfoot className="bg-muted/35 text-sm font-bold">
                <tr>
                  <td className="px-5 py-3">Totais</td>
                  <td className="px-3 py-3" colSpan={2}>
                    <span className="sr-only">—</span>
                  </td>
                  <td className="px-3 py-3 font-nums">{weightLabel(recipeWeightGrams)}</td>
                  <td className="px-3 py-3 font-nums">{money(directCost)}</td>
                  <td className="px-3 py-3">
                    <span className="sr-only">—</span>
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
          {enrichedItems.length === 0 && (
            <Empty label="Nenhum ingrediente adicionado ainda." />
          )}
        </div>
      </Panel>

      <Panel className="p-5">
        <PanelTitle title="Percentuais" subtitle="" />
        <div className="mt-4 grid gap-4 sm:grid-cols-4">
          <NumberField
            label="Custos fixos/variáveis (%)"
            value={overheadPercent}
            setValue={(v) => {
              setOverheadPercent(v);
              setJustSaved(false);
            }}
          />
          <NumberField
            label="Lucro geral (%)"
            value={profit}
            setValue={(v) => {
              setProfit(v);
              setJustSaved(false);
            }}
          />
          <NumberField
            label="Taxa cartão/iFood (%)"
            value={feePercent}
            setValue={(v) => {
              setFeePercent(v);
              setJustSaved(false);
            }}
          />
          <NumberField
            label="Rendimento (un)"
            value={yieldCount}
            setValue={(v) => {
              setYieldCount(v);
              setJustSaved(false);
            }}
          />
        </div>
      </Panel>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel className="p-5">
          <PanelTitle title="Custos" subtitle="" icon="📦" />
          <div className="mt-4 space-y-3 text-sm">
            <CalcLine label="Custo dos ingredientes" value={money(directCost)} />
            <CalcLine label="Custos fixos e variáveis" value={money(overheadTotal)} />
            <div className="flex justify-between rounded-xl bg-muted p-3">
              <span className="text-sm font-semibold">
                <span className="ficha-star">★</span> Custo total da receita
              </span>
              <strong className="font-nums">{money(baseCost)}</strong>
            </div>
          </div>
        </Panel>
        <Panel className="p-5">
          <PanelTitle title="Formação do Preço" subtitle="" icon="💰" />
          <div className="mt-4 space-y-3">
            <Field label={<><span className="ficha-star">★</span> Preço de venda</>}>
              <input
                type="number"
                step="0.01"
                min="0"
                value={sellPrice.toFixed(2)}
                onChange={(e) => {
                  setPriceTouched(true);
                  setManualPrice(Number(e.target.value));
                  setJustSaved(false);
                }}
                className={`${inputClass} font-nums border-primary`}
              />
            </Field>
            <div className="flex justify-between rounded-xl bg-primary p-3 text-primary-foreground">
              <span className="text-sm font-semibold">Preço com taxa</span>
              <strong className="font-nums">{money(priceWithFees)}</strong>
            </div>
            <CalcLine label="Valor das taxas" value={money(feesAmount)} />
            <NumberField
              label="Adicional por fora da precificação (opcional)"
              value={extraCharge}
              setValue={(v) => {
                setExtraCharge(v);
                setJustSaved(false);
              }}
            />
          </div>
        </Panel>
        <Panel className="p-5">
          <PanelTitle title="Distribuição do Resultado" subtitle="" icon="📊" />
          <div className="mt-4 space-y-3">
            <div className="flex justify-between rounded-xl bg-muted p-3">
              <span className="text-sm font-semibold">Lucro disponível</span>
              <strong className="font-nums">{money(availableProfit)}</strong>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <NumberField
                  label="Pró-labore (%)"
                  value={proLaborePercent}
                  setValue={(v) => {
                    setProLaborePercent(v);
                    setJustSaved(false);
                  }}
                />
                <p className="mt-1 text-xs text-muted-foreground">{money(proLaboreValue)}</p>
              </div>
              <div>
                <NumberField
                  label="Lucro da empresa (%)"
                  value={companyPercent}
                  setValue={(v) => {
                    setCompanyPercent(v);
                    setJustSaved(false);
                  }}
                />
                <p className="mt-1 text-xs text-muted-foreground">{money(companyValue)}</p>
              </div>
            </div>
            <CalcLine label="Margem de lucro do produto" value={`${profitMargin.toFixed(0)}%`} />
          </div>
        </Panel>
        <Panel className="p-5">
          <PanelTitle
            title="Valores por Unidade"
            subtitle={soldByWeight ? 'Por kg' : 'Por unidade'}
            icon="📐"
          />
          <div className="mt-4 space-y-3">
            <CalcLine label="Custo por unidade" value={money(costPerUnit)} />
            <CalcLine label="Preço de venda por unidade" value={money(sellPricePerUnit)} />
            <CalcLine label="Preço por unidade com taxa" value={money(priceWithFeesPerUnit)} />
          </div>
        </Panel>
      </div>

      <Panel className="p-5">
        <PanelTitle title="Peso da Receita" subtitle="" icon="⚖️" />
        <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_auto]">
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Peso somado dos ingredientes</span>
              <strong className="font-nums">{weightLabel(recipeWeightGrams)}</strong>
            </div>
            <div className="flex justify-between rounded-xl bg-muted p-3">
              <span className="font-semibold">
                <span className="ficha-star">★</span> Peso final da receita
              </span>
              <strong className="font-nums">{weightLabel(finalWeightGrams)}</strong>
            </div>
            <NumberField
              label="Redução na produção (%)"
              value={weightLossPercent}
              setValue={(v) => {
                setWeightLossPercent(v);
                setJustSaved(false);
              }}
            />
            <p className="text-[11px] text-muted-foreground">
              Perda de peso ao cozinhar/assar (opcional).
            </p>
          </div>
          <div>
            <p className="mb-1.5 text-xs font-semibold text-muted-foreground">
              É um produto vendido por kg?
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
        </div>
      </Panel>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          type="button"
          disabled={!enrichedItems.length}
          className="h-11 flex-1 rounded-xl"
          onClick={save}
        >
          {justSaved ? <Check /> : null} {justSaved ? 'Precificação salva' : 'Salvar precificação'}
        </Button>
        <Button type="button" variant="outline" className="h-11 rounded-xl" onClick={onRemove}>
          <Trash2 /> Remover receita
        </Button>
      </div>

      <div className="print-ficha">
        <h1>{productName}</h1>
        <p>
          Rendimento: {yieldCount} un.{soldByWeight ? ' • Vendido por kg' : ''}
        </p>
        <p>
          Peso da receita: {weightLabel(recipeWeightGrams)}
          {weightLossPercent > 0 && ` (após perda de ${weightLossPercent}%: ${weightLabel(finalWeightGrams)})`}
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
        <p>Custo dos ingredientes: {money(directCost)}</p>
        <p>Custos fixos e variáveis: {money(overheadTotal)}</p>
        <p>Custo total: {money(baseCost)}</p>
        <p>Margem de lucro: {profit}%</p>
        <h2>{soldByWeight ? `Preço por kg: ${money(sellPricePerUnit)}` : `Preço por unidade: ${money(sellPricePerUnit)}`}</h2>
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
        className={`${inputClass} font-nums`}
      />
    </Field>
  );
}
function CalcLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b pb-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <strong className="font-nums">{value}</strong>
    </div>
  );
}

const financeChartConfig = {
  entradas: { label: 'Entradas', color: 'var(--chart-4)' },
  saidas: { label: 'Saídas', color: 'var(--destructive)' },
} satisfies ChartConfig;

function CashPanel({
  items,
  cash,
  setCash,
}: {
  items: FinanceItem[];
  cash: CashBalance;
  setCash: (v: CashBalance) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  // Lançamentos criados depois do saldo informado (o id é a hora em que o
  // lançamento foi criado), para não contar duas vezes o que já estava na
  // conta.
  const since = cash ? items.filter((i) => i.id > cash.setAt) : [];
  const moved = since.reduce((sum, i) => sum + (i.type === 'Entrada' ? i.value : -i.value), 0);
  const balance = cash ? cash.amount + moved : 0;

  const save = (e: FormSubmit) => {
    e.preventDefault();
    // "1.250,50" (jeito brasileiro) ou "1250.50".
    const raw = value.trim();
    const amount = Number(raw.includes(',') ? raw.replace(/\./g, '').replace(',', '.') : raw);
    if (!Number.isFinite(amount)) return;
    setCash({ amount, setAt: Date.now() });
    setEditing(false);
  };

  return (
    <Panel className="mb-5 p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
            <WalletCards className="size-4" aria-hidden="true" /> Caixa da empresa (conta bancária)
          </p>
          {cash ? (
            <>
              <p
                className={`mt-1 font-heading text-3xl font-bold [overflow-wrap:anywhere] ${balance < 0 ? 'text-destructive' : ''}`}
              >
                {money(balance)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Saldo informado em {new Date(cash.setAt).toLocaleDateString('pt-BR')}:{' '}
                {money(cash.amount)} {moved >= 0 ? '+' : '−'} {money(Math.abs(moved))} de{' '}
                {since.length} {since.length === 1 ? 'lançamento' : 'lançamentos'} depois disso.
              </p>
            </>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">
              Informe quanto tem hoje na conta da empresa. A partir daí, cada entrada e saída
              lançada aqui atualiza o caixa sozinha.
            </p>
          )}
        </div>
        {!editing && (
          <Button
            variant={cash ? 'outline' : 'default'}
            className="h-10 rounded-xl"
            onClick={() => {
              setValue(cash ? balance.toFixed(2).replace('.', ',') : '');
              setEditing(true);
            }}
          >
            <Pencil /> {cash ? 'Ajustar saldo' : 'Informar saldo'}
          </Button>
        )}
      </div>
      {editing && (
        <form onSubmit={save} className="mt-4 flex flex-wrap items-end gap-3">
          <Field label="Quanto tem na conta agora (R$)">
            <input
              autoFocus
              required
              inputMode="decimal"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className={`${inputClass} w-48!`}
              placeholder="Ex.: 1.250,00"
            />
          </Field>
          <Button type="submit" className="h-10 rounded-xl">
            Salvar
          </Button>
          <Button type="button" variant="ghost" className="h-10" onClick={() => setEditing(false)}>
            Cancelar
          </Button>
          <p className="w-full text-xs text-muted-foreground">
            Confira no app do banco. Lançamentos feitos a partir de agora entram no caixa.
          </p>
        </form>
      )}
    </Panel>
  );
}

function Finance({
  items,
  setItems,
  cash,
  setCash,
}: {
  items: FinanceItem[];
  setItems: (v: FinanceItem[] | ((o: FinanceItem[]) => FinanceItem[])) => void;
  cash: CashBalance;
  setCash: (v: CashBalance) => void;
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
      <CashPanel items={items} cash={cash} setCash={setCash} />
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
            <p className="[overflow-wrap:anywhere] mt-1 text-lg font-bold text-green-800">
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
        <form onSubmit={add} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
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

// Endereço público do cardápio (site no Vercel). Definido no build por
// NEXT_PUBLIC_CARDAPIO_URL no .env.local; o padrão é o domínio da Confeitto.
const CARDAPIO_SITE = (
  process.env.NEXT_PUBLIC_CARDAPIO_URL || 'https://www.confeitto.com.br'
).replace(/\/+$/, '');
function publicMenuUrl(bakeryId: string) {
  return `${CARDAPIO_SITE}/${bakeryId}`;
}

// "Cardápio de 27/10 a 02/11" / "Cardápio de 27/10/2026".
function menuPeriodLabel(period: NonNullable<MenuPeriod>): string {
  const fmt = (d: string, withYear: boolean) => {
    const [y, m, day] = d.split('-');
    return withYear ? `${day}/${m}/${y}` : `${day}/${m}`;
  };
  return period.to && period.to !== period.from
    ? `Cardápio de ${fmt(period.from, false)} a ${fmt(period.to, false)}`
    : `Cardápio de ${fmt(period.from, true)}`;
}

function DigitalMenu({
  items,
  setItems,
  bakeryId,
  products,
  period,
  setPeriod,
}: {
  items: MenuItem[];
  setItems: (v: MenuItem[] | ((o: MenuItem[]) => MenuItem[])) => void;
  bakeryId: string;
  products: Product[];
  period: MenuPeriod;
  setPeriod: (v: MenuPeriod) => void;
}) {
  const [importOpen, setImportOpen] = useState(false);
  // Produtos do catálogo que ainda não estão no cardápio.
  const importable = products.filter(
    (p) => !items.some((m) => m.sourceProductId === p.id),
  );
  const [picked, setPicked] = useState<Record<number, { on: boolean; price: string }>>({});
  const [importCategory, setImportCategory] = useState('Doces');
  const [importSearch, setImportSearch] = useState('');
  // Começa com nada marcado: a pessoa escolhe quais produtos entram neste
  // cardápio (o preço já vem preenchido quando o produto tem um).
  const openImport = (open: boolean) => {
    setImportOpen(open);
    if (open) {
      setImportSearch('');
      setPicked(
        Object.fromEntries(
          importable.map((p) => [p.id, { on: false, price: p.price ? String(p.price) : '' }]),
        ),
      );
    }
  };
  const importQuery = importSearch.trim().toLocaleLowerCase('pt-BR');
  const importShown = importQuery
    ? importable.filter((p) =>
        `${p.name} ${p.flavor ?? ''}`.toLocaleLowerCase('pt-BR').includes(importQuery),
      )
    : importable;
  const allShownPicked =
    importShown.length > 0 && importShown.every((p) => picked[p.id]?.on);
  const toggleAllShown = () =>
    setPicked((old) => {
      const next = { ...old };
      for (const p of importShown) {
        next[p.id] = { ...(old[p.id] ?? { on: false, price: '' }), on: !allShownPicked };
      }
      return next;
    });
  const pickedWithoutPrice = importable.filter(
    (p) => picked[p.id]?.on && !(Number(picked[p.id]?.price) > 0),
  ).length;
  const pickedCount = importable.filter(
    (p) => picked[p.id]?.on && Number(picked[p.id]?.price) > 0,
  ).length;
  const importProducts = () => {
    const now = Date.now();
    const category = importCategory.trim() || 'Doces';
    const novos: MenuItem[] = importable
      .filter((p) => picked[p.id]?.on && Number(picked[p.id]?.price) > 0)
      .map((p, index) => {
        const weight =
          p.weight && (p.weight.unit === 'kg' || p.weight.unit === 'g' || p.weight.unit === 'l')
            ? { value: p.weight.value, unit: p.weight.unit }
            : undefined;
        return {
          id: now + index,
          name: p.name,
          ...(p.flavor ? { flavor: p.flavor } : {}),
          category,
          price: Number(picked[p.id].price),
          available: true,
          emoji: '🧁',
          ...(p.photoUrl ? { photoUrl: p.photoUrl } : {}),
          ...(weight ? { weight } : {}),
          sourceProductId: p.id,
        };
      });
    if (novos.length) setItems((old) => [...old, ...novos]);
    setImportOpen(false);
  };
  const [pendingPhoto, setPendingPhoto] = useState('');
  const [menuLinkCopied, setMenuLinkCopied] = useState(false);
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
    setItems((old) => [
      ...old,
      {
        id: Date.now(),
        name: fieldValue(data, 'name').trim(),
        ...(fieldValue(data, 'flavor').trim() ? { flavor: fieldValue(data, 'flavor').trim() } : {}),
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
        subtitle="Gerencie os produtos publicados no cardápio dos clientes."
        action={
          <div className="flex flex-wrap gap-2">
            <a
              href={publicMenuUrl(bakeryId)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border bg-background px-2.5 text-sm font-medium transition hover:bg-muted"
            >
              <Eye className="size-4" /> Abrir cardápio do cliente
            </a>
            <button
              type="button"
              onClick={() =>
                void navigator.clipboard
                  .writeText(publicMenuUrl(bakeryId))
                  .then(() => {
                    setMenuLinkCopied(true);
                    setTimeout(() => setMenuLinkCopied(false), 2000);
                  })
              }
              className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border bg-background px-2.5 text-sm font-medium transition hover:bg-muted"
            >
              {menuLinkCopied ? 'Link copiado!' : 'Copiar link'}
            </button>
          </div>
        }
      />
      <Panel className="mb-5 p-5">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Cardápio válido de">
            <input
              type="date"
              value={period?.from ?? ''}
              onChange={(e) =>
                setPeriod(e.target.value ? { from: e.target.value, ...(period?.to ? { to: period.to } : {}) } : null)
              }
              className={`${inputClass} w-44!`}
            />
          </Field>
          <Field label="até (opcional)">
            <input
              type="date"
              value={period?.to ?? ''}
              min={period?.from}
              disabled={!period?.from}
              onChange={(e) =>
                period?.from &&
                setPeriod({ from: period.from, ...(e.target.value ? { to: e.target.value } : {}) })
              }
              className={`${inputClass} w-44!`}
            />
          </Field>
          {(() => {
            const today = new Date().toLocaleDateString('sv-SE');
            const end = period?.from
              ? period.to ||
                new Date(new Date(`${period.from}T12:00:00`).getTime() + 6 * 86400000).toLocaleDateString('sv-SE')
              : null;
            const over = end != null && end < today;
            return (
              <p
                className={`min-w-0 flex-1 pb-2 text-xs ${over ? 'font-semibold text-destructive' : 'text-muted-foreground'}`}
              >
                {!period?.from
                  ? 'Escolha a data para o cliente saber a que dia ou semana o cardápio se refere. Sem produtos publicados, o site mostra a página “Cardápio da semana em preparo”.'
                  : over
                    ? 'Esse período já terminou: o site está mostrando “Esse cardápio já encerrou”. Atualize as datas para a semana atual.'
                    : `O cliente vê: "${menuPeriodLabel(period)}". Depois da última data, o site avisa que o cardápio encerrou.`}
              </p>
            );
          })()}
          <Dialog open={importOpen} onOpenChange={openImport}>
            <DialogTrigger render={<Button variant="outline" className="h-10 rounded-xl" />}>
              <Download /> Puxar dos meus produtos
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
              <DialogHeader>
                <DialogTitle>Puxar dos meus produtos</DialogTitle>
              </DialogHeader>
              {importable.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {products.length === 0
                    ? 'Você ainda não cadastrou produtos. Cadastre em Produtos e volte aqui.'
                    : 'Todos os seus produtos já estão no cardápio.'}
                </p>
              ) : (
                <div className="grid gap-3">
                  <Field label="Categoria no cardápio">
                    <input
                      value={importCategory}
                      onChange={(e) => setImportCategory(e.target.value)}
                      maxLength={40}
                      className={inputClass}
                    />
                  </Field>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="relative min-w-0 flex-1">
                      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                      <input
                        value={importSearch}
                        onChange={(e) => setImportSearch(e.target.value)}
                        placeholder="Buscar produto ou sabor"
                        aria-label="Buscar produto ou sabor"
                        className={`${inputClass} pl-9`}
                      />
                    </div>
                    <Button type="button" variant="outline" className="h-10 rounded-xl" onClick={toggleAllShown}>
                      {allShownPicked ? 'Desmarcar todos' : 'Marcar todos'}
                    </Button>
                  </div>
                  <ul className="grid max-h-[50vh] gap-2 overflow-y-auto pr-1" aria-label="Seus produtos">
                    {importShown.length === 0 && (
                      <li className="py-6 text-center text-sm text-muted-foreground">
                        Nenhum produto encontrado.
                      </li>
                    )}
                    {importShown.map((p) => {
                      const choice = picked[p.id] ?? { on: false, price: '' };
                      return (
                        <li
                          key={p.id}
                          className={`flex items-center gap-3 rounded-xl border p-3 transition-colors ${choice.on ? 'border-primary bg-primary/8' : 'hover:bg-muted/60'}`}
                        >
                          <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
                            <input
                              type="checkbox"
                              checked={choice.on}
                              onChange={() =>
                                setPicked((old) => ({ ...old, [p.id]: { ...choice, on: !choice.on } }))
                              }
                              className="size-4 shrink-0"
                            />
                            {p.photoUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={p.photoUrl}
                                alt=""
                                className="size-10 shrink-0 rounded-lg object-cover"
                              />
                            ) : null}
                            <span className="min-w-0 flex-1">
                              <span className="block text-sm font-semibold [overflow-wrap:anywhere]">{p.name}</span>
                              {p.flavor && (
                                <span className="block text-xs text-muted-foreground [overflow-wrap:anywhere]">{p.flavor}</span>
                              )}
                            </span>
                          </label>
                          <label className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                            R$
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={choice.price}
                              onChange={(e) =>
                                setPicked((old) => ({
                                  ...old,
                                  [p.id]: { ...choice, on: true, price: e.target.value },
                                }))
                              }
                              aria-label={`Preço de ${p.name} ${p.flavor ?? ''}`}
                              className="font-nums h-9 w-24 rounded-lg border bg-background px-2 text-sm text-foreground outline-none focus:border-primary"
                            />
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                  {pickedWithoutPrice > 0 && (
                    <p role="status" className="text-xs font-medium text-destructive">
                      {pickedWithoutPrice === 1
                        ? '1 produto marcado está sem preço — preencha para ele entrar no cardápio.'
                        : `${pickedWithoutPrice} produtos marcados estão sem preço — preencha para eles entrarem no cardápio.`}
                    </p>
                  )}
                  <Button
                    type="button"
                    disabled={pickedCount === 0}
                    onClick={importProducts}
                    className="justify-self-end rounded-xl"
                  >
                    <Plus /> Adicionar {pickedCount} {pickedCount === 1 ? 'produto' : 'produtos'}
                  </Button>
                </div>
              )}
            </DialogContent>
          </Dialog>
        </div>
      </Panel>
      <Panel className="mb-5 p-5">
        <form
          onSubmit={addProduct}
          className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[1.1fr_1fr_.8fr_.6fr_.5fr_.4fr_auto]"
        >
          <Field label="Produto">
            <input
              required
              name="name"
              maxLength={80}
              className={inputClass}
              placeholder="Ex.: Brownie"
            />
          </Field>
          <Field label="Sabor (opcional)">
            <input
              name="flavor"
              maxLength={80}
              className={inputClass}
              placeholder="Ex.: Pistache"
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
          <div className="sm:col-span-2 xl:col-span-7">
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
          title="Produtos do cardápio"
          subtitle="Publique, oculte ou remova manualmente os itens"
        />
        <div className="divide-y">
          {items.length === 0 && (
            <Empty label="Nenhum produto cadastrado ainda." />
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
              <div className="min-w-0 flex-1">
                <p className="font-semibold [overflow-wrap:anywhere]">{item.name}</p>
                {item.flavor && (
                  <p className="text-sm text-muted-foreground [overflow-wrap:anywhere]">{item.flavor}</p>
                )}
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

function ProductsCatalog({
  items,
  setItems,
  menuItems,
  setMenuItems,
}: {
  items: Product[];
  setItems: (v: Product[] | ((o: Product[]) => Product[])) => void;
  menuItems: MenuItem[];
  setMenuItems: (v: MenuItem[] | ((o: MenuItem[]) => MenuItem[])) => void;
}) {
  const [weightUnit, setWeightUnit] = useState<
    'g' | 'kg' | 'ml' | 'l' | 'unidade'
  >('g');
  const [pendingPhoto, setPendingPhoto] = useState('');
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState('');
  const uploadPhoto: NonNullable<ComponentProps<'input'>['onChange']> = (
    event,
  ) => {
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
        ...(pendingPhoto ? { photoUrl: pendingPhoto } : {}),
      },
    ]);
    e.currentTarget.reset();
    setWeightUnit('g');
    setPendingPhoto('');
  };
  const publish = (product: Product) => {
    if (!product.price) return;
    const weight =
      product.weight && (product.weight.unit === 'kg' || product.weight.unit === 'g' || product.weight.unit === 'l')
        ? { value: product.weight.value, unit: product.weight.unit }
        : undefined;
    setMenuItems((old) => [
      ...old,
      {
        id: Date.now(),
        name: product.name,
        ...(product.flavor ? { flavor: product.flavor } : {}),
        category: 'Catálogo',
        price: product.price!,
        available: true,
        emoji: '🧁',
        ...(product.photoUrl ? { photoUrl: product.photoUrl } : {}),
        ...(weight ? { weight } : {}),
        sourceProductId: product.id,
      },
    ]);
  };
  return (
    <>
      <PageHeading
        title="Produtos"
        subtitle="Cadastre produtos com sabor e foto — depois publique no cardápio da semana."
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
              className={`${inputClass} w-28!`}
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
                className={`${inputClass} w-20!`}
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
            <Button type="submit" className="h-10 w-full sm:w-auto" disabled={uploadingPhoto}>
              <Plus /> Cadastrar
            </Button>
          </div>
          <div className="sm:col-span-5">
            <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed p-4 text-center transition hover:border-primary/50">
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={uploadPhoto}
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
                Foto do produto (opcional)
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
          title={`${items.length} produtos`}
          subtitle="Publique no cardápio da semana quando quiser vender por lá"
        />
        <div className="divide-y">
          {items.length === 0 && (
            <Empty label="Nenhum produto cadastrado ainda." />
          )}
          {items.map((product) => {
            const published = menuItems.some(
              (m) => m.sourceProductId === product.id,
            );
            return (
              <div key={product.id} className="flex flex-wrap items-center gap-x-4 gap-y-3 px-5 py-4">
                {product.photoUrl ? (
                  <Image
                    src={product.photoUrl}
                    alt={product.name}
                    width={44}
                    height={44}
                    unoptimized
                    className="size-11 shrink-0 rounded-xl object-cover"
                  />
                ) : (
                  <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-secondary text-2xl">
                    🧁
                  </span>
                )}
                <div className="min-w-0 flex-1 basis-40">
                  <p className="font-semibold [overflow-wrap:anywhere]">{product.name}</p>
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
                  variant={published ? 'outline' : 'default'}
                  disabled={published || !product.price}
                  title={
                    !product.price && !published
                      ? 'Cadastre um valor para publicar'
                      : undefined
                  }
                  onClick={() => publish(product)}
                >
                  {published ? 'Já no cardápio' : 'Publicar no cardápio'}
                </Button>
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
            );
          })}
        </div>
      </Panel>
    </>
  );
}

// Pedidos de um cliente: pelo cadastro ligado ao pedido (customerId) e,
// nos pedidos antigos que ainda não tinham esse vínculo, pelo nome.
function ordersOfClient(orders: Order[], client: LoyaltyItem): Order[] {
  return orders.filter((o) =>
    o.customerId != null ? o.customerId === client.id : o.customer === client.name,
  );
}

function orderDayOf(order: Order): string {
  return order.orderDate || order.deliveryDate || '';
}

// Produtos que o cliente mais pede, por quantidade somada.
function productRanking(orders: Order[]): { name: string; quantity: number }[] {
  const counts = new Map<string, number>();
  for (const order of orders) {
    for (const item of order.items ?? []) {
      counts.set(item.name, (counts.get(item.name) ?? 0) + item.quantity);
    }
  }
  return [...counts]
    .map(([name, quantity]) => ({ name, quantity }))
    .sort((a, b) => b.quantity - a.quantity);
}

function ClientReport({ client, orders }: { client: LoyaltyItem; orders: Order[] }) {
  const clientOrders = ordersOfClient(orders, client)
    .slice()
    .sort((a, b) => orderDayOf(b).localeCompare(orderDayOf(a)));
  const total = clientOrders.reduce((sum, o) => sum + o.value, 0);
  const ranking = productRanking(clientOrders);
  const dates = clientOrders.map(orderDayOf).filter(Boolean).sort();
  const lastDate = dates[dates.length - 1];
  const firstDate = dates[0];
  const daysSince = lastDate
    ? Math.floor((Date.now() - new Date(`${lastDate}T12:00:00`).getTime()) / 86400000)
    : null;

  const stat = (label: string, value: React.ReactNode) => (
    <div className="min-w-0 rounded-xl bg-muted p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-semibold [overflow-wrap:anywhere]">{value}</p>
    </div>
  );

  return (
    <div className="grid gap-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stat('Pedidos', clientOrders.length)}
        {stat('Total comprado', money(total))}
        {stat('Ticket médio', clientOrders.length ? money(total / clientOrders.length) : '—')}
        {stat('Selos', `${client.stamps}/10`)}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {stat(
          'Última compra',
          lastDate ? (
            <>
              {formatIsoDate(lastDate)}
              <span className="block text-xs font-normal text-muted-foreground">
                {daysSince === 0 ? 'hoje' : daysSince === 1 ? 'há 1 dia' : `há ${daysSince} dias`}
              </span>
            </>
          ) : (
            'Ainda não comprou'
          ),
        )}
        {stat('Cliente desde', firstDate ? formatIsoDate(firstDate) : '—')}
      </div>

      <section>
        <h3 className="mb-2 text-sm font-bold">Produtos mais pedidos</h3>
        {ranking.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum produto registrado ainda.</p>
        ) : (
          <ol className="grid gap-1.5">
            {ranking.slice(0, 5).map((product, index) => (
              <li key={product.name} className="flex items-center gap-3 rounded-lg border px-3 py-2 text-sm">
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-secondary text-xs font-bold text-primary">
                  {index + 1}
                </span>
                <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{product.name}</span>
                <span className="shrink-0 font-nums text-muted-foreground">{product.quantity} un.</span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section>
        <h3 className="mb-2 text-sm font-bold">Histórico de pedidos</h3>
        {clientOrders.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum pedido ainda.</p>
        ) : (
          <ul className="max-h-72 divide-y overflow-y-auto rounded-xl border">
            {clientOrders.map((order) => (
              <li key={order.id} className="flex items-start gap-3 px-3 py-2.5 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">
                    {order.id}{' '}
                    <span className="font-normal text-muted-foreground">
                      • {formatIsoDate(orderDayOf(order), order.date)}
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">
                    {order.items?.length
                      ? order.items.map((i) => `${i.quantity}× ${i.name}`).join(', ')
                      : order.item}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-nums font-semibold">{money(order.value)}</p>
                  <p className="text-xs text-muted-foreground">{order.status}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
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
  const [formError, setFormError] = useState('');

  // O WhatsApp é a "chave" do cliente: o mesmo número não vira dois
  // cadastros (o cardápio também acha o cliente por ele).
  const checkPhone = (raw: string, ignoreId?: number): string | null | false => {
    if (!raw.trim()) return null;
    const phone = normalizePhone(raw);
    if (!phone) {
      setFormError('WhatsApp inválido: use DDD + 9 dígitos, ex.: (11) 91234-5678.');
      return false;
    }
    const twin = loyalty.find((c) => c.id !== ignoreId && normalizePhone(c.phone) === phone);
    if (twin) {
      setFormError(`Esse WhatsApp já é de ${twin.name}.`);
      return false;
    }
    return phone;
  };

  const addClient = (e: FormSubmit) => {
    e.preventDefault();
    setFormError('');
    const data = new FormData(e.currentTarget);
    const name = fieldValue(data, 'name').trim();
    const birthday = fieldValue(data, 'birthday').trim();
    if (!name || !birthday) return;
    const phone = checkPhone(fieldValue(data, 'phone'));
    if (phone === false) return;
    setLoyalty((old) => [
      ...old,
      {
        id: Date.now(),
        name,
        phone: phone ?? '',
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
    setFormError('');
    const checked = checkPhone(fieldValue(data, 'phone'), client.id);
    if (checked === false) return;
    const phone = checked ?? '';
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
          className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[1.2fr_1fr_1fr_auto]"
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
            <input
              name="phone"
              type="tel"
              inputMode="numeric"
              maxLength={16}
              onChange={(e) => {
                e.currentTarget.value = formatPhone(e.currentTarget.value);
              }}
              className={inputClass}
              placeholder="(11) 91234-5678"
            />
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
        {formError && (
          <p role="alert" className="mt-3 text-sm font-medium text-destructive">
            {formError}
          </p>
        )}
      </Panel>
      {loyalty.length === 0 && (
        <Panel className="p-10 text-center text-sm text-muted-foreground">
          Nenhum cliente cadastrado ainda.
        </Panel>
      )}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {loyalty.map((client) => {
          const clientOrders = ordersOfClient(orders, client);
          const totalPurchased = clientOrders.reduce(
            (sum, o) => sum + o.value,
            0,
          );
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
                      type="tel"
                      inputMode="numeric"
                      maxLength={16}
                      defaultValue={client.phone ? formatPhone(client.phone) : ''}
                      onChange={(e) => {
                        e.currentTarget.value = formatPhone(e.currentTarget.value);
                      }}
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
                      onClick={() => {
                        setEditingId(null);
                        setFormError('');
                      }}
                    >
                      Cancelar
                    </Button>
                  </div>
                  {formError && (
                    <p role="alert" className="text-sm font-medium text-destructive">
                      {formError}
                    </p>
                  )}
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
                  <div className="min-w-0">
                    <p className="font-semibold [overflow-wrap:anywhere]">{client.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {client.phone ? formatPhone(client.phone) : 'Sem WhatsApp'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      🎂 {formatIsoDate(client.birthday)}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Dialog>
                    <DialogTrigger
                      render={
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Relatório de ${client.name}`}
                          title="Relatório do cliente"
                        />
                      }
                    >
                      <ClipboardList />
                    </DialogTrigger>
                    <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
                      <DialogHeader>
                        <DialogTitle>{client.name}</DialogTitle>
                        <p className="text-xs text-muted-foreground">
                          {client.phone ? formatPhone(client.phone) : 'Sem WhatsApp'} • 🎂{' '}
                          {formatIsoDate(client.birthday)}
                        </p>
                      </DialogHeader>
                      <ClientReport client={client} orders={orders} />
                    </DialogContent>
                  </Dialog>
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
                <div className="min-w-0 rounded-xl bg-muted p-3">
                  <p className="text-xs text-muted-foreground">Pedidos</p>
                  <p className="text-xl font-bold">{clientOrders.length}</p>
                </div>
                <div className="min-w-0 rounded-xl bg-muted p-3">
                  <p className="text-xs text-muted-foreground">Selos</p>
                  <p className="text-xl font-bold">{client.stamps}/10</p>
                </div>
                <div className="min-w-0 rounded-xl bg-secondary p-3">
                  <p className="text-xs text-primary">Total comprado</p>
                  <p className="[overflow-wrap:anywhere] text-lg font-bold text-primary">
                    {money(totalPurchased)}
                  </p>
                </div>
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

  const [confirmDelete, setConfirmDelete] = useState('');

  // O cadastro acontece dentro do aplicativo (não existe link público),
  // então o que se compartilha é o código, com o passo a passo.
  const copyCode = (code: string) => {
    const text = `Seu código de convite do Confeitto: ${code}\nNo aplicativo, toque em "Criar conta", escolha "Entrar numa confeitaria" e digite o código.`;
    void navigator.clipboard.writeText(text).then(() => {
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(''), 2000);
    });
  };

  const removeInvite = async (code: string) => {
    setConfirmDelete('');
    const response = await fetch(`/api/invites/${encodeURIComponent(code)}`, {
      method: 'DELETE',
    });
    if (response.ok) setInvites((old) => old.filter((i) => i.code !== code));
    else loadInvites();
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
              <div className="min-w-0 flex-1">
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
                  onClick={() => copyCode(invite.code)}
                >
                  {copiedCode === invite.code ? <Check /> : <Copy />}
                  {copiedCode === invite.code ? 'Copiado' : 'Copiar código'}
                </Button>
              )}
              {!invite.usedBy &&
                (confirmDelete === invite.code ? (
                  <span className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      onClick={() => void removeInvite(invite.code)}
                    >
                      Excluir convite
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setConfirmDelete('')}
                    >
                      Cancelar
                    </Button>
                  </span>
                ) : (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Excluir o convite ${invite.code}`}
                    title="Excluir convite"
                    onClick={() => setConfirmDelete(invite.code)}
                  >
                    <Trash2 />
                  </Button>
                ))}
            </div>
          ))}
        </div>
      </Panel>
    </>
  );
}

