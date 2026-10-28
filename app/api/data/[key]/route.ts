import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { ADMIN_ONLY_KEYS, ALLOWED_KEYS } from '@/lib/dataKeys';
import {
  isDbConfigured,
  readStateVersioned,
  writeState,
  writeStateIfVersion,
} from '@/lib/db';

// The public cardápio (no login) needs the published menu and the bakery's
// branding to render at all — everything else is internal panel data. Each
// confeitaria's own /{bakeryId}/cardapio passes its bakeryId explicitly via
// query string (obrigatório — sem fallback para nenhuma confeitaria fixa).
const PUBLIC_READ_KEYS = new Set(['doce-menu', 'doce-bakery-profile', 'doce-menu-periodo']);

const MAX_BODY_CHARS = 5_000_000;

// O que o cardápio público pode ver do perfil: só a vitrine. Razão social,
// telefone interno, fundação, tamanho da equipe etc. ficam no painel.
const PUBLIC_PROFILE_FIELDS = [
  'name',
  'icon',
  'logo',
  'city',
  'specialty',
  'salesModel',
  'whatsapp',
  'instagram',
  'tiktok',
] as const;

function publicView(key: string, value: unknown): unknown {
  if (key !== 'doce-bakery-profile' || !value || typeof value !== 'object') return value;
  const profile = value as Record<string, unknown>;
  return Object.fromEntries(
    PUBLIC_PROFILE_FIELDS.filter((f) => profile[f] !== undefined).map((f) => [f, profile[f]]),
  );
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key } = await params;
  if (!ALLOWED_KEYS.has(key)) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  let bakeryId: string;
  if (PUBLIC_READ_KEYS.has(key)) {
    // The public cardápio also reads these three keys, anonymously, and
    // expects the confeitaria it's asking about — it must never shift to
    // whatever confeitaria the browser's session cookie belongs to. Only a
    // request explicitly marked as coming from the admin panel
    // (X-Panel-Request) resolves to the signed-in user's own confeitaria.
    if (request.headers.get('X-Panel-Request')) {
      const session = await auth();
      if (!session?.user.bakeryId) {
        return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
      }
      bakeryId = session.user.bakeryId;
    } else {
      const { searchParams } = new URL(request.url);
      const requested = searchParams.get('bakeryId')?.trim();
      if (!requested || requested.length > 64) {
        return NextResponse.json({ error: 'missing_bakery' }, { status: 400 });
      }
      bakeryId = requested;
    }
  } else {
    const session = await auth();
    if (!session?.user.bakeryId) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
    if (ADMIN_ONLY_KEYS.has(key) && session.user.role !== 'admin') {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }
    bakeryId = session.user.bakeryId;
  }
  if (!isDbConfigured()) {
    return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  }
  const isPanel = !PUBLIC_READ_KEYS.has(key) || Boolean(request.headers.get('X-Panel-Request'));
  const { value: stored, version } = await readStateVersioned(bakeryId, key);
  const value = isPanel ? stored : publicView(key, stored);
  // The same URL can legitimately answer with a different confeitaria's
  // data depending on the session cookie and the X-Panel-Request header —
  // neither of which a shared cache (browser, CDN) necessarily keys on. A
  // cached response here would risk serving one confeitaria's data to
  // another, so every response is explicitly marked as never cacheable.
  return NextResponse.json(
    isPanel ? { value, version } : { value },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key } = await params;
  if (!ALLOWED_KEYS.has(key)) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  // Writing always requires a real session with a confeitaria attached —
  // the public cardápio can read the menu/branding but only the signed-in
  // panel can change them.
  const session = await auth();
  if (!session?.user.bakeryId) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (ADMIN_ONLY_KEYS.has(key) && session.user.role !== 'admin') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  if (!isDbConfigured()) {
    return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  }
  // Limite de tamanho: nenhum documento legítimo chega perto disso, e sem
  // teto uma conta (ou um script com o cookie dela) enche o banco de graça.
  const raw = await request.text();
  if (raw.length > MAX_BODY_CHARS) {
    return NextResponse.json({ error: 'too_large' }, { status: 413 });
  }
  let body: { value: unknown; version?: unknown };
  try {
    body = JSON.parse(raw) as { value: unknown; version?: unknown };
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  // Com `version` (o painel sempre manda): só grava se ninguém mexeu no
  // documento desde a leitura; senão 409 com o que está no banco agora, para
  // o painel mesclar e tentar de novo. Sem `version`: grava direto (tela de
  // configuração inicial, onde não há o que conflitar).
  if (body.version !== undefined) {
    if (!Number.isInteger(body.version) || (body.version as number) < 0) {
      return NextResponse.json({ error: 'invalid_version' }, { status: 400 });
    }
    const result = await writeStateIfVersion(
      session.user.bakeryId,
      key,
      body.value,
      body.version as number,
    );
    return result.ok
      ? NextResponse.json({ ok: true, version: result.version })
      : NextResponse.json(
          { error: 'conflict', value: result.value, version: result.version },
          { status: 409 },
        );
  }
  await writeState(session.user.bakeryId, key, body.value);
  return NextResponse.json({ ok: true });
}
