'use client';

import { useState } from 'react';
import { TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Field, inputClass, money } from '@/components/painel-ui';
import type { StockItem } from '@/lib/tipos';

const MOTIVOS = ['Venceu', 'Estragou', 'Caiu ou derramou', 'Erro de produção', 'Outro'];

// Dá baixa numa quantidade perdida e guarda o motivo e o custo (Relatórios).
export function RegistrarPerda({
  item,
  onConfirm,
}: {
  item: StockItem;
  onConfirm: (qty: number, reason: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [qty, setQty] = useState('1');
  const [reason, setReason] = useState(MOTIVOS[0]);
  const n = Number(qty.replace(',', '.'));
  const valid = Number.isFinite(n) && n > 0 && n <= item.qty;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={<Button variant="ghost" size="icon-sm" aria-label={`Registrar perda de ${item.name}`} title="Registrar perda" />}
      >
        <TriangleAlert />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registrar perda — {item.name}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <p className="text-xs text-muted-foreground">
            Em estoque: {item.qty} {item.unit}. A quantidade sai do estoque e o custo ({money(item.cost)} por{' '}
            {item.unit}) entra no relatório de perdas.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Quantidade perdida">
              <input inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} className={inputClass} />
            </Field>
            <Field label="Motivo">
              <select value={reason} onChange={(e) => setReason(e.target.value)} className={inputClass}>
                {MOTIVOS.map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
            </Field>
          </div>
          <Button
            disabled={!valid}
            className="justify-self-end rounded-xl"
            onClick={() => {
              onConfirm(n, reason);
              setOpen(false);
              setQty('1');
            }}
          >
            Registrar perda
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
