import { deleteGlobal, listDocs, readGlobal, readState, updateGlobalAtomic, writeGlobal } from '@/lib/db';
import { slugify } from '@/lib/slug';

export type UserRole = 'admin' | 'production';
export type AuthProvider = 'credentials';
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

// Fácil de digitar (8 caracteres de um alfabeto de 32 = 2^40 combinações) e
// de uso único; o admin entrega o convite diretamente para a pessoa.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O, 1/I
export function generateInviteCode(): string {
  // crypto.getRandomValues em vez de Math.random (que é previsível).
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  let code = '';
  for (const byte of bytes) code += CODE_ALPHABET[byte % CODE_ALPHABET.length];
  return code;
}

export function getInvite(code: string): Promise<Invite | null> {
  return readGlobal<Invite>(inviteDocId(code.trim().toUpperCase()));
}

// Marca o convite como usado de forma atômica: se duas pessoas usarem o
// mesmo código ao mesmo tempo, só uma consegue. Devolve o convite ou o
// motivo de não ter dado certo.
export async function claimInvite(
  code: string,
  email: string,
): Promise<{ invite: Invite } | { error: 'invalid_invite' | 'invite_already_used' }> {
  let outcome: { invite: Invite } | { error: 'invalid_invite' | 'invite_already_used' } = {
    error: 'invalid_invite',
  };
  await updateGlobalAtomic<Invite | null>(inviteDocId(code.trim().toUpperCase()), (current) => {
    if (!current) {
      outcome = { error: 'invalid_invite' };
      return current;
    }
    if (current.usedBy) {
      outcome = { error: 'invite_already_used' };
      return current;
    }
    const claimed = { ...current, usedBy: email, usedAt: new Date().toISOString() };
    outcome = { invite: claimed };
    return claimed;
  });
  return outcome;
}

// Apaga um convite que ainda não foi usado (de outra confeitaria ou já
// usado, não mexe). Devolve se apagou.
export async function deleteInvite(code: string, bakeryId: string): Promise<boolean> {
  const invite = await getInvite(code);
  if (!invite || invite.bakeryId !== bakeryId || invite.usedBy) return false;
  await deleteGlobal(inviteDocId(invite.code));
  return true;
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
