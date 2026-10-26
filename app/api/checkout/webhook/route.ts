import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { MercadoPagoConfig, Payment } from 'mercadopago';
import { isDbConfigured, updateStateAtomic, LAVILY_BAKERY_ID } from '@/lib/db';

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

  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(hash));
}

// Mercado Pago checkout is currently disabled in the UI (single shared
// access token — see app/[bakeryId]/cardapio/page.tsx) and this route is
// hardcoded to LAVILY_BAKERY_ID accordingly: it's dead code for every
// other confeitaria today, kept only so reactivating it later doesn't mean
// starting from scratch. Before turning it back on for anyone but Lavily,
// this needs a real bakeryId (e.g. round-tripped through the payment's
// external_reference / metadata) instead of the hardcoded constant below.
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

    const orderId = payment.external_reference;
    const label = payment.status ? STATUS_LABELS[payment.status] : undefined;
    if (!orderId || !label) return NextResponse.json({ received: true });

    await updateStateAtomic<Order[]>(LAVILY_BAKERY_ID, ORDERS_KEY, (current) =>
      (current ?? []).map((order) =>
        order.id === orderId ? { ...order, status: label } : order,
      ),
    );
  } catch (error) {
    console.error('Falha ao processar notificação do Mercado Pago', error);
  }

  return NextResponse.json({ received: true });
}
