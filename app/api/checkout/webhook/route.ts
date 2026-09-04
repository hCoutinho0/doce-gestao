import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { MercadoPagoConfig, Payment } from 'mercadopago';
import { isCosmosConfigured, readState, writeState, LAVILY_BAKERY_ID } from '@/lib/cosmos';

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

export async function POST(request: Request) {
  const url = new URL(request.url);
  const dataId =
    url.searchParams.get('data.id') ?? url.searchParams.get('id') ?? '';
  const type = url.searchParams.get('type');

  if (
    process.env.MERCADOPAGO_WEBHOOK_SECRET &&
    !isValidSignature(request, dataId)
  ) {
    return NextResponse.json({ error: 'invalid_signature' }, { status: 401 });
  }

  if (type !== 'payment' || !dataId) {
    return NextResponse.json({ received: true });
  }

  const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!accessToken || !isCosmosConfigured()) {
    return NextResponse.json({ received: true });
  }

  try {
    const payment = await new Payment(
      new MercadoPagoConfig({ accessToken }),
    ).get({ id: dataId });

    const orderId = payment.external_reference;
    const label = payment.status ? STATUS_LABELS[payment.status] : undefined;
    if (!orderId || !label) return NextResponse.json({ received: true });

    const orders = ((await readState<Order[]>(LAVILY_BAKERY_ID, ORDERS_KEY)) ??
      []) as Order[];
    const updated = orders.map((order) =>
      order.id === orderId ? { ...order, status: label } : order,
    );
    await writeState(LAVILY_BAKERY_ID, ORDERS_KEY, updated);
  } catch (error) {
    console.error('Falha ao processar notificação do Mercado Pago', error);
  }

  return NextResponse.json({ received: true });
}
