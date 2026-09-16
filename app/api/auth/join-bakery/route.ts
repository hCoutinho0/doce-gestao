import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { auth } from '@/auth';
import { isCosmosConfigured } from '@/lib/cosmos';
import { isValidCpfCnpj } from '@/lib/cpfCnpj';
import { checkRateLimit, clientIp } from '@/lib/rateLimit';
import { getInvite, getUserByEmail, saveInvite, upsertUser } from '@/lib/tenant';
import type { AuthProvider, Gender } from '@/lib/tenant';

// The other half of /cadastro: instead of creating a brand-new
// confeitaria, this joins an already-existing one via a single-use
// invite code — no business info to collect, since the confeitaria
// already exists.
export async function POST(request: Request) {
  if (!isCosmosConfigured()) {
    return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  }
  if (!(await checkRateLimit(`join:${clientIp(request)}`, 8, 60 * 60 * 1000))) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }

  const body = (await request.json()) as {
    provider?: AuthProvider;
    email?: string;
    password?: string;
    name?: string;
    cpfCnpj?: string;
    phone?: string;
    gender?: Gender;
    inviteCode?: string;
  };

  const provider = body.provider;
  const email = body.email?.trim().toLowerCase();
  const name = body.name?.trim();
  const cpfCnpj = body.cpfCnpj?.trim();
  const phone = body.phone?.trim();
  const gender = body.gender === 'M' || body.gender === 'F' ? body.gender : undefined;
  const inviteCode = body.inviteCode?.trim().toUpperCase();

  if (
    !provider ||
    !email ||
    !name ||
    !cpfCnpj ||
    !phone ||
    !gender ||
    !inviteCode ||
    !isValidCpfCnpj(cpfCnpj)
  ) {
    return NextResponse.json({ error: 'invalid_registration' }, { status: 400 });
  }

  const invite = await getInvite(inviteCode);
  if (!invite) {
    return NextResponse.json({ error: 'invalid_invite' }, { status: 404 });
  }
  if (invite.usedBy) {
    return NextResponse.json({ error: 'invite_already_used' }, { status: 409 });
  }

  const existingUser = await getUserByEmail(email);
  if (existingUser) {
    return NextResponse.json({ error: 'email_already_registered' }, { status: 409 });
  }

  let passwordHash: string | undefined;
  if (provider === 'credentials') {
    if (!body.password || body.password.length < 8) {
      return NextResponse.json({ error: 'weak_password' }, { status: 400 });
    }
    passwordHash = await bcrypt.hash(body.password, 12);
  } else {
    const session = await auth();
    if (!session?.user.email || session.user.email.toLowerCase() !== email) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
  }

  await upsertUser({
    id: email,
    email,
    name,
    cpfCnpj,
    phone,
    gender,
    bakeryId: invite.bakeryId,
    role: invite.role,
    provider,
    createdAt: new Date().toISOString(),
    ...(passwordHash ? { passwordHash } : {}),
  });

  await saveInvite({
    ...invite,
    usedBy: email,
    usedAt: new Date().toISOString(),
  });

  return NextResponse.json({ ok: true });
}
