import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { auth } from '@/auth';
import { isDbConfigured } from '@/lib/db';
import { checkRateLimit } from '@/lib/rateLimit';
import { getUserByEmail, upsertUser } from '@/lib/tenant';

// Troca de senha de quem já está logado. Exige a senha atual (um computador
// esquecido aberto não basta para tomar a conta). Depois da troca, as outras
// sessões abertas caem sozinhas (passwordChangedAt, conferido em auth.ts).
export async function POST(request: Request) {
  const session = await auth();
  const email = session?.user.email?.toLowerCase();
  if (!email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!isDbConfigured()) return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  if (!(await checkRateLimit(`password:${email}`, 5, 15 * 60 * 1000))) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }

  const body = (await request.json().catch(() => ({}))) as { current?: string; next?: string };
  const current = typeof body.current === 'string' ? body.current : '';
  const next = typeof body.next === 'string' ? body.next : '';
  if (next.length < 8 || next.length > 200 || current.length > 200) {
    return NextResponse.json({ error: 'weak_password' }, { status: 400 });
  }

  const user = await getUserByEmail(email);
  if (!user?.passwordHash || !(await bcrypt.compare(current, user.passwordHash))) {
    return NextResponse.json({ error: 'wrong_password' }, { status: 403 });
  }
  await upsertUser({
    ...user,
    passwordHash: await bcrypt.hash(next, 12),
    passwordChangedAt: Date.now(),
  });
  return NextResponse.json({ ok: true });
}
