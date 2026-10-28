'use client';

import Image from 'next/image';
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  Banknote,
  Camera,
  CalendarDays,
  CheckCircle2,
  CreditCard,
  Gift,
  MessageCircle,
  Minus,
  Plus,
  QrCode,
  ShoppingBag,
  Trash2,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { BakeryProfile } from '@/lib/bakery';
import { formatPhone, normalizePhone } from '@/lib/phone';
import { PreferenciasAcessibilidade } from '@/components/preferencias-acessibilidade';

type MenuItem = {
  id: number;
  name: string;
  category: string;
  price: number;
  available: boolean;
  emoji: string;
  flavor?: string;
  photoUrl?: string;
  weight?: { value: number; unit: 'kg' | 'g' | 'l' };
};
type MenuPeriod = { from: string; to?: string } | null;

// Mesmo nome que o servidor usa para conferir o preço ("Brownie — Pistache").
const menuLabel = (item: Pick<MenuItem, 'name' | 'flavor'>) =>
  item.flavor?.trim() ? `${item.name} — ${item.flavor.trim()}` : item.name;

function periodLabel(period: NonNullable<MenuPeriod>): string {
  const fmt = (d: string, withYear: boolean) => {
    const [y, m, day] = d.split('-');
    return withYear ? `${day}/${m}/${y}` : `${day}/${m}`;
  };
  return period.to && period.to !== period.from
    ? `Cardápio de ${fmt(period.from, false)} a ${fmt(period.to, false)}`
    : `Cardápio de ${fmt(period.from, true)}`;
}
// Dia de hoje (no fuso da pessoa) no formato AAAA-MM-DD.
function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Último dia que o cardápio vale: a data "até", ou uma semana a partir do
// início quando só o primeiro dia foi informado.
function periodEnd(period: NonNullable<MenuPeriod>): string {
  return period.to || addDaysIso(period.from, 6);
}

type Cart = Record<number, number>;
// Mercado Pago ("Pagar agora") is off for every confeitaria for now — it
// used a single shared access token (Lavily's own account), which would
// route every other confeitaria's money into it. Cartão fica inativo pelo
// mesmo motivo (sem processador de cartão por confeitaria ainda); Pix e
// dinheiro não dependem disso.
type PaymentMethod = 'Cartão na entrega' | 'Dinheiro na entrega' | 'Pix' | '';
type SavedOrder = {
  id: string;
  customer: string;
  item: string;
  date: string;
  value: number;
  status: string;
};

const fallbackItems: MenuItem[] = [];
const money = (value: number) =>
  value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export default function CardapioPage() {
  const { bakeryId } = useParams<{ bakeryId: string }>();
  const [items, setItems] = useState<MenuItem[]>(fallbackItems);
  const [loaded, setLoaded] = useState(false);
  const [cart, setCart] = useState<Cart>({});
  const [category, setCategory] = useState('Todos');
  const [customer, setCustomer] = useState('');
  const [phone, setPhone] = useState('');
  const [birthday, setBirthday] = useState('');
  const [deliveryDate, setDeliveryDate] = useState('');
  const [notes, setNotes] = useState('');
  const [success, setSuccess] = useState('');
  const [stamps, setStamps] = useState(0);
  const [payment, setPayment] = useState<PaymentMethod>('');
  const [deliveryCardType, setDeliveryCardType] = useState<
    'Crédito' | 'Débito'
  >('Crédito');
  const [cashChange, setCashChange] = useState('');
  const [paymentError, setPaymentError] = useState('');
  const [bakery, setBakery] = useState<BakeryProfile | null>(null);
  const [period, setPeriod] = useState<MenuPeriod>(null);
  // Cliente que já comprou antes: achado pelo celular, não precisa digitar
  // nome e aniversário de novo (e não vira um cadastro duplicado).
  const [lookup, setLookup] = useState<
    | { status: 'idle' | 'checking' | 'new' }
    | { status: 'found'; name: string; stamps: number; hasBirthday: boolean }
  >({ status: 'idle' });
  const [notMe, setNotMe] = useState(false);
  const phoneDigits = normalizePhone(phone);
  const [phoneBlurred, setPhoneBlurred] = useState(false);
  const typedDigits = phone.replace(/\D/g, '').length;
  // Avisa assim que a pessoa sai do campo com um número incompleto (ou
  // quando já digitou 10+ dígitos e eles não formam um celular).
  const phoneTouchedInvalid =
    !phoneDigits && (typedDigits >= 10 || (phoneBlurred && typedDigits > 0));
  const known = lookup.status === 'found' && !notMe ? lookup : null;
  const needsName = !known;
  const needsBirthday = !known || !known.hasBirthday;

  useEffect(() => {
    setNotMe(false);
    if (!phoneDigits || !bakeryId) {
      setLookup({ status: 'idle' });
      return;
    }
    let cancelled = false;
    setLookup({ status: 'checking' });
    const timer = setTimeout(() => {
      void fetch(
        `/api/customers/lookup?bakeryId=${encodeURIComponent(bakeryId)}&phone=${phoneDigits}`,
      )
        .then((res) => (res.ok ? res.json() : null))
        .then(
          (
            data: { found: boolean; name?: string; stamps?: number; hasBirthday?: boolean } | null,
          ) => {
            if (cancelled) return;
            setLookup(
              data?.found
                ? {
                    status: 'found',
                    name: data.name ?? '',
                    stamps: data.stamps ?? 0,
                    hasBirthday: Boolean(data.hasBirthday),
                  }
                : { status: 'new' },
            );
          },
        )
        .catch(() => !cancelled && setLookup({ status: 'new' }));
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [phoneDigits, bakeryId]);

  useEffect(() => {
    if (!bakeryId) return;
    const menu = fetch(`/api/data/doce-menu?bakeryId=${encodeURIComponent(bakeryId)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { value: MenuItem[] } | null) => {
        if (data?.value?.length) setItems(data.value);
      });
    void fetch(
      `/api/data/doce-bakery-profile?bakeryId=${encodeURIComponent(bakeryId)}`,
    )
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { value: BakeryProfile } | null) => {
        if (data?.value) setBakery(data.value);
      });
    const periodo = fetch(`/api/data/doce-menu-periodo?bakeryId=${encodeURIComponent(bakeryId)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { value: MenuPeriod } | null) => {
        if (data?.value?.from) setPeriod(data.value);
      });
    // Só decide se há ou não cardápio depois que os dois chegaram — evita
    // piscar a página de "sem cardápio" enquanto carrega.
    void Promise.allSettled([menu, periodo]).then(() => setLoaded(true));
  }, [bakeryId]);

  const available = items.filter((item) => item.available);
  const categories = [
    'Todos',
    ...Array.from(new Set(available.map((item) => item.category))),
  ];
  const visible =
    category === 'Todos'
      ? available
      : available.filter((item) => item.category === category);
  const cartItems = useMemo(
    () =>
      available
        .filter((item) => cart[item.id])
        .map((item) => ({ ...item, quantity: cart[item.id] })),
    [available, cart],
  );
  const totalItems = cartItems.reduce((sum, item) => sum + item.quantity, 0);
  const total = cartItems.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0,
  );
  const changeValue = Number(cashChange);
  const invalidChange =
    payment === 'Dinheiro na entrega' &&
    cashChange !== '' &&
    (!Number.isFinite(changeValue) || changeValue < total);
  const changeQuantity = (id: number, delta: number) => {
    setCart((old) => {
      const next = Math.max(0, (old[id] ?? 0) + delta);
      const updated = { ...old, [id]: next };
      if (!next) delete updated[id];
      return updated;
    });
  };
  const createOrder = async (paymentDetails: string, status: string) => {
    const description = cartItems
      .map((item) => `${item.quantity}× ${menuLabel(item)}`)
      .join(', ');
    const details = `${description} • Pagamento: ${paymentDetails}${notes.trim() ? ` • ${notes.trim()}` : ''}`;
    const response = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bakeryId,
        // Cliente reconhecido pelo celular: o nome vem do cadastro.
        customer: needsName ? customer.trim() : '',
        phone: phoneDigits,
        // "Não é você?": mesmo celular, outra pessoa (ex.: telefone da família).
        ...(notMe ? { newCustomer: true } : {}),
        ...(needsBirthday && birthday ? { birthday } : {}),
        items: cartItems.map((item) => ({
          name: menuLabel(item),
          quantity: item.quantity,
        })),
        item: details,
        // Só a data de entrega vem do cliente — sem horário, a confeitaria
        // combina isso depois diretamente com ele. Sem data (deliveryDate
        // vazio), o pedido não entra nas métricas do mês.
        deliveryDate,
        date: deliveryDate.split('-').reverse().join('/'),
        status,
      }),
    });
    if (!response.ok) throw new Error('order_failed');
    const data = (await response.json()) as {
      order: SavedOrder;
      stamps?: number;
    };
    setStamps(data.stamps ?? 0);
    return data.order;
  };
  const resetForm = () => {
    setCart({});
    setCustomer('');
    setPhone('');
    setBirthday('');
    setLookup({ status: 'idle' });
    setNotMe(false);
    setDeliveryDate('');
    setNotes('');
    setPayment('');
    setDeliveryCardType('Crédito');
    setCashChange('');
  };
  const finishOrder = async () => {
    if (
      !phoneDigits ||
      (needsName && !customer.trim()) ||
      (needsBirthday && !birthday) ||
      !deliveryDate ||
      !cartItems.length ||
      !payment ||
      invalidChange
    )
      return;
    setPaymentError('');

    const paymentDetails =
      payment === 'Cartão na entrega'
        ? `${payment} (${deliveryCardType})`
        : payment === 'Dinheiro na entrega' && cashChange
          ? `${payment} • Troco para ${money(changeValue)}`
          : payment;
    try {
      const order = await createOrder(paymentDetails, 'Novo');
      setSuccess(order.id);
      resetForm();
    } catch {
      setPaymentError(
        'Não foi possível registrar o pedido agora. Tente novamente em instantes.',
      );
    }
  };

  // Sem cardápio publicado para agora: nada disponível, ou o período
  // informado no app já terminou. Em vez de um cardápio vazio ou antigo, a
  // pessoa vê uma página explicando e com os contatos da confeitaria.
  const lastPeriodDay = period ? periodEnd(period) : null;
  const periodOver = lastPeriodDay != null && lastPeriodDay < todayIso();
  if (loaded && !success && (available.length === 0 || periodOver)) {
    const contacts = [
      bakery?.whatsapp && {
        href: `https://wa.me/${bakery.whatsapp.replace(/\D/g, '')}`,
        label: 'Chamar no WhatsApp',
        Icon: MessageCircle,
        primary: true,
      },
      bakery?.instagram && {
        href: `https://instagram.com/${bakery.instagram.replace(/^@/, '')}`,
        label: `@${bakery.instagram.replace(/^@/, '')} no Instagram`,
        Icon: Camera,
        primary: false,
      },
    ].filter(Boolean) as { href: string; label: string; Icon: typeof Camera; primary: boolean }[];
    return (
      <main id="conteudo" tabIndex={-1} className="flex min-h-screen flex-col bg-background text-foreground">
        <header className="vidro sticky top-0 z-30 border-b">
          <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:px-6">
            <span className="grid size-9 place-items-center overflow-hidden rounded-xl bg-primary text-lg text-primary-foreground">
              {bakery?.logo ? (
                <Image
                  src={bakery.logo}
                  alt={`Logotipo de ${bakery.name}`}
                  width={36}
                  height={36}
                  unoptimized
                  className="size-full object-cover"
                />
              ) : bakery?.icon ? (
                bakery.icon
              ) : (
                <Image src="/assets/brand/app-icon.svg" alt="Confeitto" width={40} height={40} unoptimized className="size-full" />
              )}
            </span>
            <p className="font-heading text-lg font-bold leading-none">
              {bakery?.name || 'Confeitaria'}
            </p>
            <PreferenciasAcessibilidade className="ml-auto" />
          </div>
        </header>
        <section className="flex flex-1 items-center justify-center px-5 py-16">
          <div className="w-full max-w-md text-center">
            <span className="mx-auto grid size-20 place-items-center rounded-full bg-primary/10 text-primary">
              <CalendarDays className="size-9" aria-hidden="true" />
            </span>
            <h1 className="mt-6 font-heading text-[1.75rem] font-bold leading-tight sm:text-[2.125rem]">
              {periodOver ? 'Esse cardápio já encerrou' : 'Cardápio da semana em preparo'}
            </h1>
            <p className="mt-3 text-base text-muted-foreground">
              {periodOver && period
                ? `O ${periodLabel(period).toLowerCase()} terminou e o próximo ainda não foi publicado.`
                : 'Ainda não publicamos o cardápio desta semana.'}{' '}
              Volte em breve{contacts.length ? ' ou fale com a gente para encomendas' : ''}.
            </p>
            {contacts.length > 0 && (
              <div className="mt-8 grid gap-3">
                {contacts.map(({ href, label, Icon, primary }) => (
                  <a
                    key={href}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`inline-flex h-12 items-center justify-center gap-2 rounded-xl px-5 text-[0.9375rem] font-semibold transition active:scale-[0.98] ${primary ? 'bg-primary text-primary-foreground hover:bg-primary/90' : 'bg-secondary text-foreground hover:bg-muted'}`}
                  >
                    <Icon className="size-5" aria-hidden="true" />
                    {label}
                  </a>
                ))}
              </div>
            )}
          </div>
        </section>
      </main>
    );
  }

  return (
    <main id="conteudo" tabIndex={-1} className="min-h-screen bg-background text-foreground">
      <header className="vidro sticky top-0 z-30 border-b">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:px-6">
          <span className="grid size-9 place-items-center overflow-hidden rounded-xl bg-primary text-lg text-primary-foreground">
            {bakery?.logo ? (
              <Image
                src={bakery.logo}
                alt={`Logotipo de ${bakery.name}`}
                width={36}
                height={36}
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
            <p className="font-heading text-lg font-bold leading-none">
              {bakery?.name || 'Confeitaria'}
            </p>
            <p className="text-[11px] text-muted-foreground">
              Doces artesanais
            </p>
          </div>
          <Badge variant="secondary" className="ml-auto hidden sm:inline-flex">
            Cardápio online
          </Badge>
          <PreferenciasAcessibilidade className="ml-auto sm:ml-0" />
        </div>
      </header>
      <section className="relative min-h-[320px] overflow-hidden">
        <Image
          src="/assets/cardapio-doces.webp"
          alt="Seleção artesanal de bolo, brigadeiros e torta"
          fill
          priority
          sizes="100vw"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-[#2f1245]/95 via-[#4a1f68]/70 to-transparent" />
        <div className="relative mx-auto flex min-h-[320px] max-w-7xl items-center px-5 py-10 sm:px-8">
          <div className="max-w-xl text-white">
            <Badge className="mb-4 bg-white/15 text-white backdrop-blur">
              {period ? periodLabel(period) : 'Cardápio online'}
            </Badge>
            <h1 className="font-heading text-4xl font-bold leading-tight sm:text-5xl">
              Um carinho doce para cada ocasião.
            </h1>
            <p className="mt-4 max-w-lg text-sm leading-relaxed text-white/80">
              Escolha seus doces, ajuste as quantidades e defina como prefere
              pagar. Produção artesanal com 48 horas de antecedência.
            </p>
          </div>
        </div>
      </section>

      <div className="mx-auto grid max-w-7xl gap-7 px-4 py-8 sm:px-6 lg:grid-cols-[minmax(0,1fr)_22.5rem]">
        <section>
          <div className="mb-6 flex gap-2 overflow-x-auto pb-1">
            {categories.map((item) => (
              <button
                key={item}
                onClick={() => setCategory(item)}
                className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition ${category === item ? 'bg-primary text-primary-foreground' : 'border bg-card hover:border-primary/50'}`}
              >
                {item}
              </button>
            ))}
          </div>
          {visible.length === 0 && (
            <div className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">
              Nenhum produto publicado ainda. Volte em breve!
            </div>
          )}
          <div className="divide-y rounded-2xl border bg-card">
            {visible.map((item) => (
              <article
                key={item.id}
                className="flex items-center gap-4 p-4 sm:p-5"
              >
                {item.photoUrl ? (
                  <Image
                    src={item.photoUrl}
                    alt={menuLabel(item)}
                    width={48}
                    height={48}
                    unoptimized
                    className="size-12 shrink-0 rounded-2xl object-cover"
                  />
                ) : (
                  <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-secondary text-3xl">
                    {item.emoji}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <h3 className="font-heading text-lg font-bold leading-snug [overflow-wrap:anywhere] sm:text-xl">
                    {item.name}
                  </h3>
                  {item.flavor && (
                    <p className="text-base font-medium leading-snug text-foreground/75 [overflow-wrap:anywhere]">
                      {item.flavor}
                    </p>
                  )}
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {item.category}
                    {item.weight
                      ? ` • ${item.weight.value}${item.weight.unit}`
                      : ''}
                  </p>
                  <p className="mt-1 font-heading text-base font-bold text-primary sm:hidden">
                    {money(item.price)}
                  </p>
                </div>
                <p className="hidden shrink-0 font-heading text-lg font-bold text-primary sm:block">
                  {money(item.price)}
                </p>
                <div className="shrink-0">
                  {cart[item.id] ? (
                    <div className="flex items-center gap-1 rounded-xl border p-1">
                      <Button
                        onClick={() => changeQuantity(item.id, -1)}
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Diminuir ${menuLabel(item)}`}
                      >
                        <Minus />
                      </Button>
                      <strong className="w-6 text-center text-sm">
                        {cart[item.id]}
                      </strong>
                      <Button
                        onClick={() => changeQuantity(item.id, 1)}
                        size="icon-sm"
                        aria-label={`Adicionar ${menuLabel(item)}`}
                      >
                        <Plus />
                      </Button>
                    </div>
                  ) : (
                    <Button
                      size="icon-sm"
                      onClick={() => changeQuantity(item.id, 1)}
                      aria-label={`Adicionar ${menuLabel(item)}`}
                    >
                      <Plus />
                    </Button>
                  )}
                </div>
              </article>
            ))}
          </div>
        </section>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <section className="overflow-hidden rounded-2xl border bg-card shadow-lg">
            <div className="flex items-center gap-3 border-b p-5">
              <span className="grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground">
                <ShoppingBag />
              </span>
              <div>
                <h2 className="font-heading text-lg font-bold">Seu pedido</h2>
                <p className="text-xs text-muted-foreground">
                  {totalItems} {totalItems === 1 ? 'item' : 'itens'} no carrinho
                </p>
              </div>
            </div>
            {success ? (
              <div className="p-7 text-center">
                <CheckCircle2 className="mx-auto size-12 text-green-600" />
                <h3 className="mt-4 font-heading text-xl font-bold">
                  Pedido recebido!
                </h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  Recebemos o pedido <strong>{success}</strong>. A confeitaria
                  entrará em contato para confirmar a disponibilidade.
                </p>
                {(
                  <div className="mt-5 overflow-hidden rounded-2xl text-left">
                    <div className="bg-gradient-to-br from-[#4f1f6e] to-[#a374c9] p-5 text-white">
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-white/70">
                          Cartão fidelidade
                        </p>
                        <Gift className="size-5" />
                      </div>
                      <div className="mt-4 grid grid-cols-5 gap-2">
                        {Array.from({ length: 10 }, (_, i) => (
                          <span
                            key={i}
                            className={`grid aspect-square place-items-center rounded-full border text-xs ${i < stamps ? 'border-white bg-white text-primary' : 'border-white/40 text-white/50'}`}
                          >
                            {i < stamps ? (
                              <CheckCircle2 className="size-3" />
                            ) : (
                              i + 1
                            )}
                          </span>
                        ))}
                      </div>
                      <p className="mt-4 text-xs text-white/75">
                        {stamps >= 10
                          ? 'Desconto de 10% liberado! Combine com a confeitaria.'
                          : stamps === 0
                            ? 'Seu cartão está pronto: cada pedido entregue vale selo. Com 10 selos, 10% de desconto.'
                            : `Faltam ${10 - stamps} selos para 10% de desconto`}
                      </p>
                    </div>
                  </div>
                )}
                <Button className="mt-5" onClick={() => setSuccess('')}>
                  Fazer outro pedido
                </Button>
              </div>
            ) : (
              <>
                <div className="max-h-[280px] divide-y overflow-y-auto">
                  {cartItems.map((item) => (
                    <div key={item.id} className="flex items-center gap-3 p-4">
                      <span className="text-2xl">{item.emoji}</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold [overflow-wrap:anywhere]">
                          {item.name}
                          {item.flavor && (
                            <span className="block font-normal text-muted-foreground">
                              {item.flavor}
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {item.quantity} × {money(item.price)}
                        </p>
                      </div>
                      <strong className="text-sm">
                        {money(item.price * item.quantity)}
                      </strong>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Remover ${menuLabel(item)}`}
                        onClick={() => {
                          setCart((old) => {
                            const next = { ...old };
                            delete next[item.id];
                            return next;
                          });
                        }}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  ))}
                  {!cartItems.length && (
                    <div className="p-8 text-center">
                      <ShoppingBag className="mx-auto size-9 text-muted-foreground/50" />
                      <p className="mt-3 text-sm font-medium">
                        Seu carrinho está vazio
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Adicione um ou mais doces para começar.
                      </p>
                    </div>
                  )}
                </div>
                <div className="space-y-4 border-t p-5">
                  <label className="grid gap-1.5 text-xs font-semibold text-muted-foreground">
                    Seu WhatsApp (celular)
                    <input
                      required
                      type="tel"
                      inputMode="numeric"
                      autoComplete="tel-national"
                      value={phone}
                      maxLength={16}
                      onChange={(e) => setPhone(formatPhone(e.target.value))}
                      onBlur={() => setPhoneBlurred(true)}
                      aria-invalid={phoneTouchedInvalid}
                      aria-describedby="telefone-ajuda"
                      className="h-10 rounded-xl border bg-background px-3 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 aria-[invalid=true]:border-destructive"
                      placeholder="(11) 91234-5678"
                    />
                  </label>
                  <p id="telefone-ajuda" aria-live="polite" className="-mt-2 text-xs">
                    {phoneTouchedInvalid ? (
                      <span className="font-semibold text-destructive">
                        Confira o número: DDD + 9 dígitos, começando com 9.
                      </span>
                    ) : lookup.status === 'checking' ? (
                      <span className="text-muted-foreground">Procurando seu cadastro…</span>
                    ) : known ? null : (
                      <span className="text-muted-foreground">
                        Usamos o celular para o seu cartão fidelidade.
                      </span>
                    )}
                  </p>
                  {known && (
                    <div className="flex items-start gap-3 rounded-xl bg-secondary p-3 text-secondary-foreground">
                      <Gift className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
                      <div className="min-w-0 text-sm">
                        <p className="font-semibold">Que bom te ver de novo, {known.name}!</p>
                        <p className="text-xs">
                          Você tem {known.stamps} {known.stamps === 1 ? 'selo' : 'selos'} no cartão
                          fidelidade. Este pedido entra no mesmo cartão.
                        </p>
                        <button
                          type="button"
                          onClick={() => setNotMe(true)}
                          className="mt-1 text-xs font-semibold underline underline-offset-2"
                        >
                          Não é você?
                        </button>
                      </div>
                    </div>
                  )}
                  {needsName && (
                    <label className="grid gap-1.5 text-xs font-semibold text-muted-foreground">
                      Seu nome
                      <input
                        required
                        value={customer}
                        maxLength={120}
                        autoComplete="name"
                        onChange={(e) => setCustomer(e.target.value)}
                        className="h-10 rounded-xl border bg-background px-3 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
                        placeholder="Nome para o pedido"
                      />
                    </label>
                  )}
                  {needsBirthday && (
                    <label className="grid gap-1.5 text-xs font-semibold text-muted-foreground">
                      Data de aniversário
                      <input
                        required
                        type="date"
                        value={birthday}
                        onChange={(e) => setBirthday(e.target.value)}
                        className="h-10 rounded-xl border bg-background px-3 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
                      />
                    </label>
                  )}
                  <label className="grid gap-1.5 text-xs font-semibold text-muted-foreground">
                    Data da entrega
                    <span className="relative">
                      <CalendarDays className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                      <input
                        required
                        type="date"
                        value={deliveryDate}
                        onChange={(e) => setDeliveryDate(e.target.value)}
                        className="h-10 w-full rounded-xl border bg-background pl-9 pr-2 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
                      />
                    </span>
                  </label>
                  <label className="grid gap-1.5 text-xs font-semibold text-muted-foreground">
                    Observações
                    <textarea
                      value={notes}
                      maxLength={500}
                      onChange={(e) => setNotes(e.target.value)}
                      className="min-h-20 rounded-xl border bg-background p-3 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
                      placeholder="Sabor, decoração, restrições..."
                    />
                  </label>
                  <fieldset className="space-y-2">
                    <legend className="mb-2 text-xs font-semibold text-muted-foreground">
                      Forma de pagamento
                    </legend>
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        type="button"
                        onClick={() => setPayment('Pix')}
                        className={`min-w-0 rounded-xl border p-3 text-left [overflow-wrap:anywhere] transition ${payment === 'Pix' ? 'border-primary bg-primary/5 ring-2 ring-primary/15' : 'hover:border-primary/40'}`}
                      >
                        <QrCode className="mb-2 size-5" />
                        <span className="block text-sm font-semibold">
                          Pix
                        </span>
                      </button>
                      <button
                        type="button"
                        disabled
                        title="Em breve"
                        className="cursor-not-allowed min-w-0 rounded-xl border p-3 text-left [overflow-wrap:anywhere] opacity-50"
                      >
                        <CreditCard className="mb-2 size-5" />
                        <span className="block text-sm font-semibold">
                          Cartão
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          Em breve
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setPayment('Dinheiro na entrega')}
                        className={`min-w-0 rounded-xl border p-3 text-left [overflow-wrap:anywhere] transition ${payment === 'Dinheiro na entrega' ? 'border-primary bg-primary/5 ring-2 ring-primary/15' : 'hover:border-primary/40'}`}
                      >
                        <Banknote className="mb-2 size-5" />
                        <span className="block text-sm font-semibold">
                          Dinheiro
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          Na entrega
                        </span>
                      </button>
                    </div>
                    {payment === 'Pix' && (
                      <p className="rounded-xl bg-secondary/50 p-3 text-xs font-semibold text-secondary-foreground">
                        A confeitaria vai te enviar a chave Pix para pagamento
                        ao confirmar o pedido.
                      </p>
                    )}
                  </fieldset>
                  {paymentError && (
                    <p role="alert" className="text-xs font-semibold text-destructive">
                      {paymentError}
                    </p>
                  )}
                  {payment === 'Cartão na entrega' && (
                    <label className="grid gap-1.5 rounded-xl bg-secondary/50 p-3 text-xs font-semibold text-secondary-foreground">
                      Tipo do cartão
                      <select
                        value={deliveryCardType}
                        onChange={(e) =>
                          setDeliveryCardType(
                            e.target.value as 'Crédito' | 'Débito',
                          )
                        }
                        className="h-10 rounded-xl border bg-background px-3 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
                      >
                        <option>Crédito</option>
                        <option>Débito</option>
                      </select>
                    </label>
                  )}
                  {payment === 'Dinheiro na entrega' && (
                    <label className="grid gap-1.5 rounded-xl bg-secondary/50 p-3 text-xs font-semibold text-secondary-foreground">
                      Precisa de troco? Informe para quanto (opcional)
                      <input
                        type="number"
                        min={total}
                        step="0.01"
                        inputMode="decimal"
                        value={cashChange}
                        onChange={(e) => setCashChange(e.target.value)}
                        className="h-10 rounded-xl border bg-background px-3 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
                        placeholder={`Ex.: ${Math.ceil(total / 10) * 10},00`}
                      />
                      {invalidChange && (
                        <span className="text-destructive">
                          O valor para troco deve ser igual ou maior que o
                          total.
                        </span>
                      )}
                    </label>
                  )}
                  <div className="flex items-center justify-between border-t pt-4">
                    <span className="text-sm text-muted-foreground">Total</span>
                    <strong className="font-heading text-2xl text-primary">
                      {money(total)}
                    </strong>
                  </div>
                  <Button
                    onClick={() => void finishOrder()}
                    disabled={
                      !cartItems.length ||
                      !phoneDigits ||
                      lookup.status === 'checking' ||
                      (needsName && !customer.trim()) ||
                      (needsBirthday && !birthday) ||
                      !deliveryDate ||
                      !payment ||
                      invalidChange
                    }
                    className="h-11 w-full rounded-xl"
                  >
                    <ShoppingBag />
                    Confirmar pedido
                  </Button>
                  <p className="text-center text-[11px] text-muted-foreground">
                    A confeitaria combina com você o horário de entrega
                    depois de receber o pedido.
                  </p>
                </div>
              </>
            )}
          </section>
        </aside>
      </div>
    </main>
  );
}
