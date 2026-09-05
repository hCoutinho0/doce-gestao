import { NextResponse } from 'next/server';
import webPush from 'web-push';
import {
  isCosmosConfigured,
  queryDocsWithIds,
  readState,
  writeState,
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

// Called once a day by a scheduled GitHub Actions workflow (see
// .github/workflows/daily-reminder.yml) — never by a browser, hence the
// shared-secret header instead of a user session. Walks every
// confeitaria's `{bakeryId}:doce-tasks` document (via the same
// cross-partition query pattern used to list invites) rather than
// requiring a separate registry of which confeitarias exist.
export async function POST(request: Request) {
  const secret = process.env.REMINDER_CRON_SECRET;
  if (!secret || request.headers.get('X-Reminder-Secret') !== secret) {
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
      await writeState(bakeryId, SUBSCRIPTIONS_KEY, stillValid);
    }
  }

  return NextResponse.json({ ok: true, notified });
}
