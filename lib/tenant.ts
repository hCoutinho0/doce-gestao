import { queryDocs, readGlobal, writeGlobal } from '@/lib/cosmos';

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

// Turns a confeitaria name into a short, stable, URL-safe id — the prefix
// every one of its documents gets in Cosmos (`${bakeryId}:doce-orders`,
// etc). A random suffix keeps two confeitarias with the same name apart.
function stripDiacritics(value: string): string {
  return Array.from(value.normalize('NFD'))
    .filter((char) => {
      const code = char.codePointAt(0) ?? 0;
      return code < 0x300 || code > 0x36f; // combining marks block
    })
    .join('');
}

export function generateBakeryId(name: string): string {
  const slug = stripDiacritics(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 40);
  const suffix = Math.random().toString(36).slice(2, 6);
  return `${slug || 'confeitaria'}-${suffix}`;
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

export function listInvitesForBakery(bakeryId: string): Promise<Invite[]> {
  return queryDocs<Invite>(
    // `value` is a reserved word in Cosmos SQL (as in `SELECT VALUE`) — a
    // dotted c.value.x path is silently rejected ("One of the input
    // values is invalid"), so the property must be bracket-escaped.
    'SELECT * FROM c WHERE STARTSWITH(c.id, \'invite:\') AND c["value"]["bakeryId"] = @bakeryId ORDER BY c["value"]["createdAt"] DESC',
    [{ name: '@bakeryId', value: bakeryId }],
  );
}
