import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { exportAll } from '@/lib/db';

// Só o próprio aplicativo (electron/main.cjs) chama esta rota, com o segredo
// interno que ele gera a cada abertura. Devolve todos os documentos do
// Supabase para o backup diário guardado no computador.
function isValidSecret(provided: string | null): boolean {
  const secret = process.env.CONFEITTO_INTERNAL_SECRET;
  if (!secret || !provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function GET(request: Request) {
  if (!isValidSecret(request.headers.get('X-Confeitto-Secret'))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const docs = await exportAll();
  return NextResponse.json({ exportedAt: new Date().toISOString(), docs });
}
