import { NextResponse } from 'next/server';

// Identifica a versão publicada no ar: o painel pergunta de tempos em
// tempos e, se mudou, avisa "Nova versão disponível". No Vercel vem do
// commit do deploy; fora dele não há aviso.
export const dynamic = 'force-dynamic';

export function GET() {
  return NextResponse.json(
    { build: process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.VERCEL_DEPLOYMENT_ID ?? 'local' },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
