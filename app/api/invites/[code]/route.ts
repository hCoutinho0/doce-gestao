import { NextResponse } from 'next/server';
import { isCosmosConfigured, readState } from '@/lib/cosmos';
import { getInvite } from '@/lib/tenant';
import type { BakeryProfile } from '@/lib/bakery';

// Public and read-only on purpose — /cadastro checks a typed code before
// the person has any session, to show which confeitaria they're about to
// join (and catch typos) without exposing anything else about it.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  if (!isCosmosConfigured()) {
    return NextResponse.json({ valid: false }, { status: 503 });
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
