'use client';

import Image from 'next/image';
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  Banknote,
  CakeSlice,
  CalendarDays,
  CheckCircle2,
  CreditCard,
  Gift,
  Minus,
  Plus,
  QrCode,
  ShoppingBag,
  Trash2,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { BakeryProfile } from '@/lib/bakery';

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

  useEffect(() => {
    if (!bakeryId) return;
    void fetch(`/api/data/doce-menu?bakeryId=${encodeURIComponent(bakeryId)}`)
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
      .map((item) => `${item.quantity}× ${item.name}`)
      .join(', ');
    const details = `${description} • Pagamento: ${paymentDetails}${notes.trim() ? ` • ${notes.trim()}` : ''}`;
    const response = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bakeryId,
        customer: customer.trim(),
        phone: phone.trim(),
        birthday,
        items: cartItems.map((item) => ({
          name: item.name,
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
    setDeliveryDate('');
    setNotes('');
    setPayment('');
    setDeliveryCardType('Crédito');
    setCashChange('');
  };
  const finishOrder = async () => {
    if (
      !customer.trim() ||
      !birthday ||
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

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b bg-background/90 backdrop-blur-xl">
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
              <CakeSlice className="size-5" />
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
          <Badge variant="secondary" className="ml-auto">
            Cardápio online
          </Badge>
        </div>
      </header>
      <section className="relative min-h-[320px] overflow-hidden">
        <Image
          src="/assets/cardapio-doces.png"
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
              Cardápio online
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

      <div className="mx-auto grid max-w-7xl gap-7 px-4 py-8 sm:px-6 lg:grid-cols-[minmax(0,1fr)_360px]">
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
                    alt={item.name}
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
                  <p className="truncate font-heading text-base font-bold sm:text-lg">
                    {item.name}
                  </p>
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
                        aria-label={`Diminuir ${item.name}`}
                      >
                        <Minus />
                      </Button>
                      <strong className="w-6 text-center text-sm">
                        {cart[item.id]}
                      </strong>
                      <Button
                        onClick={() => changeQuantity(item.id, 1)}
                        size="icon-sm"
                        aria-label={`Adicionar ${item.name}`}
                      >
                        <Plus />
                      </Button>
                    </div>
                  ) : (
                    <Button
                      size="icon-sm"
                      onClick={() => changeQuantity(item.id, 1)}
                      aria-label={`Adicionar ${item.name}`}
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
                {stamps > 0 && (
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
                        <p className="truncate text-sm font-semibold">
                          {item.name}
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
                        aria-label={`Remover ${item.name}`}
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
                    Seu nome
                    <input
                      value={customer}
                      onChange={(e) => setCustomer(e.target.value)}
                      className="h-10 rounded-xl border bg-background px-3 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
                      placeholder="Nome para o pedido"
                    />
                  </label>
                  <label className="grid gap-1.5 text-xs font-semibold text-muted-foreground">
                    WhatsApp (opcional)
                    <input
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="h-10 rounded-xl border bg-background px-3 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
                      placeholder="(11) 90000-0000"
                    />
                  </label>
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
                        className={`rounded-xl border p-3 text-left transition ${payment === 'Pix' ? 'border-primary bg-primary/5 ring-2 ring-primary/15' : 'hover:border-primary/40'}`}
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
                        className="cursor-not-allowed rounded-xl border p-3 text-left opacity-50"
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
                        className={`rounded-xl border p-3 text-left transition ${payment === 'Dinheiro na entrega' ? 'border-primary bg-primary/5 ring-2 ring-primary/15' : 'hover:border-primary/40'}`}
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
                    <p className="text-xs font-semibold text-destructive">
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
                      !customer.trim() ||
                      !birthday ||
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
