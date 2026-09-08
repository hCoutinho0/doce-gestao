import { NextResponse } from 'next/server';
import { auth } from '@/auth';
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

// Only the signed-in panel (admin/production) can upload photos — the
// public cardápio only ever reads the resulting URLs, never writes here.
export async function POST(request: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
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
  const url = await uploadImage(buffer, file.type, extension);

  return NextResponse.json({ url });
}
