'use client';

import { Cake, MessageCircle, TimerOff } from 'lucide-react';
import { Panel } from '@/components/painel-ui';
import { daysUntil, expiryStatus } from '@/lib/validade';
import { mensagemAniversario, waLink } from '@/lib/whatsapp';
import type { LoyaltyItem, StockItem } from '@/lib/tipos';

// Dias até o próximo aniversário (0 = hoje), a partir de yyyy-mm-dd.
function daysToBirthday(birthday: string, today: Date): number | null {
  const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(birthday);
  if (!m) return null;
  let next = new Date(today.getFullYear(), Number(m[1]) - 1, Number(m[2]));
  const base = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (next < base) next = new Date(today.getFullYear() + 1, Number(m[1]) - 1, Number(m[2]));
  return Math.round((next.getTime() - base.getTime()) / 86400000);
}

// Avisos da Visão geral: itens vencendo e aniversariantes da semana, com
// mensagem pronta de WhatsApp.
export function Lembretes({
  stock,
  customers,
  confeitaria,
}: {
  stock: StockItem[];
  customers: LoyaltyItem[];
  confeitaria: string;
}) {
  const today = new Date();
  const vencendo = stock
    .filter((s) => s.qty > 0 && ['vencido', 'vence-logo'].includes(expiryStatus(s.expiry, today)))
    .sort((a, b) => (daysUntil(a.expiry!, today) ?? 0) - (daysUntil(b.expiry!, today) ?? 0));
  const aniversarios = customers
    .map((c) => ({ c, d: c.birthday ? daysToBirthday(c.birthday, today) : null }))
    .filter((x): x is { c: LoyaltyItem; d: number } => x.d != null && x.d <= 7)
    .sort((a, b) => a.d - b.d);
  if (vencendo.length === 0 && aniversarios.length === 0) return null;
  return (
    <div className="grid gap-5 md:grid-cols-2">
      {vencendo.length > 0 && (
        <Panel className="p-5">
          <h2 className="font-heading flex items-center gap-2 font-bold">
            <TimerOff className="size-4 text-orange-600" aria-hidden="true" /> Validade no estoque
          </h2>
          <ul className="mt-3 space-y-2 text-sm">
            {vencendo.slice(0, 6).map((s) => {
              const d = daysUntil(s.expiry!, today) ?? 0;
              return (
                <li key={s.id} className="flex justify-between gap-3">
                  <span className="[overflow-wrap:anywhere]">{s.name}</span>
                  <strong className={d < 0 ? 'text-destructive' : 'text-orange-700'}>
                    {d < 0 ? `vencido há ${-d} d` : d === 0 ? 'vence hoje' : `vence em ${d} d`}
                  </strong>
                </li>
              );
            })}
          </ul>
        </Panel>
      )}
      {aniversarios.length > 0 && (
        <Panel className="p-5">
          <h2 className="font-heading flex items-center gap-2 font-bold">
            <Cake className="size-4 text-primary" aria-hidden="true" /> Aniversariantes da semana
          </h2>
          <ul className="mt-3 space-y-2 text-sm">
            {aniversarios.slice(0, 6).map(({ c, d }) => (
              <li key={c.id} className="flex items-center justify-between gap-3">
                <span className="[overflow-wrap:anywhere]">
                  {c.name}{' '}
                  <span className="text-xs text-muted-foreground">
                    {d === 0 ? 'hoje' : d === 1 ? 'amanhã' : `em ${d} dias`}
                  </span>
                </span>
                {c.phone ? (
                  <a
                    href={waLink(c.phone, mensagemAniversario(c.name, confeitaria))}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs font-medium hover:bg-muted"
                  >
                    <MessageCircle className="size-3.5 text-[#25a05a]" aria-hidden="true" /> Parabenizar
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}
