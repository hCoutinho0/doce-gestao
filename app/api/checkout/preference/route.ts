import { NextResponse } from 'next/server';
import { MercadoPagoConfig, Preference } from 'mercadopago';
import { isDbConfigured, readState } from '@/lib/db';
import { checkRateLimit, clientIp } from '@/lib/rateLimit';

type OrderItem = { name: string; quantity: number; unitPrice: number };
type Order = {
  id: string;
  items?: OrderItem[];
  value: number;
  paymentStatus?: 'Pago' | 'Pendente';
};

const ORDERS_KEY = 'doce-orders';

// Checkout Pro do Mercado Pago: os dados do cartão/Pix são digitados na
// página do próprio Mercado Pago — este servidor nunca vê número de cartão
// nem CVV (fica fora do escopo PCI-DSS).
//
// O cliente só informa QUAL pedido quer pagar (confeitaria + número). Itens
// e preços vêm do pedido já gravado no banco, que por sua vez foi
// precificado pelo servidor a partir do cardápio publicado — nunca do que o
// navegador mandar. (Antes, o preço vinha do navegador: dava para pagar
// R$ 0,01 por qualquer pedido.)
//
// Ainda usa um único MERCADOPAGO_ACCESS_TOKEN (a conta da confeitaria que
// usa o site). Para várias confeitarias, cada uma precisaria do próprio.
export async function POST(request: Request) {
  const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!accessToken || !isDbConfigured()) {
    return NextResponse.json(
      { error: 'Gateway de pagamento não configurado.' },
      { status: 503 },
    );
  }
  if (!(await checkRateLimit(`checkout:${clientIp(request)}`, 20, 60 * 60 * 1000))) {
    return NextResponse.json({ error: 'Muitas tentativas. Tente mais tarde.' }, { status: 429 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    bakeryId?: string;
    orderId?: string;
  };
  const bakeryId = body.bakeryId?.trim();
  const orderId = body.orderId?.trim();
  if (!bakeryId || !orderId || bakeryId.length > 64 || orderId.length > 32) {
    return NextResponse.json({ error: 'Pedido inválido.' }, { status: 400 });
  }

  const orders = (await readState<Order[]>(bakeryId, ORDERS_KEY)) ?? [];
  const order = orders.find((o) => o.id === orderId);
  if (!order || !order.items?.length || !(order.value > 0)) {
    return NextResponse.json({ error: 'Pedido não encontrado.' }, { status: 404 });
  }
  if (order.paymentStatus === 'Pago') {
    return NextResponse.json({ error: 'Este pedido já está pago.' }, { status: 409 });
  }

  const client = new MercadoPagoConfig({ accessToken });
  const preference = new Preference(client);
  const origin = new URL(request.url).origin;
  const back = (status: string) =>
    `${origin}/${encodeURIComponent(bakeryId)}?pedido=${encodeURIComponent(orderId)}&status=${status}`;

  try {
    const result = await preference.create({
      body: {
        // Volta no webhook para saber de qual confeitaria é o pedido.
        external_reference: `${bakeryId}:${orderId}`,
        items: order.items.map((item, index) => ({
          id: String(index),
          title: item.name.slice(0, 120),
          quantity: item.quantity,
          unit_price: item.unitPrice,
          currency_id: 'BRL',
        })),
        back_urls: {
          success: back('aprovado'),
          pending: back('pendente'),
          failure: back('recusado'),
        },
        auto_return: 'approved',
        notification_url: `${origin}/api/checkout/webhook`,
      },
    });

    if (!result.init_point) throw new Error('missing_init_point');
    return NextResponse.json({ initPoint: result.init_point });
  } catch (error) {
    console.error('Falha ao criar preferência no Mercado Pago', error);
    return NextResponse.json(
      { error: 'Não foi possível iniciar o pagamento.' },
      { status: 502 },
    );
  }
}
