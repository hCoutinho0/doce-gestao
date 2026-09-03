import { NextResponse } from 'next/server';
import { MercadoPagoConfig, Preference } from 'mercadopago';

type CheckoutItem = {
  title: string;
  quantity: number;
  unitPrice: number;
};

// Card, Pix and wallet data are typed by the customer on Mercado Pago's own
// hosted Checkout Pro page — this server only ever sees the order total and
// description, never card numbers or CVVs. Keeps the app out of PCI-DSS
// scope entirely instead of trying to comply with it.
export async function POST(request: Request) {
  const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!accessToken) {
    return NextResponse.json(
      { error: 'Gateway de pagamento não configurado.' },
      { status: 503 },
    );
  }

  const body = (await request.json()) as {
    orderId?: string;
    items?: CheckoutItem[];
  };

  if (!body.orderId || !body.items?.length) {
    return NextResponse.json({ error: 'Pedido inválido.' }, { status: 400 });
  }

  for (const item of body.items) {
    if (
      typeof item.title !== 'string' ||
      !Number.isFinite(item.quantity) ||
      item.quantity <= 0 ||
      !Number.isFinite(item.unitPrice) ||
      item.unitPrice <= 0
    ) {
      return NextResponse.json({ error: 'Item inválido.' }, { status: 400 });
    }
  }

  const client = new MercadoPagoConfig({ accessToken });
  const preference = new Preference(client);

  const origin = new URL(request.url).origin;

  try {
    const result = await preference.create({
      body: {
        external_reference: body.orderId,
        items: body.items.map((item, index) => ({
          id: String(index),
          title: item.title,
          quantity: item.quantity,
          unit_price: item.unitPrice,
          currency_id: 'BRL',
        })),
        back_urls: {
          success: `${origin}/?pedido=${encodeURIComponent(body.orderId)}&status=aprovado`,
          pending: `${origin}/?pedido=${encodeURIComponent(body.orderId)}&status=pendente`,
          failure: `${origin}/?pedido=${encodeURIComponent(body.orderId)}&status=recusado`,
        },
        auto_return: 'approved',
        notification_url: `${origin}/api/checkout/webhook`,
      },
    });

    if (!result.init_point) {
      throw new Error('missing_init_point');
    }

    return NextResponse.json({ initPoint: result.init_point });
  } catch (error) {
    console.error('Falha ao criar preferência no Mercado Pago', error);
    return NextResponse.json(
      { error: 'Não foi possível iniciar o pagamento.' },
      { status: 502 },
    );
  }
}
