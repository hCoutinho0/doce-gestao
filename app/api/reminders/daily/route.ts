import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { isDbConfigured, readState } from '@/lib/db';

type Task = { id: number; text: string; done: boolean; createdAt: string };

// Tarefas pendentes da confeitaria de quem está logado — o aplicativo de
// desktop chama uma vez por dia (8h) com a sessão da janela e monta a
// notificação do Windows.
export async function GET() {
  const session = await auth();
  const bakeryId = session?.user.bakeryId;
  if (!bakeryId) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!isDbConfigured()) {
    return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  }
  const tasks = (await readState<Task[]>(bakeryId, 'doce-tasks')) ?? [];
  const pending = tasks.filter((t) => !t.done).map((t) => t.text);
  return NextResponse.json(
    { pending: pending.length, first: pending[0] ?? null },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
