import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { isCosmosConfigured, readState, writeState } from '@/lib/cosmos';

type PushSubscriptionRecord = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

const SUBSCRIPTIONS_KEY = 'doce-push-subscriptions';

// Kept out of the generic /api/data/[key] store on purpose: subscriptions
// are added and removed one at a time, from whichever device the admin is
// using — a full-array PUT of a stale client snapshot (the same class of
// bug already found and fixed for loyalty this session) would silently
// drop a subscription added from another device in between.
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

  const existing =
    (await readState<PushSubscriptionRecord[]>(bakeryId, SUBSCRIPTIONS_KEY)) ?? [];
  const withoutDuplicate = existing.filter(
    (s) => s.endpoint !== subscription.endpoint,
  );
  await writeState(bakeryId, SUBSCRIPTIONS_KEY, [
    ...withoutDuplicate,
    subscription,
  ]);

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

  const existing =
    (await readState<PushSubscriptionRecord[]>(bakeryId, SUBSCRIPTIONS_KEY)) ?? [];
  await writeState(
    bakeryId,
    SUBSCRIPTIONS_KEY,
    existing.filter((s) => s.endpoint !== body.endpoint),
  );

  return NextResponse.json({ ok: true });
}
