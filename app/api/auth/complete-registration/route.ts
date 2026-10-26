import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { auth } from '@/auth';
import { isDbConfigured, writeState } from '@/lib/db';
import { isValidCpfCnpj } from '@/lib/cpfCnpj';
import { checkRateLimit, clientIp } from '@/lib/rateLimit';
import { isValidSlugFormat } from '@/lib/slug';
import {
  bakeryIdAvailable,
  generateBakeryId,
  getUserByEmail,
  upsertUser,
} from '@/lib/tenant';
import type { AuthProvider, Gender } from '@/lib/tenant';
import type { BakeryProfile } from '@/lib/bakery';

// The one-shot form submission at the end of /cadastro: creates the
// account record and the confeitaria's profile together, so an abandoned
// wizard never leaves a half-created user with no bakery attached.
export async function POST(request: Request) {
  if (!isDbConfigured()) {
    return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  }
  if (!(await checkRateLimit(`signup:${clientIp(request)}`, 5, 60 * 60 * 1000))) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }

  const body = (await request.json()) as {
    provider?: AuthProvider;
    email?: string;
    password?: string;
    name?: string;
    cpfCnpj?: string;
    phone?: string;
    gender?: Gender;
    bakery?: Partial<BakeryProfile>;
    bakeryId?: string;
  };

  const provider = body.provider;
  const email = body.email?.trim().toLowerCase();
  const name = body.name?.trim();
  const cpfCnpj = body.cpfCnpj?.trim();
  const phone = body.phone?.trim();
  const gender = body.gender === 'M' || body.gender === 'F' ? body.gender : undefined;
  const bakeryName = body.bakery?.name?.trim();

  if (
    !provider ||
    !email ||
    !name ||
    !cpfCnpj ||
    !phone ||
    !gender ||
    !bakeryName ||
    !isValidCpfCnpj(cpfCnpj)
  ) {
    return NextResponse.json({ error: 'invalid_registration' }, { status: 400 });
  }

  const existingUser = await getUserByEmail(email);
  if (existingUser) {
    return NextResponse.json({ error: 'email_already_registered' }, { status: 409 });
  }

  let passwordHash: string | undefined;
  if (provider === 'credentials') {
    if (!body.password || body.password.length < 8) {
      return NextResponse.json({ error: 'weak_password' }, { status: 400 });
    }
    passwordHash = await bcrypt.hash(body.password, 12);
  } else {
    // Google/Microsoft: only the person who actually owns that email (the
    // one currently signed in with it) can register a confeitaria under it.
    const session = await auth();
    if (!session?.user.email || session.user.email.toLowerCase() !== email) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
  }

  // The slug picked (or confirmed) on /cadastro before this request ever
  // fires — re-validated here rather than trusted outright, since it's
  // also what a request that skips the wizard entirely would send. Only
  // falls back to auto-generating one when the client genuinely didn't
  // send a candidate at all.
  const requestedSlug = body.bakeryId?.trim().toLowerCase();
  let bakeryId: string;
  if (requestedSlug) {
    if (!isValidSlugFormat(requestedSlug)) {
      return NextResponse.json({ error: 'invalid_slug' }, { status: 400 });
    }
    if (!(await bakeryIdAvailable(requestedSlug))) {
      return NextResponse.json({ error: 'slug_taken' }, { status: 409 });
    }
    bakeryId = requestedSlug;
  } else {
    bakeryId = await generateBakeryId(bakeryName);
  }
  const profile: BakeryProfile = {
    name: bakeryName,
    legalName: body.bakery?.legalName?.trim() || bakeryName,
    founded: body.bakery?.founded?.trim() || '',
    teamSize: body.bakery?.teamSize?.trim() || '',
    phone: body.bakery?.phone?.trim() || phone,
    city: body.bakery?.city?.trim() || '',
    specialty: body.bakery?.specialty?.trim() || '',
    salesModel: body.bakery?.salesModel?.trim() || '',
    icon: body.bakery?.icon?.trim() || '🧁',
    logo: body.bakery?.logo?.trim() || '',
    ...(body.bakery?.whatsapp?.trim()
      ? { whatsapp: body.bakery.whatsapp.trim() }
      : {}),
    ...(body.bakery?.instagram?.trim()
      ? { instagram: body.bakery.instagram.trim() }
      : {}),
    ...(body.bakery?.tiktok?.trim() ? { tiktok: body.bakery.tiktok.trim() } : {}),
  };
  await writeState(bakeryId, 'doce-bakery-profile', profile);

  await upsertUser({
    id: email,
    email,
    name,
    cpfCnpj,
    phone,
    gender,
    bakeryId,
    role: 'admin',
    provider,
    createdAt: new Date().toISOString(),
    ...(passwordHash ? { passwordHash } : {}),
  });

  return NextResponse.json({ ok: true });
}
