import { NextResponse } from 'next/server';
import { isDbConfigured, readState } from '@/lib/db';
import { deleteInvite, getInvite } from '@/lib/tenant';
import { auth } from '@/auth';
import { checkRateLimit, clientIp } from '@/lib/rateLimit';
import type { BakeryProfile } from '@/lib/bakery';

// Public and read-only on purpose — /cadastro checks a typed code before
// the person has any session, to show which confeitaria they're about to
// join (and catch typos) without exposing anything else about it.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  if (!isDbConfigured()) {
    return NextResponse.json({ valid: false }, { status: 503 });
  }
  if (!(await checkRateLimit(`invite-check:${clientIp(request)}`, 30, 60 * 60 * 1000))) {
    return NextResponse.json({ valid: false }, { status: 429 });
  }
  const { code } = await params;
  const invite = await getInvite(code);
  if (!invite || invite.usedBy) {
    return NextResponse.json(
      { valid: false },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }
  const bakery = await readState<BakeryProfile>(
    invite.bakeryId,
    'doce-bakery-profile',
  );
  return NextResponse.json(
    {
      valid: true,
      bakeryName: bakery?.name ?? 'sua confeitaria',
      role: invite.role,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

// Administrador(a) cancela um convite que ainda não foi usado.
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const session = await auth();
  if (!session?.user.bakeryId || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!isDbConfigured()) {
    return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  }
  const { code } = await params;
  const deleted = await deleteInvite(code.slice(0, 32), session.user.bakeryId);
  return deleted
    ? NextResponse.json({ ok: true })
    : NextResponse.json({ error: 'not_found' }, { status: 404 });
}
