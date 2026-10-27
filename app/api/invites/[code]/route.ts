import { NextResponse } from 'next/server';
import { isDbConfigured, readState } from '@/lib/db';
import { getInvite } from '@/lib/tenant';
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
