'use client';

import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Empty, PageHeading, Panel, money } from '@/components/painel-ui';
import { AcoesPedido } from '@/components/acoes-pedido';
import { dayIsFull, isoDay, ordersOfDay, weekDays, weekStart } from '@/lib/agenda';
import { balanceDue } from '@/lib/orders';
import type { Order } from '@/lib/tipos';

const DIAS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];

// Visão semanal das entregas: o que sai em cada dia, por horário, e quantos
// pedidos já há contra o limite diário (Ajustes).
export function Agenda({
  orders,
  dailyLimit,
  confeitaria,
  onOpenOrders,
}: {
  orders: Order[];
  dailyLimit?: number;
  confeitaria: string;
  onOpenOrders: () => void;
}) {
  const [start, setStart] = useState(() => weekStart(new Date()));
  const days = useMemo(() => weekDays(start), [start]);
  const today = isoDay(new Date());
  const shift = (weeks: number) =>
    setStart((old) => new Date(old.getFullYear(), old.getMonth(), old.getDate() + weeks * 7));
  const label = `${new Date(days[0] + 'T12:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })} – ${new Date(days[6] + 'T12:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}`;
  const total = days.reduce((n, d) => n + ordersOfDay(orders, d).length, 0);

  return (
    <>
      <PageHeading
        title="Agenda"
        subtitle="Entregas da semana, dia a dia."
        action={
          <Button variant="outline" className="h-10 rounded-xl" onClick={onOpenOrders}>
            Ir para Pedidos
          </Button>
        }
      />
      <div className="mb-5 flex items-center justify-center gap-3">
        <Button variant="outline" size="icon-sm" aria-label="Semana anterior" onClick={() => shift(-1)}>
          <ChevronLeft />
        </Button>
        <p className="min-w-52 text-center font-heading font-bold">{label}</p>
        <Button variant="outline" size="icon-sm" aria-label="Próxima semana" onClick={() => shift(1)}>
          <ChevronRight />
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setStart(weekStart(new Date()))}>
          Hoje
        </Button>
      </div>
      {total === 0 && (
        <Panel className="mb-5">
          <Empty label="Nenhuma entrega agendada nesta semana." />
        </Panel>
      )}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {days.map((day, i) => {
          const list = ordersOfDay(orders, day);
          const full = dayIsFull(list.length, dailyLimit);
          return (
            <Panel key={day} className={`p-4 ${day === today ? 'ring-2 ring-primary/40' : ''}`}>
              <div className="mb-3 flex items-center justify-between gap-2">
                <div>
                  <p className="font-heading font-bold">{DIAS[i]}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(day + 'T12:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' })}
                    {day === today && ' · hoje'}
                  </p>
                </div>
                <span
                  className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${
                    full ? 'bg-destructive/10 text-destructive' : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {list.length}
                  {dailyLimit ? ` / ${dailyLimit}` : ''} {list.length === 1 ? 'pedido' : 'pedidos'}
                  {full ? ' · cheio' : ''}
                </span>
              </div>
              {list.length === 0 ? (
                <p className="py-4 text-center text-xs text-muted-foreground">Livre.</p>
              ) : (
                <ul className="space-y-2">
                  {list.map((o) => (
                    <li key={o.id} className="flex items-start gap-3 rounded-xl bg-muted/40 p-3">
                      <span className="font-nums w-12 shrink-0 text-sm font-bold">{o.deliveryTime ?? '—'}</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold [overflow-wrap:anywhere]">
                          {o.id} · {o.customer}
                        </p>
                        <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">{o.item}</p>
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          {o.status}
                          {o.paymentStatus === 'Pago'
                            ? ' · pago'
                            : ` · receber ${money(balanceDue(o))}`}
                        </p>
                      </div>
                      <AcoesPedido order={o} confeitaria={confeitaria} />
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          );
        })}
      </div>
    </>
  );
}
