import { NextResponse } from 'next/server';
import { isDbConfigured, supabaseUrl } from '@/lib/db';

// Endereços antigos (/api/media/…) agora apontam para a foto no Storage do
// Supabase. Novos uploads já gravam o endereço do Supabase direto.
const SAFE_NAME = /^[0-9a-f-]{36}\.(png|jpg|webp)$/;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  const { name } = await params;
  if (!SAFE_NAME.test(name) || !isDbConfigured()) {
    return new Response('Not found', { status: 404 });
  }
  return NextResponse.redirect(
    `${supabaseUrl()}/storage/v1/object/public/fotos/${name}`,
    308,
  );
}
