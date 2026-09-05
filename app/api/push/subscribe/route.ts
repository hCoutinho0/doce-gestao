import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { isCosmosConfigured, updateStateAtomic } from '@/lib/cosmos';

type PushSubscriptionRecord = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

const SUBSCRIPTIONS_KEY = 'doce-push-subscriptions';

// Kept out of the generic /api/data/[key] store on purpose: subscriptions
// are added and removed one at a time, from whichever device the admin is
// using. updateStateAtomic (not readState+writeState) closes the same
// class of bug already found and fixed for loyalty this session — two
// devices subscribing near-simultaneously, or the daily reminder cron
// pruning an expired subscription at the same moment a new one is added,
// must not let one write silently erase the other.
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user.bakeryId) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!isCosmosConfigured()) {
    return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  }
  const bakeryId = session.user.bakeryId;
  const body = (await request.json()) as { subscription?: PushSubscriptionRecord };
  const subscription = body.subscription;
  if (!subscription?.endpoint || !subscription.keys?.p256dh || !subscription.keys?.auth) {
    return NextResponse.json({ error: 'invalid_subscription' }, { status: 400 });
  }

  await updateStateAtomic<PushSubscriptionRecord[]>(
    bakeryId,
    SUBSCRIPTIONS_KEY,
    (current) => [
      ...(current ?? []).filter((s) => s.endpoint !== subscription.endpoint),
      subscription,
    ],
  );

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const session = await auth();
  if (!session?.user.bakeryId) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!isCosmosConfigured()) {
    return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  }
  const bakeryId = session.user.bakeryId;
  const body = (await request.json()) as { endpoint?: string };
  if (!body.endpoint) {
    return NextResponse.json({ error: 'invalid_endpoint' }, { status: 400 });
  }

  await updateStateAtomic<PushSubscriptionRecord[]>(
    bakeryId,
    SUBSCRIPTIONS_KEY,
    (current) => (current ?? []).filter((s) => s.endpoint !== body.endpoint),
  );

  return NextResponse.json({ ok: true });
}
