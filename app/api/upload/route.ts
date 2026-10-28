import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { checkRateLimit } from '@/lib/rateLimit';
import { isStorageConfigured, uploadImage } from '@/lib/storage';

const MAX_SIZE = 4 * 1024 * 1024; // 4 MB
// SVG deliberately excluded: it's XML, and can embed a <script> that runs
// if the raw blob URL is ever opened directly (shared, pasted, opened in a
// new tab) instead of only rendered inside an <img> — a stored-XSS vector
// no product/cardápio photo needs to accept.
const ALLOWED_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

function matchesSignature(data: Buffer, extension: string): boolean {
  if (extension === 'png') {
    return data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  }
  if (extension === 'jpg') return data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;
  if (extension === 'webp') {
    return data.subarray(0, 4).toString('ascii') === 'RIFF' && data.subarray(8, 12).toString('ascii') === 'WEBP';
  }
  return false;
}

export async function POST(request: Request) {
  // Só com login (fotos do cardápio e logotipo): o site é público e o espaço
  // de fotos não pode virar hospedagem de imagens para qualquer pessoa.
  const session = await auth();
  if (!session?.user.email) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!(await checkRateLimit(`upload:${session.user.email}`, 60, 60 * 60 * 1000))) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }
  if (!isStorageConfigured()) {
    return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  }

  const formData = await request.formData();
  const file = formData.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'missing_file' }, { status: 400 });
  }
  const extension = ALLOWED_TYPES[file.type];
  if (!extension) {
    return NextResponse.json({ error: 'unsupported_type' }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: 'file_too_large' }, { status: 413 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  // Confere o conteúdo de verdade (assinatura do arquivo), não só o tipo
  // que o navegador declarou.
  if (!matchesSignature(buffer, extension)) {
    return NextResponse.json({ error: 'unsupported_type' }, { status: 400 });
  }
  const url = await uploadImage(buffer, file.type, extension);

  return NextResponse.json({ url });
}
