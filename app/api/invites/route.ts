import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { isDbConfigured } from '@/lib/db';
import { generateInviteCode, listInvitesForBakery, saveInvite } from '@/lib/tenant';
import type { UserRole } from '@/lib/tenant';

// Only an Administrador(a) can invite people into their own confeitaria
// — Produção accounts can't grow the team.
export async function GET() {
  const session = await auth();
  if (!session?.user.bakeryId || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!isDbConfigured()) {
    return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  }
  const invites = await listInvitesForBakery(session.user.bakeryId);
  return NextResponse.json(
    { invites },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user.bakeryId || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!isDbConfigured()) {
    return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  }
  const body = (await request.json()) as { role?: UserRole };
  const role: UserRole = body.role === 'production' ? 'production' : 'admin';

  const invite = {
    code: generateInviteCode(),
    bakeryId: session.user.bakeryId,
    role,
    createdBy: session.user.email ?? '',
    createdAt: new Date().toISOString(),
  };
  await saveInvite(invite);

  return NextResponse.json({ invite });
}
