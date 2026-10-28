import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { readableKeys } from '@/lib/dataKeys';
import { isDbConfigured, readStates } from '@/lib/db';

// Leitura em lote para o painel: ao abrir, ele precisa de ~13 documentos.
// Uma ida ao Supabase (em vez de 13) corta cerca de 1 s da abertura.
// Mesmas regras de /api/data/[key]: sessão obrigatória, só chaves conhecidas,
// e chave de admin é omitida (volta null) para a conta "Produção".
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user.bakeryId) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!isDbConfigured()) {
    return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  }
  const requested = (new URL(request.url).searchParams.get('keys') ?? '')
    .split(',')
    .map((k) => k.trim());
  const keys = readableKeys(requested, session.user.role).slice(0, 30);
  const found = await readStates(session.user.bakeryId, keys);
  return NextResponse.json(
    { values: Object.fromEntries(keys.map((k) => [k, found[k] ?? null])) },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
