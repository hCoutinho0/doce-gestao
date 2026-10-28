import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { isDbConfigured, listDocs } from '@/lib/db';

type Doc = { id: string; value: unknown };

// Cópia de segurança de uma confeitaria: todos os documentos dela e as
// contas ligadas a ela. Só o administrador logado, e só da própria
// confeitaria — nunca dados de outras. O aplicativo de desktop chama esta
// rota com a sessão da janela para o backup diário (e o menu da conta a
// oferece como download).
export async function GET() {
  const session = await auth();
  const bakeryId = session?.user.bakeryId;
  if (!bakeryId || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!isDbConfigured()) {
    return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  }
  const [own, users] = await Promise.all([
    listDocs<unknown>({ startsWith: `${bakeryId}:` }),
    listDocs<{ bakeryId?: string | null }>({ startsWith: 'user:' }),
  ]);
  const docs: Doc[] = [...own, ...users.filter((u) => u.value?.bakeryId === bakeryId)];
  return NextResponse.json(
    { exportedAt: new Date().toISOString(), bakeryId, docs },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
