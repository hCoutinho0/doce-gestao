'use client';

import Image from 'next/image';
import { useEffect, useMemo, useRef, useState, type ComponentProps } from 'react';
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
  CakeSlice,
  Check,
  CheckCircle2,
  ChevronLeft,
  Circle,
  CircleHelp,
  ClipboardList,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Download,
  Eye,
  Gift,
  LayoutDashboard,
  LoaderCircle,
  Minus,
  Menu,
  PackageOpen,
  Pencil,
  Printer,
  Plus,
  Search,
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
import { BAKERY_KEY, type BakeryProfile } from '@/lib/bakery';
import { useUserSession, signOut } from '@/lib/auth';
import type { Invite } from '@/lib/tenant';
import { MenuConta } from '@/components/menu-conta';

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
  | 'help';
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
  // Onde foi comprado da última vez — só controle de fornecedor/reposição,
  // não entra em nenhum cálculo de custo.
  supplier?: string;
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
  // Marca de qual item do catálogo (Produtos) este veio, quando publicado
  // por lá — evita publicar o mesmo produto duas vezes. É uma cópia, não
  // um vínculo: editar o produto depois não atualiza o item já publicado.
  sourceProductId?: number;
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
  photoUrl?: string;
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
// Uma receita é uma entidade própria — não depende de já existir um
// produto no cardápio ou em Produtos para ser criada. `productId`/
// `productKind` só aparecem quando ela foi vinculada a um item real (na
// criação, opcionalmente, ou depois via "Precificar produto"); uma receita
// avulsa não tem nenhum dos dois. `id` é a chave própria da receita —
// receitas salvas antes desse campo existir não têm `id`, só `productId`
// (sempre presente nelas, já que só dava pra criar vinculado); nesse caso
// `productId` também serve de `id`, ver `recipeKey`.
type ProductRecipe = {
  id?: number;
  productId?: number;
  productKind?: 'menu' | 'catalog';
  productName?: string;
  yieldCount: number;
  recipeItems: RecipeLine[];
  // Único percentual de custos fixos/variáveis (aluguel, embalagem
  // avulsa, marketing...), aplicado sobre ingredientes+embalagens da
  // receita — substitui a antiga lista de "gastos invisíveis" nomeados.
  overheadPercent: number;
  profit: number;
  // Taxa única de cartão/iFood — substitui os antigos cardFee+tax
  // separados.
  feePercent: number;
  // Preço de venda: começa igual à sugestão (custo + margem), mas o
  // usuário pode digitar um valor diferente (ex.: arredondar) — uma vez
  // editado, para de seguir a sugestão automaticamente.
  sellPrice?: number;
  // Adicional cobrado fora da precificação (ex.: embalagem especial sob
  // pedido) — soma só no preço final, não entra na distribuição de lucro.
  extraCharge?: number;
  // Como o "lucro disponível" (preço de venda − custo total) se divide.
  proLaborePercent?: number;
  companyPercent?: number;
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
    { label: 'Ajuda', icon: CircleHelp, view: 'help' },
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
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [orders, setOrders] = useServerFetchedState('doce-orders', initialOrders);
  const [stock, setStock] = useStoredState('doce-stock-v2', initialStock);
  const [finance, setFinance] = useStoredState('doce-finance', initialFinance);
  const [menuItems, setMenuItems] = useStoredState('doce-menu', initialMenu);
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
          ['dashboard', 'orders', 'stock', 'menu', 'help'].includes(item.view),
        )
      : navItems;
  const pageTitle = navItems.find((item) => item.view === view)?.label ?? '';

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
    <main id="conteudo" tabIndex={-1} className="min-h-screen bg-background text-foreground">
      <div className="mx-auto grid min-h-screen max-w-[1680px] lg:grid-cols-[256px_minmax(0,1fr)]">
        <aside className="hidden border-r border-sidebar-border bg-sidebar px-4 py-6 lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col lg:self-start">
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
                stock={stock}
                recipes={recipes}
                menuItems={menuItems}
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
              />
            )}
            {view === 'stock' && <Stock stock={stock} setStock={setStock} />}
            {view === 'pricing' && (
              <Pricing
                stock={stock}
                menuItems={menuItems}
                setMenuItems={setMenuItems}
                products={products}
                setProducts={setProducts}
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
                bakeryId={session.bakeryId ?? ''}
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
  conta,
}: {
  bakery: BakeryProfile | null;
  visibleNavItems: { label: string; icon: typeof LayoutDashboard; view: View }[];
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
  label: React.ReactNode;
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
  stock,
  recipes,
  menuItems,
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
  icon,
}: {
  title: string;
  subtitle: string;
  action?: React.ReactNode;
  icon?: string;
}) {
  return (
    <div className="flex items-center justify-between border-b px-5 py-4">
      <div>
        <h2 className="font-heading font-bold">
          {icon ? <span className="mr-1.5">{icon}</span> : null}
          {title}
        </h2>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
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
                    aria-label={`Marcar pedido ${order.id} como pago`}
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
                    aria-label={`Status do pedido ${order.id}`}
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
  customers,
  setFinance,
  setLoyalty,
}: {
  orders: Order[];
  setOrders: (v: Order[] | ((o: Order[]) => Order[])) => void;
  menuItems: MenuItem[];
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
                <div>
                  <p className="font-semibold">{item.name}</p>
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
                <p className="font-nums text-3xl font-bold">
                  {item.qty}{' '}
                  <span className="font-sans text-base font-medium text-muted-foreground">
                    {item.unit}
                  </span>
                </p>
                <p className="font-nums text-xs text-muted-foreground">mín. {item.min}</p>
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
    <div className="ficha-theme">
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
    </div>
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
  overheadPercent: number;
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
  // "Custo dos ingredientes" na tela de Custos junta ingredientes e
  // embalagens da receita — são as mesmas linhas da tabela de itens.
  const directCost = ingredientCost + packagingCost;
  const overheadTotal = (directCost * (recipe.overheadPercent || 0)) / 100;
  const baseCost = directCost + overheadTotal;
  const recipeWeightGrams = ingredientLines.reduce(
    (sum, item) => sum + lineWeightGrams(item.stockItem!, item.quantity, item.unit),
    0,
  );
  return {
    enrichedItems,
    ingredientCost,
    packagingCost,
    directCost,
    overheadTotal,
    baseCost,
    recipeWeightGrams,
  };
}

// Identidade de uma receita: `id` quando existe, senão `productId` (toda
// receita salva antes de `id` existir tinha, obrigatoriamente, um
// productId — só dava pra criar já vinculada a um produto).
function recipeKey(recipe: ProductRecipe): number {
  return recipe.id ?? recipe.productId!;
}

function Pricing({
  stock,
  menuItems,
  setMenuItems,
  products,
  setProducts,
  recipes,
  setRecipes,
}: {
  stock: StockItem[];
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
          <Dialog open={addItemOpen} onOpenChange={setAddItemOpen}>
            <DialogTrigger render={<Button className="rounded-xl" />}>
              <Plus /> Adicionar item
            </DialogTrigger>
            <DialogContent className="ficha-theme">
              <DialogHeader>
                <DialogTitle>Adicionar item</DialogTitle>
              </DialogHeader>
              <form onSubmit={addStockItem} className="grid gap-3">
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
                <div className="grid grid-cols-2 gap-3">
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

// Endereço público do cardápio (site no Vercel). Definido no build por
// NEXT_PUBLIC_CARDAPIO_URL no .env.local; o padrão é o domínio da Confeitto.
const CARDAPIO_SITE = (
  process.env.NEXT_PUBLIC_CARDAPIO_URL || 'https://www.confeitto.com.br'
).replace(/\/+$/, '');
function publicMenuUrl(bakeryId: string) {
  return `${CARDAPIO_SITE}/${bakeryId}`;
}

function DigitalMenu({
  items,
  setItems,
  bakeryId,
}: {
  items: MenuItem[];
  setItems: (v: MenuItem[] | ((o: MenuItem[]) => MenuItem[])) => void;
  bakeryId: string;
}) {
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
        name: `${product.name} — ${product.flavor}`,
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
              <div key={product.id} className="flex items-center gap-4 px-5 py-4">
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
