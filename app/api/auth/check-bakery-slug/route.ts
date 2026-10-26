import { NextResponse } from 'next/server';
import { isDbConfigured } from '@/lib/db';
import { checkRateLimit, clientIp } from '@/lib/rateLimit';
import { isValidSlugFormat, RESERVED_SLUGS } from '@/lib/slug';
import { bakeryIdAvailable } from '@/lib/tenant';

// Public and read-only on purpose — /cadastro checks a slug before the
// account exists, same as /api/invites/[code]. Only ever confirms
// availability, never anything about who owns a taken one.
export async function GET(request: Request) {
  if (!isDbConfigured()) {
    return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  }
  if (!(await checkRateLimit(`slug-check:${clientIp(request)}`, 30, 60 * 1000))) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }
  const { searchParams } = new URL(request.url);
  const slug = (searchParams.get('slug') ?? '').trim().toLowerCase();

  if (!isValidSlugFormat(slug)) {
    return NextResponse.json(
      {
        available: false,
        reason: RESERVED_SLUGS.has(slug) ? 'reserved' : 'invalid_format',
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const available = await bakeryIdAvailable(slug);
  return NextResponse.json(
    { available, ...(available ? {} : { reason: 'taken' }) },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
