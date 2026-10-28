'use client';

import { MessageCircle, MoreHorizontal, Printer, Tag } from 'lucide-react';
import { imprimirComanda, imprimirEtiqueta } from '@/lib/imprimir';
import { MODELOS, mensagemPedido, waLink } from '@/lib/whatsapp';
import type { Order } from '@/lib/tipos';

const item =
  'flex min-h-11 w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-muted focus-visible:bg-muted focus-visible:outline-none';

// Menu "mais ações" de um pedido: mensagens prontas de WhatsApp e impressão.
export function AcoesPedido({ order, confeitaria }: { order: Order; confeitaria: string }) {
  return (
    <details className="relative">
      <summary
        aria-label={`Mais ações do pedido ${order.id}`}
        className="inline-flex size-8 shrink-0 cursor-pointer list-none items-center justify-center rounded-lg border bg-background hover:bg-muted [&::-webkit-details-marker]:hidden"
      >
        <MoreHorizontal className="size-4" />
      </summary>
      <div className="absolute right-0 z-30 mt-1 w-56 rounded-xl border bg-popover p-1 text-popover-foreground shadow-lg">
        {order.phone ? (
          MODELOS.map((m) => (
            <a
              key={m.id}
              className={item}
              href={waLink(order.phone, mensagemPedido(m.id, order, confeitaria))}
              target="_blank"
              rel="noopener noreferrer"
            >
              <MessageCircle className="size-4 text-[#25a05a]" aria-hidden="true" /> {m.rotulo}
            </a>
          ))
        ) : (
          <p className="px-3 py-2 text-xs text-muted-foreground">Sem celular cadastrado para WhatsApp.</p>
        )}
        <div className="my-1 border-t" />
        <button type="button" className={item} onClick={() => imprimirComanda(order, confeitaria)}>
          <Printer className="size-4" aria-hidden="true" /> Imprimir comanda
        </button>
        <button type="button" className={item} onClick={() => imprimirEtiqueta(order, confeitaria)}>
          <Tag className="size-4" aria-hidden="true" /> Imprimir etiqueta
        </button>
      </div>
    </details>
  );
}
