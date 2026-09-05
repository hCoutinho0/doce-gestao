import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import webPush from 'web-push';
import {
  isCosmosConfigured,
  queryDocsWithIds,
  readState,
  updateStateAtomic,
} from '@/lib/cosmos';

type Task = { id: number; text: string; done: boolean; createdAt: string };
type PushSubscriptionRecord = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

const TASKS_SUFFIX = ':doce-tasks';
const SUBSCRIPTIONS_KEY = 'doce-push-subscriptions';

function isConfigured(): boolean {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

// Constant-time comparison — this secret gates a route that can read every
// confeitaria's task list and trigger a push send to their subscribed
// devices, so a plain `!==` (which short-circuits on the first differing
// byte) leaking a few nanoseconds of timing signal per guess is worth
// closing even though it's a hard attack to pull off over the network.
function isValidSecret(provided: string | null): boolean {
  const secret = process.env.REMINDER_CRON_SECRET;
  if (!secret || !provided) return false;
  const providedBuf = Buffer.from(provided);
  const secretBuf = Buffer.from(secret);
  return (
    providedBuf.length === secretBuf.length &&
    crypto.timingSafeEqual(providedBuf, secretBuf)
  );
}

// Called once a day by a scheduled GitHub Actions workflow (see
// .github/workflows/daily-reminder.yml) — never by a browser, hence the
// shared-secret header instead of a user session. Walks every
// confeitaria's `{bakeryId}:doce-tasks` document (via the same
// cross-partition query pattern used to list invites) rather than
// requiring a separate registry of which confeitarias exist.
export async function POST(request: Request) {
  if (!isValidSecret(request.headers.get('X-Reminder-Secret'))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!isCosmosConfigured() || !isConfigured()) {
    return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  }

  webPush.setVapidDetails(
    'mailto:contato@confeitto.com.br',
    process.env.VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  );

  const taskDocs = await queryDocsWithIds<Task[]>(
    'SELECT * FROM c WHERE ENDSWITH(c.id, @suffix)',
    [{ name: '@suffix', value: TASKS_SUFFIX }],
  );

  let notified = 0;
  for (const doc of taskDocs) {
    const pending = (doc.value ?? []).filter((t) => !t.done);
    if (pending.length === 0) continue;
    const bakeryId = doc.id.slice(0, -TASKS_SUFFIX.length);

    const subscriptions =
      (await readState<PushSubscriptionRecord[]>(bakeryId, SUBSCRIPTIONS_KEY)) ??
      [];
    if (subscriptions.length === 0) continue;

    const payload = JSON.stringify({
      title: 'Tarefas pendentes',
      body:
        pending.length === 1
          ? `Você tem 1 tarefa pendente: ${pending[0].text}`
          : `Você tem ${pending.length} tarefas pendentes.`,
    });

    const stillValid: PushSubscriptionRecord[] = [];
    for (const subscription of subscriptions) {
      try {
        await webPush.sendNotification(subscription, payload);
        stillValid.push(subscription);
        notified += 1;
      } catch (error) {
        const statusCode = (error as { statusCode?: number }).statusCode;
        if (statusCode !== 404 && statusCode !== 410) {
          stillValid.push(subscription);
        }
        // 404/410 means the browser dropped this subscription — drop it
        // here too instead of retrying it forever.
      }
    }
    if (stillValid.length !== subscriptions.length) {
      const expired = new Set(
        subscriptions
          .filter((s) => !stillValid.includes(s))
          .map((s) => s.endpoint),
      );
      // updateStateAtomic, not a plain write of `stillValid` — that stale
      // snapshot was read before this loop started, so a subscribe/
      // unsubscribe request landing in the meantime would get silently
      // undone by this cleanup. Re-derive "drop the expired ones" against
      // whatever is current instead.
      await updateStateAtomic<PushSubscriptionRecord[]>(
        bakeryId,
        SUBSCRIPTIONS_KEY,
        (current) => (current ?? []).filter((s) => !expired.has(s.endpoint)),
      );
    }
  }

  return NextResponse.json({ ok: true, notified });
}
