import { NextResponse } from 'next/server';
import { isDbConfigured, readState } from '@/lib/db';
import { maskName, normalizePhone } from '@/lib/phone';
import { checkRateLimit, clientIp } from '@/lib/rateLimit';

type Customer = {
  id: number;
  name: string;
  phone: string;
  birthday?: string;
  stamps: number;
};

// Cardápio público: ao digitar o celular, confere se a pessoa já é
// cliente para não pedir os dados de novo (nem criar um cadastro
// duplicado). Responde só o mínimo — primeiro nome + inicial, selos e se
// já tem aniversário salvo —, nunca o nome completo, a data ou o telefone,
// e com limite por IP para ninguém varrer números.
export async function GET(request: Request) {
  if (!isDbConfigured()) {
    return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  }
  if (!(await checkRateLimit(`lookup:${clientIp(request)}`, 30, 60 * 60 * 1000))) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }
  const { searchParams } = new URL(request.url);
  const bakeryId = searchParams.get('bakeryId')?.trim();
  const phone = normalizePhone(searchParams.get('phone'));
  if (!bakeryId || bakeryId.length > 64) {
    return NextResponse.json({ error: 'missing_bakery' }, { status: 400 });
  }
  if (!phone) {
    return NextResponse.json({ error: 'invalid_phone' }, { status: 400 });
  }
  const customers = (await readState<Customer[]>(bakeryId, 'doce-loyalty')) ?? [];
  const match = customers.find((c) => normalizePhone(c.phone) === phone);
  return NextResponse.json(
    match
      ? {
          found: true,
          name: maskName(match.name),
          stamps: match.stamps ?? 0,
          hasBirthday: Boolean(match.birthday),
        }
      : { found: false },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
