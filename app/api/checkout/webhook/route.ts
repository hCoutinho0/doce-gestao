import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { MercadoPagoConfig, Payment } from 'mercadopago';
import { isDbConfigured, updateStateAtomic } from '@/lib/db';

type Order = {
  id: string;
  customer: string;
  item: string;
  date: string;
  value: number;
  status: string;
};

const ORDERS_KEY = 'doce-orders';

const STATUS_LABELS: Record<string, string> = {
  approved: 'Pago',
  pending: 'Aguardando pagamento',
  in_process: 'Aguardando pagamento',
  rejected: 'Pagamento recusado',
  cancelled: 'Cancelado',
  refunded: 'Reembolsado',
};

// Mercado Pago calls this after a payment changes status. Validate the
// signature so we only trust notifications that actually came from Mercado
// Pago, per https://www.mercadopago.com.br/developers/en/docs/checkout-api/webhooks
function isValidSignature(request: Request, dataId: string): boolean {
  const secret = process.env.MERCADOPAGO_WEBHOOK_SECRET;
  const signatureHeader = request.headers.get('x-signature');
  const requestId = request.headers.get('x-request-id');
  if (!secret || !signatureHeader || !requestId) return false;

  const parts = Object.fromEntries(
    signatureHeader.split(',').map((part) => {
      const [key, value] = part.split('=');
      return [key?.trim(), value?.trim()];
    }),
  );
  const ts = parts.ts;
  const hash = parts.v1;
  if (!ts || !hash) return false;

  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(manifest)
    .digest('hex');

  const a = Buffer.from(expected);
  const b = Buffer.from(hash);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// O pedido é identificado pelo external_reference "{confeitaria}:{pedido}"
// gravado em /api/checkout/preference — assim cada pagamento atualiza o
// pedido da confeitaria certa.
export async function POST(request: Request) {
  const url = new URL(request.url);
  const dataId =
    url.searchParams.get('data.id') ?? url.searchParams.get('id') ?? '';
  const type = url.searchParams.get('type');

  // Fails closed: isValidSignature already returns false when the secret
  // itself isn't configured, so a missing MERCADOPAGO_WEBHOOK_SECRET
  // rejects every request instead of silently skipping validation — a
  // payment id isn't secret (it appears in redirect URLs/emails), so an
  // unvalidated caller could otherwise force an order's status to flip.
  if (!isValidSignature(request, dataId)) {
    return NextResponse.json({ error: 'invalid_signature' }, { status: 401 });
  }

  if (type !== 'payment' || !dataId) {
    return NextResponse.json({ received: true });
  }

  const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!accessToken || !isDbConfigured()) {
    return NextResponse.json({ received: true });
  }

  try {
    const payment = await new Payment(
      new MercadoPagoConfig({ accessToken }),
    ).get({ id: dataId });

    const reference = payment.external_reference ?? '';
    const separator = reference.lastIndexOf(':');
    const bakeryId = separator > 0 ? reference.slice(0, separator) : '';
    const orderId = separator > 0 ? reference.slice(separator + 1) : '';
    const label = payment.status ? STATUS_LABELS[payment.status] : undefined;
    if (!bakeryId || !orderId || !label) return NextResponse.json({ received: true });

    await updateStateAtomic<Order[]>(bakeryId, ORDERS_KEY, (current) =>
      (current ?? []).map((order) =>
        order.id === orderId ? { ...order, status: label } : order,
      ),
    );
  } catch (error) {
    console.error('Falha ao processar notificação do Mercado Pago', error);
  }

  return NextResponse.json({ received: true });
}
