import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { isCosmosConfigured, readState, LAVILY_BAKERY_ID } from '@/lib/cosmos';
import { isWhatsAppConfigured, sendWhatsAppMessage } from '@/lib/whatsapp';

type Order = {
  id: string;
  customer: string;
  item: string;
  date: string;
  value: number;
  status: string;
};

const ORDERS_KEY = 'doce-orders';
const CARDAPIO_URL =
  process.env.NEXTAUTH_URL ?? 'https://SEU-DOMINIO';

// This bot is wired to one WhatsApp Business number (Lavily's own),
// hardcoded to LAVILY_BAKERY_ID accordingly — it always looks up and
// replies about Lavily's orders, regardless of who's texting. That's fine
// while only Lavily has this connected; if another confeitaria ever gets
// its own WhatsApp Business number, this needs a way to resolve which
// bakeryId a given incoming number belongs to instead of the constant
// below.

// Meta's handshake to confirm we own this webhook — required once, when
// the endpoint is registered in the Meta app dashboard.
export function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get('hub.mode');
  const token = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge');

  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new Response(challenge ?? '', { status: 200 });
  }
  return NextResponse.json({ error: 'verification_failed' }, { status: 403 });
}

// Every message WhatsApp forwards to us is signed with the app secret —
// reject anything that isn't, since this endpoint is public by necessity.
async function isValidSignature(request: Request, rawBody: string) {
  const secret = process.env.WHATSAPP_APP_SECRET;
  const signature = request.headers.get('x-hub-signature-256');
  if (!secret || !signature) return false;

  const expected =
    'sha256=' + crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);
  return (
    sigBuf.length === expBuf.length && crypto.timingSafeEqual(sigBuf, expBuf)
  );
}

async function replyTo(from: string, text: string) {
  if (!isWhatsAppConfigured()) return;
  try {
    await sendWhatsAppMessage(from, text);
  } catch (error) {
    console.error('Falha ao responder no WhatsApp', error);
  }
}

async function handleMessage(from: string, text: string) {
  const normalized = text.trim().toLowerCase();
  // Order numbers now start at 01 (previously always 4+ digits from
  // #2001), so any digit sequence counts as a candidate order number.
  const orderMatch = normalized.match(/(\d+)/);

  if (orderMatch && isCosmosConfigured()) {
    // Order ids are always zero-padded to at least 2 digits (#01, #02...)
    // — a customer typing "1" for "pedido 1" must still match "#01".
    const code = `#${orderMatch[1].padStart(2, '0')}`;
    const orders = ((await readState<Order[]>(LAVILY_BAKERY_ID, ORDERS_KEY)) ??
      []) as Order[];
    const order = orders.find((o) => o.id === code);
    if (order) {
      await replyTo(
        from,
        `Pedido ${order.id}\nStatus: ${order.status}\nEntrega: ${order.date}\nValor: R$ ${order.value.toFixed(2)}`,
      );
      return;
    }
    await replyTo(
      from,
      `Não encontrei o pedido ${code}. Confira o número e tente de novo.`,
    );
    return;
  }

  await replyTo(
    from,
    `Olá! 👋 Para fazer um pedido, acesse nosso cardápio: ${CARDAPIO_URL}/${LAVILY_BAKERY_ID}/cardapio\n\nPara acompanhar um pedido já feito, envie o número dele (ex.: 01).`,
  );
}

export async function POST(request: Request) {
  const rawBody = await request.text();

  // Fails closed: isValidSignature already returns false when the secret
  // itself isn't configured, so there is no "signature checking is
  // optional" branch here — a missing WHATSAPP_APP_SECRET means every
  // request is rejected, not silently trusted. An unauthenticated caller
  // could otherwise forge a webhook payload and make the bot relay
  // arbitrary text to any phone number via the business's own WhatsApp
  // number, or brute-force order numbers to read another customer's order.
  if (!(await isValidSignature(request, rawBody))) {
    return NextResponse.json({ error: 'invalid_signature' }, { status: 401 });
  }

  const payload = JSON.parse(rawBody) as {
    entry?: {
      changes?: {
        value?: {
          messages?: { from: string; text?: { body: string } }[];
        };
      }[];
    }[];
  };

  const messages =
    payload.entry?.flatMap(
      (entry) =>
        entry.changes?.flatMap((change) => change.value?.messages ?? []) ??
        [],
    ) ?? [];

  for (const message of messages) {
    if (message.text?.body) {
      await handleMessage(message.from, message.text.body);
    }
  }

  return NextResponse.json({ received: true });
}
