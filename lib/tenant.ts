import { listDocs, readGlobal, readState, writeGlobal } from '@/lib/db';
import { slugify } from '@/lib/slug';

export type UserRole = 'admin' | 'production';
export type AuthProvider = 'microsoft-entra-id' | 'google' | 'credentials';
export type Gender = 'M' | 'F';

export type PlatformUser = {
  id: string; // normalized email
  email: string;
  name: string;
  passwordHash?: string; // only set for the 'credentials' provider
  cpfCnpj: string;
  phone: string;
  gender?: Gender;
  bakeryId: string;
  role: UserRole;
  provider: AuthProvider;
  createdAt: string;
};

function userDocId(email: string): string {
  return `user:${email.trim().toLowerCase()}`;
}

export function getUserByEmail(email: string): Promise<PlatformUser | null> {
  return readGlobal<PlatformUser>(userDocId(email));
}

export function upsertUser(user: PlatformUser): Promise<void> {
  return writeGlobal(userDocId(user.email), user);
}

// A bakeryId is also the prefix every one of a confeitaria's documents
// gets in the local database (`${bakeryId}:doce-orders`, etc) — same string as the
// slug in its public link, `confeitto.com.br/{bakeryId}`.
export function bakeryIdAvailable(bakeryId: string): Promise<boolean> {
  return readState(bakeryId, 'doce-bakery-profile').then((v) => v === null);
}

// Last-resort fallback for a request that skips the slug picked on
// /cadastro (a stale client, a direct API call) — never the normal path
// anymore, since the wizard now blocks on a confirmed-available slug
// before it gets here. Appends the smallest numeric suffix that's free
// instead of random gibberish, so the fallback link still reads cleanly.
export async function generateBakeryId(name: string): Promise<string> {
  const base = slugify(name) || 'confeitaria';
  if (await bakeryIdAvailable(base)) return base;
  for (let n = 2; n < 1000; n++) {
    const candidate = `${base}-${n}`;
    if (await bakeryIdAvailable(candidate)) return candidate;
  }
  return `${base}-${Math.random().toString(36).slice(2, 6)}`;
}

export type Invite = {
  code: string;
  bakeryId: string;
  role: UserRole;
  createdBy: string;
  createdAt: string;
  usedBy?: string;
  usedAt?: string;
};

function inviteDocId(code: string): string {
  return `invite:${code}`;
}

// Human-typeable, not cryptographically hard to guess — that's fine,
// since a code only works once and the confeitaria's admin hands it out
// directly (like a Discord invite), not something posted publicly.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O, 1/I
export function generateInviteCode(): string {
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return code;
}

export function getInvite(code: string): Promise<Invite | null> {
  return readGlobal<Invite>(inviteDocId(code.trim().toUpperCase()));
}

export function saveInvite(invite: Invite): Promise<void> {
  return writeGlobal(inviteDocId(invite.code), invite);
}

export async function listInvitesForBakery(bakeryId: string): Promise<Invite[]> {
  const docs = await listDocs<Invite>({ startsWith: 'invite:' });
  return docs
    .map((d) => d.value)
    .filter((invite) => invite.bakeryId === bakeryId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
