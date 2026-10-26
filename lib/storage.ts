import { isDbConfigured, supabaseHeaders, supabaseUrl } from '@/lib/db';

// Fotos do cardápio e logotipos — ficam no Storage do Supabase, num bucket
// público chamado "fotos" (criado pelo supabase/setup.sql). O app guarda o
// endereço público da foto, então os dois computadores enxergam as mesmas.

const BUCKET = 'fotos';

export function isStorageConfigured(): boolean {
  return isDbConfigured();
}

export async function uploadImage(
  file: Buffer,
  contentType: string,
  extension: string,
): Promise<string> {
  const name = `${crypto.randomUUID()}.${extension}`;
  const base = supabaseUrl();
  const response = await fetch(`${base}/storage/v1/object/${BUCKET}/${name}`, {
    method: 'POST',
    headers: supabaseHeaders({ 'Content-Type': contentType, 'x-upsert': 'false' }),
    body: new Uint8Array(file),
    signal: AbortSignal.timeout(60000),
  });
  if (!response.ok) {
    throw new Error(`upload_failed ${response.status}: ${await response.text()}`);
  }
  return `${base}/storage/v1/object/public/${BUCKET}/${name}`;
}
