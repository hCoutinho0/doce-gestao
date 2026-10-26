import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { listDocs, purgeExpired } from '@/lib/db';

type Task = { id: number; text: string; done: boolean; createdAt: string };

const TASKS_SUFFIX = ':doce-tasks';

// Comparação em tempo constante do segredo interno que o aplicativo
// (electron/main.cjs) gera a cada abertura e passa ao servidor local —
// só o próprio app consegue chamar esta rota.
function isValidSecret(provided: string | null): boolean {
  const secret = process.env.CONFEITTO_INTERNAL_SECRET;
  if (!secret || !provided) return false;
  const providedBuf = Buffer.from(provided);
  const secretBuf = Buffer.from(secret);
  return (
    providedBuf.length === secretBuf.length &&
    crypto.timingSafeEqual(providedBuf, secretBuf)
  );
}

// Chamada pelo aplicativo uma vez por dia (8h) para montar a notificação do
// Windows com as tarefas pendentes — substitui o Web Push + GitHub Actions
// da versão hospedada no Azure.
export async function GET(request: Request) {
  if (!isValidSecret(request.headers.get('X-Confeitto-Secret'))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  // Aproveita a chamada diária para limpar limites de tentativa vencidos.
  await purgeExpired().catch(() => undefined);

  const taskDocs = await listDocs<Task[]>({ endsWith: TASKS_SUFFIX });
  const pending: string[] = [];
  for (const doc of taskDocs) {
    for (const task of doc.value ?? []) {
      if (!task.done) pending.push(task.text);
    }
  }

  return NextResponse.json({ pending: pending.length, first: pending[0] ?? null });
}
