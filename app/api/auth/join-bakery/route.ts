import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { isDbConfigured } from '@/lib/db';
import { isValidCpfCnpj } from '@/lib/cpfCnpj';
import { checkRateLimit, clientIp } from '@/lib/rateLimit';
import { claimInvite, getInvite, getUserByEmail, upsertUser } from '@/lib/tenant';
import type { Gender } from '@/lib/tenant';

// The other half of /cadastro: instead of creating a brand-new
// confeitaria, this joins an already-existing one via a single-use
// invite code — no business info to collect, since the confeitaria
// already exists.
export async function POST(request: Request) {
  if (!isDbConfigured()) {
    return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  }
  if (!(await checkRateLimit(`join:${clientIp(request)}`, 8, 60 * 60 * 1000))) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }

  const body = (await request.json()) as {
    email?: string;
    password?: string;
    name?: string;
    cpfCnpj?: string;
    phone?: string;
    gender?: Gender;
    inviteCode?: string;
  };

  const email = body.email?.trim().toLowerCase();
  const name = body.name?.trim();
  const cpfCnpj = body.cpfCnpj?.trim();
  const phone = body.phone?.trim();
  const gender = body.gender === 'M' || body.gender === 'F' ? body.gender : undefined;
  const inviteCode = body.inviteCode?.trim().toUpperCase();

  if (
    !email ||
    !name ||
    !cpfCnpj ||
    !phone ||
    !gender ||
    !inviteCode ||
    !isValidCpfCnpj(cpfCnpj) ||
    email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    name.length > 120 ||
    phone.length > 40
  ) {
    return NextResponse.json({ error: 'invalid_registration' }, { status: 400 });
  }

  // Confere tudo que pode falhar ANTES de gastar o convite.
  const preview = await getInvite(inviteCode);
  if (!preview) {
    return NextResponse.json({ error: 'invalid_invite' }, { status: 404 });
  }
  if (preview.usedBy) {
    return NextResponse.json({ error: 'invite_already_used' }, { status: 409 });
  }
  if (await getUserByEmail(email)) {
    return NextResponse.json({ error: 'email_already_registered' }, { status: 409 });
  }
  if (!body.password || body.password.length < 8 || body.password.length > 200) {
    return NextResponse.json({ error: 'weak_password' }, { status: 400 });
  }
  const passwordHash = await bcrypt.hash(body.password, 12);

  // Agora sim: reserva o convite de forma atômica (só um uso, mesmo com
  // duas pessoas tentando no mesmo instante).
  const claimed = await claimInvite(inviteCode, email);
  if ('error' in claimed) {
    return NextResponse.json(
      { error: claimed.error },
      { status: claimed.error === 'invalid_invite' ? 404 : 409 },
    );
  }
  const { invite } = claimed;

  await upsertUser({
    id: email,
    email,
    name,
    cpfCnpj,
    phone,
    gender,
    bakeryId: invite.bakeryId,
    role: invite.role,
    provider: 'credentials',
    createdAt: new Date().toISOString(),
    passwordHash,
  });

  return NextResponse.json({ ok: true });
}
