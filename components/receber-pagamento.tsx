'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Check, Copy, WalletCards } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Field, inputClass, money } from '@/components/painel-ui';
import { balanceDue } from '@/lib/orders';
import { pixPayload } from '@/lib/pix';
import type { Ajustes, Order } from '@/lib/tipos';

const METODOS = ['Pix', 'Cartão', 'Dinheiro', 'Presente'] as const;

// Registra um recebimento (sinal, parcela ou o saldo todo). No Pix mostra o
// QR Code e o copia e cola já com o valor.
export function ReceberPagamento({
  order,
  ajustes,
  confeitaria,
  onReceive,
}: {
  order: Order;
  ajustes: Ajustes;
  confeitaria: string;
  onReceive: (amount: number, method: Order['paymentMethod']) => Promise<void>;
}) {
  const due = balanceDue(order);
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<(typeof METODOS)[number]>(order.paymentMethod ?? 'Pix');
  const [qr, setQr] = useState('');
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);

  const value = Number(amount.replace(',', '.'));
  const valid = Number.isFinite(value) && value > 0;
  const payload =
    method === 'Pix' && ajustes.pixKey && valid
      ? pixPayload({
          chave: ajustes.pixKey,
          nome: ajustes.pixName || confeitaria,
          cidade: ajustes.pixCity || 'Brasil',
          valor: Math.min(value, due),
          txid: order.id,
        })
      : '';

  useEffect(() => {
    let cancelled = false;
    if (!payload) return;
    QRCode.toDataURL(payload, { margin: 1, width: 220 })
      .then((url) => !cancelled && setQr(url))
      .catch(() => !cancelled && setQr(''));
    return () => {
      cancelled = true;
    };
  }, [payload]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(payload);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Sem permissão de área de transferência: nada a fazer.
    }
  };

  const confirm = async () => {
    if (!valid) return;
    setSaving(true);
    await onReceive(Math.min(value, due), method);
    setSaving(false);
    setOpen(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setAmount(String(due));
      }}
    >
      <DialogTrigger render={<Button size="sm" variant="outline" className="h-8 rounded-lg" />}>
        <WalletCards /> Receber
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Receber — pedido {order.id}
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <p className="text-sm text-muted-foreground">
            {order.customer} · total {money(order.value)} · falta receber <strong>{money(due)}</strong>
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Valor recebido (R$)">
              <input
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="Forma de pagamento">
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value as (typeof METODOS)[number])}
                className={inputClass}
              >
                {METODOS.map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
            </Field>
          </div>
          {valid && value < due && (
            <p className="text-xs text-muted-foreground">
              Fica um saldo de {money(due - value)} a receber.
            </p>
          )}
          {method === 'Pix' &&
            (ajustes.pixKey ? (
              payload && qr && (
                <div className="flex flex-col items-center gap-2 rounded-xl bg-muted/40 p-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={qr} alt="QR Code do Pix" width={180} height={180} />
                  <Button type="button" size="sm" variant="outline" onClick={() => void copy()}>
                    {copied ? <Check /> : <Copy />} {copied ? 'Copiado' : 'Copiar Pix copia e cola'}
                  </Button>
                </div>
              )
            ) : (
              <p className="rounded-xl bg-muted/40 p-3 text-xs text-muted-foreground">
                Cadastre a chave Pix em Ajustes para mostrar o QR Code aqui.
              </p>
            ))}
          <Button onClick={() => void confirm()} disabled={!valid || saving} className="justify-self-end rounded-xl">
            Confirmar recebimento
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
